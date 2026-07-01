import { useAuthStore } from '../stores/authStore';
import { getApiUrl } from '../config';

interface RequestConfig extends RequestInit {
  requireAuth?: boolean;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: unknown) {
    super(formatApiErrorMessage(message));
  }
}

export function formatApiErrorMessage(value: unknown, fallback = 'Request failed'): string {
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map(item => formatApiErrorMessage(item, ''))
      .filter(Boolean);
    return messages.length ? messages.join('; ') : fallback;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested = record.detail ?? record.message ?? record.error;
    if (nested !== undefined && nested !== value) {
      return formatApiErrorMessage(nested, fallback);
    }

    if (typeof record.msg === 'string') {
      const location = Array.isArray(record.loc)
        ? record.loc.filter(item => item !== 'body').join('.')
        : '';
      return location ? `${location}: ${record.msg}` : record.msg;
    }

    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }

  return value == null ? fallback : String(value);
}

export function getErrorMessage(error: unknown, fallback = 'Request failed'): string {
  return error instanceof Error
    ? formatApiErrorMessage(error.message, fallback)
    : formatApiErrorMessage(error, fallback);
}

const handleUnauthorized = () => {
  useAuthStore.getState().logout();
  window.location.href = '/';
};

export async function apiClient(
  endpoint: keyof typeof import('../config').default['API_ENDPOINTS'] | string,
  config: RequestConfig = {}
) {
  const { token } = useAuthStore.getState();
  const { requireAuth = true, timeoutMs, ...customConfig } = config;

  // Check if we're sending FormData
  const isFormData = customConfig.body instanceof FormData;
  
  const headers = new Headers({
    // Only set Content-Type for non-FormData requests
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...customConfig.headers,
  });

  if (requireAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(
      getApiUrl(endpoint),
      {
        ...customConfig,
        headers,
        signal: controller?.signal || customConfig.signal,
      }
    );
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. Please try again.');
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Directed to login page if token is expired (aka unauthorized)
    if (response.status === 401) {
      if (requireAuth) {
        handleUnauthorized();
      }
      throw new ApiError(
        response.status,
        data?.detail ?? data?.message ?? 'Unauthorized'
      );
    }
    // Or throw an error if the request failed
    else {
      throw new ApiError(
        response.status,
        data?.detail ?? data?.message ?? 'Request failed'
      );
    }
  }

  return data;
}


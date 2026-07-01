export type ProviderName = 'openai' | 'google' | 'deepseek';

export type StoredModelSettings = {
  configured: boolean;
  provider: ProviderName;
  model_name: string;
  api_key?: string;
};

export const getStoredModelSettings = (): StoredModelSettings | null => {
  return null;
};

export const setStoredModelSettings = (_settings: StoredModelSettings) => {
  // Model credentials are system-managed and should never be cached client-side.
};

export const clearStoredModelSettings = () => {
  // No client-side model credential cache to clear.
};

export const getModelSettingsHeaders = (): Record<string, string> => {
  return {};
};

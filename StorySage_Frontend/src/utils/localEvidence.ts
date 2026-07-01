import { initialInterviewMessages } from '../constants/chatCopy';
import type { Message } from '../types/message';
import type { Biography } from '../types/biography';

const CHAT_HISTORY_CACHE_PREFIX = 'rewindai-chat-history';
const BIOGRAPHY_CACHE_PREFIX = 'rewindai-biography';
const MAX_CACHED_MESSAGES = 200;

const getChatHistoryCacheKey = (userId: string) =>
  `${CHAT_HISTORY_CACHE_PREFIX}:${userId}`;

const getBiographyCacheKey = (userId: string) =>
  `${BIOGRAPHY_CACHE_PREFIX}:${userId}`;

const isPersistableMessage = (msg: Message) =>
  Boolean(msg.id && msg.content && !initialInterviewMessages.includes(msg.content));

const normalizeMessageContent = (content: string) =>
  content.replace(/\s+/g, ' ').trim();

export const mergeMessages = (primary: Message[], secondary: Message[]) => {
  const sorted = [...primary, ...secondary]
    .filter(isPersistableMessage)
    .sort((a, b) => (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ));
  const byId = new Map<string, Message>();
  const recentContentAt = new Map<string, number>();

  for (const msg of sorted) {
    const contentKey = [
      msg.role,
      normalizeMessageContent(msg.content),
    ].join('::');
    const timestamp = new Date(msg.created_at).getTime();
    const previousTimestamp = recentContentAt.get(contentKey);
    const isNearDuplicate = previousTimestamp !== undefined &&
      Math.abs(timestamp - previousTimestamp) < 120000;
    if (byId.has(msg.id) || isNearDuplicate) continue;
    byId.set(msg.id, msg);
    recentContentAt.set(contentKey, timestamp);
  }

  return Array.from(byId.values()).slice(-MAX_CACHED_MESSAGES);
};

export const loadCachedChatMessages = (userId: string): Message[] => {
  try {
    const raw = window.localStorage.getItem(getChatHistoryCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((msg): msg is Message => (
      Boolean(
        msg &&
        typeof msg.id === 'string' &&
        typeof msg.content === 'string' &&
        typeof msg.created_at === 'string' &&
        (msg.role === 'User' || msg.role === 'Interviewer')
      )
    ));
  } catch {
    return [];
  }
};

export const saveCachedChatMessages = (userId: string, messages: Message[]) => {
  const persistable = mergeMessages(messages, []);
  window.localStorage.setItem(
    getChatHistoryCacheKey(userId),
    JSON.stringify(persistable),
  );
};

export const buildFallbackBiographyFromMessages = (
  userId: string,
  messages: Message[],
): Biography | null => {
  const userAnswers = messages
    .filter(message => message.role === 'User' && message.content.trim())
    .slice(-8);
  if (userAnswers.length === 0) return null;

  const now = new Date().toISOString();
  const transcript = userAnswers
    .map((message, index) => `${index + 1}. ${message.content.trim()}`)
    .join('\n');

  return {
    id: `local-biography-${userId}`,
    title: `Biography of ${userId}`,
    content: '',
    created_at: now,
    last_edit: now,
    subsections: {
      '1 Interview-Based Draft': {
        id: `local-section-${userId}-1`,
        title: '1 Interview-Based Draft',
        content: [
          'This editable draft was restored from this browser because the online demo backend may switch serverless instances.',
          '',
          transcript,
        ].join('\n'),
        created_at: now,
        last_edit: now,
        subsections: {},
      },
      '2 Emerging Decision Themes': {
        id: `local-section-${userId}-2`,
        title: '2 Emerging Decision Themes',
        content: 'Early signals from the interview suggest focusing on turning points, trade-offs, relationships, and the conditions that changed the user\'s decisions.',
        created_at: now,
        last_edit: now,
        subsections: {},
      },
    },
  };
};

export const loadCachedBiographySnapshot = (userId: string): Biography | null => {
  try {
    const raw = window.localStorage.getItem(getBiographyCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.title !== 'string' || typeof parsed.subsections !== 'object') {
      return null;
    }
    return parsed as Biography;
  } catch {
    return null;
  }
};

export const saveCachedBiographySnapshot = (userId: string, biography: Biography) => {
  window.localStorage.setItem(getBiographyCacheKey(userId), JSON.stringify(biography));
};

export const clearLocalEvidenceForUser = (userId: string) => {
  window.localStorage.removeItem(getChatHistoryCacheKey(userId));
  window.localStorage.removeItem(getBiographyCacheKey(userId));
  window.localStorage.removeItem(`rewindai.traceFallback.${userId}`);
};

export const getLocalEvidencePayload = (userId: string) => {
  const messages = loadCachedChatMessages(userId);
  const biography = loadCachedBiographySnapshot(userId)
    || buildFallbackBiographyFromMessages(userId, messages);
  return {
    messages,
    biography,
  };
};

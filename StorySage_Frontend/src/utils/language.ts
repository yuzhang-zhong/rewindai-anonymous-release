export type AppLanguage = 'en' | 'zh';

export const languageStorageKey = 'rewindai-language';
export const languageChangeEvent = 'rewindai-language-change';

export function getStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(languageStorageKey) === 'zh' ? 'zh' : 'en';
}

export function setStoredLanguage(language: AppLanguage) {
  window.localStorage.setItem(languageStorageKey, language);
  window.dispatchEvent(new CustomEvent(languageChangeEvent, { detail: language }));
}

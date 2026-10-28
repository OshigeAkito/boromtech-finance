// The site is bilingual. English is the default; the EN | TH switch stores the choice in a cookie.
export const LANG_COOKIE = 'bt_lang';
export const LANG_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function normalizeLang(value) {
  return value === 'th' ? 'th' : 'en';
}

// tr(lang)('Save', 'บันทึก') picks the string for the current language.
export function tr(lang) {
  const th = normalizeLang(lang) === 'th';
  return (en, thai) => (th ? thai : en);
}

// Only same-site paths are allowed as the page to return to after switching.
export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (/[\u0000-\u001F]/.test(value) || value.length > 500) return '/';
  return value;
}

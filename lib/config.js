export const REQUIRED_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'ALLOWED_EMAILS',
];

export const DEFAULT_FORECAST_PATH = '/etc/secrets/forecast.json';

export function parseAllowlist(raw) {
  return String(raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function emailAllowed(allowlist, email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return allowlist.includes(normalized);
}

export function readConfig(env) {
  const source = env ?? {};
  const missing = [];
  for (const key of REQUIRED_ENV) {
    if (source[key] == null || String(source[key]).trim() === '') missing.push(key);
  }
  const allowlist = missing.includes('ALLOWED_EMAILS') ? [] : parseAllowlist(source.ALLOWED_EMAILS);
  if (!missing.includes('ALLOWED_EMAILS') && allowlist.length === 0) {
    missing.push('ALLOWED_EMAILS');
  }
  const baseRaw = String(source.BASE_URL || source.RENDER_EXTERNAL_URL || '').trim();
  return {
    ok: missing.length === 0,
    missing,
    env: source,
    allowlist,
    baseUrl: baseRaw.replace(/\/+$/, ''),
    nodeEnv: source.NODE_ENV || '',
    sessionSecret: source.SESSION_SECRET,
    forecastPath: String(source.FORECAST_PATH || '').trim() || DEFAULT_FORECAST_PATH,
  };
}

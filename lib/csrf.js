import crypto from 'node:crypto';

export function newCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length < 20 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

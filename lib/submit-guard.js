// One process remembers recent form tokens so a double submit does not
// create a second copy of the same planned series.
const seen = new Map();
const MAX = 2000;
const TTL_MS = 30 * 60 * 1000;

export function claimSubmit(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) return true;
  const now = Date.now();
  for (const [key, at] of seen) {
    if (now - at > TTL_MS) seen.delete(key);
  }
  if (seen.has(id)) return false;
  seen.set(id, now);
  while (seen.size > MAX) {
    const oldest = seen.keys().next().value;
    seen.delete(oldest);
  }
  return true;
}

import { once } from 'node:events';

export function baseEnv(extra = {}) {
  return {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SECRET: 'test-session-secret-value',
    ALLOWED_EMAILS: '  Investor@Example.com  ',
    ...extra,
  };
}

export function createFakeOidc() {
  const calls = { begin: [], complete: [] };
  return {
    calls,
    async begin(_env, { redirectUri }) {
      const state = `state-${calls.begin.length + 1}`;
      const nonce = `nonce-${calls.begin.length + 1}`;
      const codeVerifier = `verifier-${calls.begin.length + 1}`;
      calls.begin.push({ redirectUri, state, nonce, codeVerifier });
      const url = new URL('https://accounts.google.test/o/oauth2/v2/auth');
      url.searchParams.set('state', state);
      url.searchParams.set('redirect_uri', redirectUri);
      return { url: url.href, state, nonce, codeVerifier };
    },
    async complete(_env, { currentUrl, state, nonce, codeVerifier }) {
      calls.complete.push({ currentUrl: String(currentUrl), state, nonce, codeVerifier });
      const url = currentUrl instanceof URL ? currentUrl : new URL(currentUrl);
      if (url.searchParams.get('state') !== state || !nonce || !codeVerifier) {
        throw new Error('oauth check failed');
      }
      const code = url.searchParams.get('code');
      const known = {
        allowed: { email: 'investor@example.com', email_verified: true, name: 'Example Investor' },
        denied: { email: 'stranger@example.com', email_verified: true, name: 'Stranger' },
        unverified: { email: 'investor@example.com', email_verified: false, name: 'Unverified' },
        stringflag: { email: 'investor@example.com', email_verified: 'true', name: 'String Flag' },
        noemail: { email_verified: true, name: 'No Email' },
      };
      if (!known[code]) throw new Error('unknown code');
      return known[code];
    },
  };
}

export async function withServer(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

export function mergeCookies(previous, response) {
  const jar = new Map();
  if (previous) {
    for (const part of previous.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      jar.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    }
  }
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  for (const cookie of setCookies) {
    const [pair, ...attrs] = cookie.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    const attrText = attrs.join(';').toLowerCase();
    if (attrText.includes('max-age=0') || value === '') jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export async function signIn(base, code) {
  const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
  const startJar = mergeCookies('', start);
  const location = start.headers.get('location');
  const state = new URL(location).searchParams.get('state');
  const callback = await fetch(
    `${base}/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { redirect: 'manual', headers: { cookie: startJar } },
  );
  return {
    start,
    callback,
    jar: mergeCookies(startJar, callback),
    state,
  };
}

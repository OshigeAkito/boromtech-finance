import * as client from 'openid-client';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const SCOPE = 'openid email profile';

export function createGoogleOidc(deps = {}) {
  const discovery = deps.discovery ?? client.discovery;
  const buildAuthorizationUrl = deps.buildAuthorizationUrl ?? client.buildAuthorizationUrl;
  const authorizationCodeGrant = deps.authorizationCodeGrant ?? client.authorizationCodeGrant;
  const randomState = deps.randomState ?? client.randomState;
  const randomNonce = deps.randomNonce ?? client.randomNonce;
  const randomPKCECodeVerifier = deps.randomPKCECodeVerifier ?? client.randomPKCECodeVerifier;
  const calculatePKCECodeChallenge = deps.calculatePKCECodeChallenge ?? client.calculatePKCECodeChallenge;

  let configPromise;

  async function configuration(env) {
    if (!configPromise) {
      configPromise = Promise.resolve()
        .then(() => discovery(new URL(GOOGLE_ISSUER), env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET))
        .catch((error) => {
          configPromise = undefined;
          throw error;
        });
    }
    return configPromise;
  }

  return {
    async begin(env, { redirectUri }) {
      const config = await configuration(env);
      const state = randomState();
      const nonce = randomNonce();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const url = buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: SCOPE,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return { url: url.href, state, nonce, codeVerifier };
    },

    async complete(env, { currentUrl, state, nonce, codeVerifier }) {
      const config = await configuration(env);
      const tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState: state,
        expectedNonce: nonce,
        pkceCodeVerifier: codeVerifier,
        idTokenExpected: true,
      });
      const claims = typeof tokens.claims === 'function' ? tokens.claims() : undefined;
      if (!claims) throw new Error('missing id_token claims');
      return claims;
    },
  };
}

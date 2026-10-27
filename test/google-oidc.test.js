import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleOidc } from '../lib/google-oidc.js';

test('Google sign-in uses openid email profile and checks state, nonce, and PKCE', async () => {
  const calls = [];
  let discoveries = 0;
  let failDiscovery = true;
  const oidc = createGoogleOidc({
    discovery(issuer, clientId, clientSecret) {
      discoveries += 1;
      calls.push({ type: 'discovery', issuer: issuer.href, clientId, clientSecret });
      if (failDiscovery) throw new Error('temporary network failure');
      return { id: 'google-config' };
    },
    buildAuthorizationUrl(config, parameters) {
      calls.push({ type: 'authorize', config, parameters });
      return new URL('https://accounts.google.com/o/oauth2/v2/auth');
    },
    authorizationCodeGrant(config, currentUrl, checks) {
      calls.push({ type: 'grant', config, currentUrl, checks });
      return { claims: () => ({ email: 'investor@example.com', email_verified: true }) };
    },
    randomState: () => 'state-from-library',
    randomNonce: () => 'nonce-from-library',
    randomPKCECodeVerifier: () => 'verifier-from-library',
    calculatePKCECodeChallenge: async (verifier) => `challenge-for-${verifier}`,
  });

  const env = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
  };
  await assert.rejects(() => oidc.begin(env, { redirectUri: 'https://app.example/auth/google/callback' }));
  failDiscovery = false;

  const begun = await oidc.begin(env, { redirectUri: 'https://app.example/auth/google/callback' });
  await oidc.begin(env, { redirectUri: 'https://app.example/auth/google/callback' });
  const authorize = calls.find((call) => call.type === 'authorize');
  assert.equal(authorize.parameters.scope, 'openid email profile');
  assert.equal(authorize.parameters.redirect_uri, 'https://app.example/auth/google/callback');
  assert.equal(authorize.parameters.state, 'state-from-library');
  assert.equal(authorize.parameters.nonce, 'nonce-from-library');
  assert.equal(authorize.parameters.code_challenge, 'challenge-for-verifier-from-library');
  assert.equal(authorize.parameters.code_challenge_method, 'S256');
  assert.equal(begun.state, 'state-from-library');
  assert.equal(begun.nonce, 'nonce-from-library');
  assert.equal(begun.codeVerifier, 'verifier-from-library');

  const currentUrl = new URL('https://app.example/auth/google/callback?code=abc&state=state-from-library');
  const claims = await oidc.complete(env, {
    currentUrl,
    state: begun.state,
    nonce: begun.nonce,
    codeVerifier: begun.codeVerifier,
  });
  assert.equal(claims.email, 'investor@example.com');
  const grant = calls.find((call) => call.type === 'grant');
  assert.equal(grant.checks.expectedState, 'state-from-library');
  assert.equal(grant.checks.expectedNonce, 'nonce-from-library');
  assert.equal(grant.checks.pkceCodeVerifier, 'verifier-from-library');
  assert.equal(grant.checks.idTokenExpected, true);
  assert.equal(grant.config.id, 'google-config');

  const discovery = calls.find((call) => call.type === 'discovery');
  assert.equal(discovery.issuer, 'https://accounts.google.com/');
  assert.equal(discovery.clientId, 'client-id');
  assert.equal(discovery.clientSecret, 'client-secret');
  assert.equal(discoveries, 2);
});

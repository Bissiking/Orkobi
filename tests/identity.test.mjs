import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import {
  base32Encode,
  base32Decode,
  totp,
  verifyTotp,
  matchingTotpStep,
  generateRecoveryCode,
} from '../apps/core/dist/platform/totp.js';
import {
  codeChallenge,
  verifyIdToken,
  OidcRejectedError,
} from '../apps/core/dist/platform/oidc.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { OidcProvider } from '../apps/core/dist/platform/oidc.js';
import { createOidcProvider } from './helpers/oidc-provider.mjs';
import { setTimeout as delay } from 'node:timers/promises';

test('TOTP : vecteurs SHA-1 RFC 6238, six chiffres, fenêtre et récupération', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  for (const [seconds, code] of [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ]) {
    assert.equal(totp(secret, seconds * 1000), code);
    assert.ok(verifyTotp(secret, code, seconds * 1000));
    assert.equal(matchingTotpStep(secret, code, seconds * 1000), Math.floor(seconds / 30));
    assert.equal(verifyTotp(secret, code, (seconds + 90) * 1000), false);
  }
  assert.equal(
    codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
  assert.match(generateRecoveryCode(), /^[A-Z2-7]{5}-[A-Z2-7]{5}$/u);
});

test('OIDC : signatures RSA, PSS et ECDSA, claims et rejets fermés', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const algorithm of ['RS256', 'PS256', 'ES256']) {
    const pair =
      algorithm === 'ES256'
        ? generateKeyPairSync('ec', { namedCurve: 'P-256' })
        : generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...pair.publicKey.export({ format: 'jwk' }),
      kid: 'key',
      use: 'sig',
      alg: algorithm,
    };
    const options = {
      issuer: 'https://issuer.example',
      clientId: 'client',
      nonce: 'nonce',
      keys: [jwk],
    };
    const token = (patch = {}, alg = algorithm) => {
      const header = Buffer.from(JSON.stringify({ alg, kid: 'key' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: options.issuer,
          aud: 'client',
          sub: 'subject',
          exp: now + 300,
          iat: now,
          nonce: 'nonce',
          email: 'A@example.org',
          email_verified: true,
          ...patch,
        }),
      ).toString('base64url');
      const input = `${header}.${payload}`;
      const key =
        algorithm === 'ES256'
          ? { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }
          : algorithm === 'PS256'
            ? { key: pair.privateKey, padding: 6, saltLength: 32 }
            : pair.privateKey;
      return `${input}.${sign('sha256', Buffer.from(input), key).toString('base64url')}`;
    };
    assert.deepEqual(await verifyIdToken(token(), options), {
      sub: 'subject',
      email: 'a@example.org',
      emailVerified: true,
    });
    for (const patch of [
      { iss: 'other' },
      { aud: 'other' },
      { aud: ['client', 'other'] },
      { azp: 'other' },
      { exp: now - 1 },
      { iat: now + 120 },
      { nonce: 'wrong' },
      { sub: '' },
      { nbf: now + 120 },
    ])
      await assert.rejects(verifyIdToken(token(patch), options), OidcRejectedError);
    await assert.rejects(verifyIdToken(token({}, 'none'), options), OidcRejectedError);
    await assert.rejects(verifyIdToken(`${token().slice(0, -5)}wrong`, options), OidcRejectedError);
    await assert.rejects(verifyIdToken('bnVsbA.e30.eA', options), OidcRejectedError);
    assert.deepEqual(await verifyIdToken(token({ email_verified: false }), options), {
      sub: 'subject',
    });
  }
});

test('configuration Phase 3 : secrets refusés sans écho et OIDC optionnel cohérent', () => {
  assert.equal(
    loadConfig({ OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_REDIRECT_URI: '' }).platform,
    undefined,
  );
  for (const invalid of [
    { INTERNAL_TOKEN: 'secret-test' },
    { OIDC_ISSUER: 'secret-test' },
    { OIDC_CLIENT_ID: 'secret-test' },
  ])
    assert.throws(
      () => loadConfig(invalid),
      (error) => !error.message.includes('secret-test'),
    );
  assert.throws(
    () => loadBffConfig({ INTERNAL_TOKEN: 'secret-test' }),
    (error) => !error.message.includes('secret-test'),
  );
});

test('OIDC : délai propre à chaque requête et renouvellement immédiat des clés', async (t) => {
  const server = await createOidcProvider();
  t.after(() => server.close());
  const provider = new OidcProvider({
    issuer: server.issuer,
    clientId: 'orkobi-test',
    clientSecret: '',
    redirectUri: 'http://127.0.0.1/oidc/callback',
  });
  const url = await provider.authorizationUrl('state', 'nonce', 'verifier');
  const first = await provider.exchange(server.code(url), 'verifier');
  assert.equal((await provider.claims(first, 'nonce')).sub, 'subject-test');
  server.rotate();
  // Un AbortSignal créé au chargement du module serait déjà expiré ici.
  await delay(5100);
  const rotated = await provider.exchange(server.code(url), 'verifier');
  assert.equal((await provider.claims(rotated, 'nonce')).sub, 'subject-test');
});

test('OIDC : authentification client Basic par défaut ou POST selon discovery', async (t) => {
  const clientSecret = 'synthetic: secret+value';
  for (const config of [
    { authMethod: 'client_secret_basic', omitAuthMethods: true },
    { authMethod: 'client_secret_basic' },
    { authMethod: 'client_secret_post' },
  ]) {
    const server = await createOidcProvider({ ...config, clientSecret });
    t.after(() => server.close());
    const provider = new OidcProvider({
      issuer: server.issuer,
      clientId: 'orkobi-test',
      clientSecret,
      redirectUri: 'http://127.0.0.1/oidc/callback',
    });
    const url = await provider.authorizationUrl('state', 'nonce', 'verifier');
    const token = await provider.exchange(server.code(url), 'verifier');
    assert.equal((await provider.claims(token, 'nonce')).sub, 'subject-test');
  }
});

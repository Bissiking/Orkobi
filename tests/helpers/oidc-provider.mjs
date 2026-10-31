import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { once } from 'node:events';
import { Buffer } from 'node:buffer';
import { URL, URLSearchParams } from 'node:url';
import { codeChallenge } from '../../apps/core/dist/platform/oidc.js';

/** Fournisseur synthétique local : vrai HTTP, vrais JWT RSA et vérification PKCE. */
export async function createOidcProvider({
  clientSecret = '',
  authMethod = 'client_secret_basic',
  omitAuthMethods = false,
} = {}) {
  let { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const codes = new Map();
  let issuer;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/.well-known/openid-configuration')
      return res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          ...(!omitAuthMethods ? { token_endpoint_auth_methods_supported: [authMethod] } : {}),
        }),
      );
    if (req.url === '/jwks') return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === '/token') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body),
        entry = codes.get(params.get('code'));
      codes.delete(params.get('code'));
      const encode = (value) => new URLSearchParams({ v: value }).toString().slice(2);
      const expectedBasic = `Basic ${Buffer.from(`${encode('orkobi-test')}:${encode(clientSecret)}`).toString('base64')}`;
      const authenticated =
        !clientSecret ||
        (authMethod === 'client_secret_basic'
          ? req.headers.authorization === expectedBasic && !params.has('client_secret')
          : params.get('client_secret') === clientSecret && !req.headers.authorization);
      if (
        !entry ||
        !authenticated ||
        codeChallenge(params.get('code_verifier') ?? '') !== entry.challenge ||
        params.get('client_id') !== 'orkobi-test' ||
        params.get('redirect_uri') !== 'http://127.0.0.1/oidc/callback'
      ) {
        res.statusCode = 400;
        return res.end('{}');
      }
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: issuer,
          aud: 'orkobi-test',
          sub: 'subject-test',
          iat: now,
          exp: now + 300,
          nonce: entry.nonce,
          ...entry.claims,
        }),
      ).toString('base64url');
      const input = `${header}.${payload}`;
      return res.end(
        JSON.stringify({
          id_token: `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`,
        }),
      );
    }
    res.statusCode = 404;
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  issuer = `http://127.0.0.1:${server.address().port}`;
  return {
    issuer,
    rotate() {
      ({ privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }));
      jwk = {
        ...publicKey.export({ format: 'jwk' }),
        kid: randomBytes(8).toString('hex'),
        alg: 'RS256',
        use: 'sig',
      };
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
    code(url, claims = {}) {
      const params = new URL(url).searchParams;
      if (params.get('code_challenge_method') !== 'S256') throw new Error('PKCE requis');
      const code = randomBytes(16).toString('hex');
      codes.set(code, {
        nonce: params.get('nonce'),
        challenge: params.get('code_challenge'),
        claims,
      });
      return code;
    },
  };
}

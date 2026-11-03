import { createHash } from 'node:crypto';
import type { webcrypto } from 'node:crypto';
/** Fournisseur OpenID Connect générique : discovery, échange de code et jetons d'identité. */

export interface OidcProviderConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}
export interface OidcDiscovery {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly tokenEndpointAuthMethods: readonly string[];
}
export interface IdTokenClaims {
  readonly sub: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}
/** Le fournisseur est injoignable ou sa réponse est illisible (503 côté Core). */
export class OidcUnavailableError extends Error {}
/** Le jeton d'identité est refusé : signature ou revendications invalides (403). */
export class OidcRejectedError extends Error {}

interface JsonWebKeyLike {
  kty?: string;
  kid?: string;
  use?: string;
  key_ops?: string[];
  crv?: string;
  alg?: string;
}
interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}
export interface IdTokenOptions {
  readonly issuer: string;
  readonly clientId: string;
  readonly nonce: string;
  readonly keys: readonly JsonWebKeyLike[];
  readonly now?: number;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new OidcUnavailableError('Réponse du fournisseur illisible.');
  }
}
async function readJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new OidcUnavailableError('Fournisseur injoignable.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new OidcUnavailableError('Réponse du fournisseur refusée.');
  }
  return responseJson(response);
}
function endpoint(value: unknown, issuer: URL): string {
  if (typeof value !== 'string') throw new OidcUnavailableError('Découverte incomplète.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcUnavailableError('Découverte invalide.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new OidcUnavailableError('Découverte invalide.');
  // Un issuer HTTPS ne peut pas rétrograder ses points de terminaison en HTTP.
  if (issuer.protocol === 'https:' && url.protocol !== 'https:')
    throw new OidcUnavailableError('Découverte non sécurisée.');
  return url.toString();
}
export async function discover(issuer: string): Promise<OidcDiscovery> {
  let base: URL;
  try {
    base = new URL(issuer);
  } catch {
    throw new OidcUnavailableError('Issuer invalide.');
  }
  const document = (await readJson(
    `${issuer.replace(/\/$/u, '')}/.well-known/openid-configuration`,
  )) as Record<string, unknown> | null;
  if (!document || typeof document !== 'object' || document.issuer !== issuer)
    throw new OidcUnavailableError('Découverte illisible.');
  const methods = document.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
  if (!Array.isArray(methods) || !methods.every((method) => typeof method === 'string'))
    throw new OidcUnavailableError('Méthodes d’authentification invalides.');
  return {
    authorizationEndpoint: endpoint(document.authorization_endpoint, base),
    tokenEndpoint: endpoint(document.token_endpoint, base),
    jwksUri: endpoint(document.jwks_uri, base),
    tokenEndpointAuthMethods: methods,
  };
}
/** Hachage S256 du code_verifier (RFC 7636). */
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
function decodeSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) throw new OidcRejectedError('Jeton mal formé.');
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new OidcRejectedError('Jeton illisible.');
  }
}
const algorithms: Readonly<Record<string, { name: string; hash: string; saltLength?: number }>> = {
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  PS256: { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 },
  ES256: { name: 'ECDSA', hash: 'SHA-256' },
};
async function importKey(jwk: JsonWebKeyLike, spec: { name: string; hash: string }) {
  return globalThis.crypto.subtle.importKey(
    'jwk',
    jwk as unknown as webcrypto.JsonWebKey,
    { name: spec.name, hash: spec.hash, ...(spec.name === 'ECDSA' ? { namedCurve: 'P-256' } : {}) },
    false,
    ['verify'],
  );
}
async function verifySignature(
  signingInput: string,
  signature: string,
  algorithm: string,
  keys: readonly JsonWebKeyLike[],
): Promise<boolean> {
  const header = decodeSegment(signingInput.split('.')[0]!) as JwtHeader;
  const usable = keys.filter(
    (key) =>
      key.kty !== undefined &&
      (key.use === undefined || key.use === 'sig') &&
      (key.alg === undefined || key.alg === algorithm) &&
      (algorithm === 'ES256' ? key.kty === 'EC' && key.crv === 'P-256' : key.kty === 'RSA') &&
      (key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.includes('verify'))),
  );
  const candidates =
    typeof header.kid === 'string' ? usable.filter((key) => key.kid === header.kid) : usable;
  if (candidates.length === 0) return false;
  const spec = algorithms[algorithm]!;
  const subtle = globalThis.crypto.subtle;
  const data = new TextEncoder().encode(signingInput);
  const bytes = Buffer.from(signature, 'base64url');
  for (const jwk of candidates) {
    try {
      const key = await importKey(jwk, spec);
      const valid =
        spec.saltLength !== undefined
          ? await subtle.verify(
              { name: spec.name, hash: spec.hash, saltLength: spec.saltLength },
              key,
              bytes,
              data,
            )
          : await subtle.verify({ name: spec.name, hash: spec.hash }, key, bytes, data);
      if (valid) return true;
    } catch {
      continue;
    }
  }
  return false;
}
/** Vérifie signature, issuer, audience, expiration, nonce et subject (OIDC Core §3.1.3.7). */
export async function verifyIdToken(
  token: string,
  options: IdTokenOptions,
): Promise<IdTokenClaims> {
  if (typeof token !== 'string' || token.length > 16384)
    throw new OidcRejectedError('Jeton trop volumineux.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new OidcRejectedError('Jeton mal formé.');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeSegment(headerPart) as JwtHeader;
  if (
    !header ||
    typeof header !== 'object' ||
    typeof header.alg !== 'string' ||
    !Object.hasOwn(algorithms, header.alg) ||
    !/^[A-Za-z0-9_-]+$/u.test(signaturePart)
  )
    throw new OidcRejectedError('Algorithme refusé.');
  const verified = await verifySignature(
    `${headerPart}.${payloadPart}`,
    signaturePart,
    header.alg,
    options.keys,
  );
  if (!verified) throw new OidcRejectedError('Signature invalide.');
  const payload = decodeSegment(payloadPart) as Record<string, unknown> | null;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (!payload || typeof payload !== 'object')
    throw new OidcRejectedError('Revendications invalides.');
  if (payload.iss !== options.issuer) throw new OidcRejectedError('Issuer refusé.');
  const audience = payload.aud;
  const audienceMatches =
    audience === options.clientId ||
    (Array.isArray(audience) &&
      audience.every((item) => typeof item === 'string') &&
      audience.includes(options.clientId));
  if (!audienceMatches) throw new OidcRejectedError('Audience refusée.');
  if (
    (payload.azp !== undefined && payload.azp !== options.clientId) ||
    (Array.isArray(audience) && audience.length > 1 && payload.azp !== options.clientId)
  )
    throw new OidcRejectedError('Partie autorisée refusée.');
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now)
    throw new OidcRejectedError('Jeton expiré.');
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > now + 60)
    throw new OidcRejectedError('Jeton non conforme.');
  if (payload.nonce !== options.nonce) throw new OidcRejectedError('Nonce refusé.');
  if (
    payload.nbf !== undefined &&
    (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf > now + 60)
  )
    throw new OidcRejectedError('Jeton prématuré.');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255)
    throw new OidcRejectedError('Subject refusé.');
  return {
    sub: payload.sub,
    ...(typeof payload.email === 'string' &&
    payload.email.length <= 254 &&
    payload.email_verified === true
      ? { emailVerified: true, email: payload.email.toLowerCase() }
      : {}),
  };
}
async function fetchJwks(uri: string): Promise<readonly JsonWebKeyLike[]> {
  const document = (await readJson(uri)) as { keys?: unknown } | null;
  if (!document || !Array.isArray(document.keys) || document.keys.length === 0)
    throw new OidcUnavailableError('JWKS indisponible.');
  return document.keys.filter(
    (key): key is JsonWebKeyLike =>
      typeof key === 'object' && key !== null && typeof (key as JsonWebKeyLike).kty === 'string',
  );
}
export class OidcProvider {
  private discovery?: { value: OidcDiscovery; at: number };
  private jwks?: { uri: string; keys: readonly JsonWebKeyLike[]; at: number };
  constructor(private readonly config: OidcProviderConfig) {}

  async info(): Promise<OidcDiscovery> {
    if (this.discovery && Date.now() - this.discovery.at < 600_000) return this.discovery.value;
    const value = await discover(this.config.issuer);
    this.discovery = { value, at: Date.now() };
    return value;
  }
  async authorizationUrl(state: string, nonce: string, verifier: string): Promise<string> {
    const info = await this.info();
    const url = new URL(info.authorizationEndpoint);
    const parameters = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    for (const [key, value] of parameters) url.searchParams.set(key, value);
    return url.toString();
  }
  private async keys(): Promise<readonly JsonWebKeyLike[]> {
    const info = await this.info();
    if (this.jwks && this.jwks.uri === info.jwksUri && Date.now() - this.jwks.at < 600_000)
      return this.jwks.keys;
    const keys = await fetchJwks(info.jwksUri);
    this.jwks = { uri: info.jwksUri, keys, at: Date.now() };
    return keys;
  }
  async exchange(code: string, verifier: string): Promise<string> {
    const info = await this.info();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: verifier,
    });
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    };
    if (this.config.clientSecret) {
      if (info.tokenEndpointAuthMethods.includes('client_secret_basic')) {
        const encode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);
        headers.authorization = `Basic ${Buffer.from(`${encode(this.config.clientId)}:${encode(this.config.clientSecret)}`).toString('base64')}`;
      } else if (info.tokenEndpointAuthMethods.includes('client_secret_post'))
        body.set('client_secret', this.config.clientSecret);
      else throw new OidcUnavailableError('Authentification du client non prise en charge.');
    }
    let response: Response;
    try {
      response = await fetch(info.tokenEndpoint, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new OidcUnavailableError('Fournisseur injoignable.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 500) throw new OidcUnavailableError('Fournisseur indisponible.');
      throw new OidcRejectedError('Échange de code refusé.');
    }
    const payload = await responseJson(response);
    const idToken =
      payload && typeof payload === 'object' && 'id_token' in payload
        ? (payload as { id_token?: unknown }).id_token
        : undefined;
    if (typeof idToken !== 'string' || !idToken)
      throw new OidcUnavailableError('Jeton d’identité absent.');
    return idToken;
  }
  async claims(idToken: string, nonce: string): Promise<IdTokenClaims> {
    if (idToken.length > 16384) throw new OidcRejectedError('Jeton trop volumineux.');
    const header = decodeSegment(idToken.split('.')[0] ?? '') as JwtHeader | null;
    let keys = await this.keys();
    if (header && typeof header.kid === 'string' && !keys.some((key) => key.kid === header.kid)) {
      delete this.jwks;
      keys = await this.keys();
    }
    return verifyIdToken(idToken, {
      issuer: this.config.issuer,
      clientId: this.config.clientId,
      nonce,
      keys,
    });
  }
}

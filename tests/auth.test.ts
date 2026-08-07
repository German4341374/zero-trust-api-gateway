import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from 'jose';

import {
  createRemoteTokenVerifier,
  identityFromPayload,
  JoseTokenVerifier,
  parseBearerToken,
} from '../src/auth.js';

const issuer = 'https://identity.example.test/realms/portfolio';
const audience = 'gateway-api';

async function signedToken(overrides: Record<string, unknown> = {}): Promise<{
  token: string;
  verifier: JoseTokenVerifier;
  getKey: JWTVerifyGetKey;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const token = await new SignJWT({
    tenant: 'acme',
    realm_access: { roles: ['viewer'] },
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('user-123')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  const getKey = createLocalJWKSet({ keys: [jwk] });
  return {
    token,
    getKey,
    verifier: new JoseTokenVerifier(getKey, { issuer, audience }),
  };
}

describe('JoseTokenVerifier', () => {
  it('validates signature, issuer, audience, and claims', async () => {
    const { token, verifier } = await signedToken();

    await expect(verifier.verify(token)).resolves.toMatchObject({
      subject: 'user-123',
      roles: ['viewer'],
      tenant: 'acme',
    });
  });

  it('rejects a token with the wrong audience', async () => {
    const { token, getKey } = await signedToken();
    const wrongAudienceVerifier = new JoseTokenVerifier(getKey, {
      issuer,
      audience: 'other-api',
    });

    await expect(wrongAudienceVerifier.verify(token)).rejects.toThrow();
  });

  it('requires subject and expiration claims when converting a payload', () => {
    expect(() => identityFromPayload({ exp: 1 })).toThrow('subject');
    expect(() => identityFromPayload({ sub: 'user' })).toThrow('expiration');
  });

  it('treats malformed roles and tenant claims as absent', () => {
    expect(
      identityFromPayload({
        sub: 'user',
        exp: 100,
        realm_access: 'bad',
        tenant: 42,
      }),
    ).toEqual({
      subject: 'user',
      roles: [],
      tenant: undefined,
      expiresAt: 100,
    });
  });

  it('filters non-string role values', () => {
    expect(
      identityFromPayload({
        sub: 'user',
        exp: 100,
        realm_access: { roles: ['viewer', 42, null] },
      }).roles,
    ).toEqual(['viewer']);
  });

  it('constructs a remote JWKS verifier without fetching keys eagerly', () => {
    expect(
      createRemoteTokenVerifier('https://identity.example.test/jwks', {
        issuer,
        audience,
      }).verify,
    ).toBeTypeOf('function');
  });
});

describe('parseBearerToken', () => {
  it('extracts a bearer token', () => {
    expect(parseBearerToken('Bearer abc.def-123_~')).toBe('abc.def-123_~');
  });

  it.each([undefined, 'Basic abc', 'bearer abc', 'Bearer token with spaces'])(
    'rejects malformed authorization input: %s',
    (header) => {
      expect(() => parseBearerToken(header)).toThrow();
    },
  );
});

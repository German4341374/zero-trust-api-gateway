import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export interface AccessIdentity {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly tenant: string | undefined;
  readonly expiresAt: number;
}

export interface TokenVerifier {
  verify(token: string): Promise<AccessIdentity>;
}

export interface JwtValidationOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly clockToleranceSeconds?: number;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function identityFromPayload(payload: JWTPayload): AccessIdentity {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('The access token has no subject claim');
  }
  if (typeof payload.exp !== 'number') {
    throw new Error('The access token has no expiration claim');
  }

  const realmAccess = payload['realm_access'];
  const roles =
    typeof realmAccess === 'object' && realmAccess !== null
      ? stringArray((realmAccess as Record<string, unknown>)['roles'])
      : [];
  const tenant =
    typeof payload['tenant'] === 'string' ? payload['tenant'] : undefined;

  return { subject: payload.sub, roles, tenant, expiresAt: payload.exp };
}

export class JoseTokenVerifier implements TokenVerifier {
  public constructor(
    private readonly getKey: JWTVerifyGetKey,
    private readonly options: JwtValidationOptions,
  ) {}

  public async verify(token: string): Promise<AccessIdentity> {
    const { payload } = await jwtVerify(token, this.getKey, {
      issuer: this.options.issuer,
      audience: this.options.audience,
      algorithms: ['RS256'],
      clockTolerance: this.options.clockToleranceSeconds ?? 5,
      requiredClaims: ['sub', 'exp'],
    });

    return identityFromPayload(payload);
  }
}

export function createRemoteTokenVerifier(
  jwksUrl: string,
  options: JwtValidationOptions,
): TokenVerifier {
  return new JoseTokenVerifier(
    createRemoteJWKSet(new URL(jwksUrl), {
      cooldownDuration: 30_000,
      timeoutDuration: 2000,
    }),
    options,
  );
}

export function parseBearerToken(header: string | undefined): string {
  if (header === undefined) {
    throw new Error('Bearer token is required');
  }

  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (match?.[1] === undefined || match[1].length > 8192) {
    throw new Error('Bearer token is malformed');
  }

  return match[1];
}

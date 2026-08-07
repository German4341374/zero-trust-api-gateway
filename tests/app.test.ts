import pino from 'pino';
import { vi } from 'vitest';

import { buildGatewayApp, type GatewayDependencies } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const identity = {
  subject: 'user-123',
  roles: ['viewer'],
  tenant: 'acme',
  expiresAt: 2_000_000_000,
};

function dependencies(
  overrides: Partial<GatewayDependencies> = {},
): GatewayDependencies {
  return {
    tokens: { verify: vi.fn().mockResolvedValue(identity) },
    authorizer: {
      authorize: vi
        .fn()
        .mockResolvedValue({ allow: true, reason: 'test-policy' }),
    },
    rateLimiter: {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 19,
        retryAfterSeconds: 60,
      }),
    },
    upstream: {
      forward: vi.fn().mockResolvedValue({
        statusCode: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      }),
    },
    readiness: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const config = loadConfig({ NODE_ENV: 'test' });
const logger = pino({ level: 'silent' });

describe('gateway application', () => {
  it('proxies an authenticated and authorized request with trusted identity headers', async () => {
    const deps = dependencies();
    const app = buildGatewayApp(config, deps, logger);

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile?view=short',
      headers: { authorization: 'Bearer valid.token', cookie: 'secret=1' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(deps.authorizer.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/profile' }),
    );
    expect(deps.upstream.forward).toHaveBeenCalledWith(
      expect.objectContaining({
        pathAndQuery: '/api/profile?view=short',
        headers: expect.objectContaining({
          'x-authenticated-subject': 'user-123',
          'x-authenticated-roles': 'viewer',
        }),
      }),
    );

    await app.close();
  });

  it('returns 401 when token verification fails', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        tokens: { verify: vi.fn().mockRejectedValue(new Error('invalid')) },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    await app.close();
  });

  it('returns 403 for an explicit policy denial', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        authorizer: {
          authorize: vi
            .fn()
            .mockResolvedValue({ allow: false, reason: 'denied' }),
        },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/admin',
      headers: { authorization: 'Bearer valid.token' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('fails closed when the policy service is unavailable', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        authorizer: {
          authorize: vi.fn().mockRejectedValue(new Error('offline')),
        },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile',
      headers: { authorization: 'Bearer valid.token' },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('fails closed when Redis is unavailable', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        rateLimiter: {
          consume: vi.fn().mockRejectedValue(new Error('offline')),
        },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile',
      headers: { authorization: 'Bearer valid.token' },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('returns 429 and retry guidance when the subject exceeds the limit', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        rateLimiter: {
          consume: vi.fn().mockResolvedValue({
            allowed: false,
            remaining: 0,
            retryAfterSeconds: 42,
          }),
        },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile',
      headers: { authorization: 'Bearer valid.token' },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('42');
    await app.close();
  });

  it('maps unsafe upstream failures to a stable 502 response', async () => {
    const app = buildGatewayApp(
      config,
      dependencies({
        upstream: { forward: vi.fn().mockRejectedValue(new Error('timeout')) },
      }),
      logger,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/api/profile',
      headers: { authorization: 'Bearer valid.token' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: 'bad_gateway' } });
    await app.close();
  });

  it('reports dependency-aware readiness', async () => {
    const readyApp = buildGatewayApp(config, dependencies(), logger);
    expect((await readyApp.inject('/health/ready')).statusCode).toBe(200);
    await readyApp.close();

    const unavailableApp = buildGatewayApp(
      config,
      dependencies({
        readiness: vi.fn().mockRejectedValue(new Error('offline')),
      }),
      logger,
    );
    expect((await unavailableApp.inject('/health/ready')).statusCode).toBe(503);
    await unavailableApp.close();
  });
});

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import type { AppConfig } from './config.js';
import { parseBearerToken, type TokenVerifier } from './auth.js';
import { buildPolicyInput, type Authorizer } from './policy.js';
import {
  sanitizeRequestHeaders,
  subjectFingerprint,
} from './proxy-security.js';
import type { RateLimiter } from './rate-limiter.js';
import type { UpstreamClient } from './upstream-client.js';

export interface GatewayDependencies {
  readonly tokens: TokenVerifier;
  readonly authorizer: Authorizer;
  readonly rateLimiter: RateLimiter;
  readonly upstream: UpstreamClient;
  readonly readiness: () => Promise<void>;
}

interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

function errorResponse(
  code: string,
  message: string,
  requestId: string,
): ErrorResponse {
  return { error: { code, message, requestId } };
}

export function buildGatewayApp(
  config: AppConfig,
  dependencies: GatewayDependencies,
  logger: FastifyBaseLogger,
): FastifyInstance {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: config.REQUEST_BODY_LIMIT_BYTES,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await dependencies.readiness();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not-ready' });
    }
  });

  app.all('/proxy/*', async (request, reply) => {
    const pathAndQuery = request.raw.url?.slice('/proxy'.length) ?? '/';
    let identity;

    try {
      identity = await dependencies.tokens.verify(
        parseBearerToken(request.headers.authorization),
      );
    } catch (error) {
      request.log.warn({ err: error }, 'access token rejected');
      return reply
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send(
          errorResponse(
            'unauthenticated',
            'A valid bearer token is required',
            request.id,
          ),
        );
    }

    const subjectHash = subjectFingerprint(identity.subject);
    let rateLimit;
    try {
      rateLimit = await dependencies.rateLimiter.consume(subjectHash);
    } catch (error) {
      request.log.error(
        { err: error, subjectHash },
        'rate limiter unavailable',
      );
      return reply
        .code(503)
        .send(
          errorResponse(
            'dependency_unavailable',
            'Authorization dependency unavailable',
            request.id,
          ),
        );
    }

    reply.header('x-ratelimit-remaining', rateLimit.remaining);
    if (!rateLimit.allowed) {
      request.log.warn(
        { subjectHash, path: pathAndQuery },
        'request rate limited',
      );
      return reply
        .code(429)
        .header('retry-after', rateLimit.retryAfterSeconds)
        .send(errorResponse('rate_limited', 'Rate limit exceeded', request.id));
    }

    let decision;
    try {
      decision = await dependencies.authorizer.authorize(
        buildPolicyInput(
          request.method,
          pathAndQuery.split('?')[0] ?? '/',
          identity,
        ),
      );
    } catch (error) {
      request.log.error(
        { err: error, subjectHash },
        'policy decision failed closed',
      );
      return reply
        .code(503)
        .send(
          errorResponse(
            'dependency_unavailable',
            'Authorization dependency unavailable',
            request.id,
          ),
        );
    }

    request.log.info(
      {
        decision: decision.allow ? 'allow' : 'deny',
        reason: decision.reason,
        subjectHash,
        path: pathAndQuery,
      },
      'authorization decision',
    );
    if (!decision.allow) {
      return reply
        .code(403)
        .send(
          errorResponse('forbidden', 'Policy denied this request', request.id),
        );
    }

    try {
      const response = await dependencies.upstream.forward({
        method: request.method,
        pathAndQuery,
        headers: {
          ...sanitizeRequestHeaders(request.headers),
          'x-authenticated-subject': identity.subject,
          'x-authenticated-roles': identity.roles.join(','),
          'x-request-id': request.id,
        },
        body: request.body,
      });

      return await reply
        .code(response.statusCode)
        .type(response.contentType)
        .send(response.body);
    } catch (error) {
      request.log.error(
        { err: error, subjectHash, path: pathAndQuery },
        'upstream request failed',
      );
      return reply
        .code(502)
        .send(
          errorResponse(
            'bad_gateway',
            'The upstream service did not respond safely',
            request.id,
          ),
        );
    }
  });

  return app;
}

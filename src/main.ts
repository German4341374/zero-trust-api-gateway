import { createClient } from 'redis';

import { buildGatewayApp } from './app.js';
import { createRemoteTokenVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { OpaAuthorizer } from './policy.js';
import { RedisRateLimiter } from './rate-limiter.js';
import { FixedUpstreamClient } from './upstream-client.js';
import { buildUpstreamApp } from './upstream-app.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const redis = createClient({
  url: config.REDIS_URL,
  disableOfflineQueue: true,
});
redis.on('error', (error) =>
  logger.error({ err: error }, 'redis client error'),
);

const app =
  config.ROLE === 'upstream'
    ? buildUpstreamApp(logger)
    : buildGatewayApp(
        config,
        {
          tokens: createRemoteTokenVerifier(config.JWKS_URL, {
            issuer: config.OIDC_ISSUER,
            audience: config.OIDC_AUDIENCE,
          }),
          authorizer: new OpaAuthorizer(
            config.OPA_URL,
            config.REQUEST_TIMEOUT_MS,
          ),
          rateLimiter: new RedisRateLimiter(
            redis,
            config.RATE_LIMIT_REQUESTS,
            config.RATE_LIMIT_WINDOW_SECONDS,
          ),
          upstream: new FixedUpstreamClient(
            config.UPSTREAM_URL,
            config.REQUEST_TIMEOUT_MS,
            config.RESPONSE_BODY_LIMIT_BYTES,
          ),
          readiness: async () => {
            if (!redis.isOpen) {
              await redis.connect();
            }
            const [redisReply, opaResponse, upstreamResponse] =
              await Promise.all([
                redis.ping(),
                fetch(new URL('/health', config.OPA_URL), {
                  signal: AbortSignal.timeout(1000),
                }),
                fetch(new URL('/health/live', config.UPSTREAM_URL), {
                  signal: AbortSignal.timeout(1000),
                }),
              ]);
            if (
              redisReply !== 'PONG' ||
              !opaResponse.ok ||
              !upstreamResponse.ok
            ) {
              throw new Error('A gateway dependency is not ready');
            }
          },
        },
        logger,
      );

await app.listen({ host: '0.0.0.0', port: config.PORT });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'graceful shutdown started');
  await app.close();
  if (redis.isOpen) {
    await redis.close();
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}

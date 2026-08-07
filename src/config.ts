import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  ROLE: z.enum(['gateway', 'upstream']).default('gateway'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  OIDC_ISSUER: z.url().default('http://localhost:8180/realms/portfolio'),
  OIDC_AUDIENCE: z.string().min(1).default('gateway-api'),
  JWKS_URL: z
    .url()
    .default(
      'http://keycloak:8080/realms/portfolio/protocol/openid-connect/certs',
    ),
  OPA_URL: z.url().default('http://opa:8181/v1/data/gateway/decision'),
  REDIS_URL: z.url().default('redis://redis:6379'),
  UPSTREAM_URL: z.url().default('http://upstream:8090'),
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(3000),
  REQUEST_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1_048_576)
    .default(65_536),
  RESPONSE_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(2_097_152)
    .default(262_144),
  RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(60),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return configSchema.parse(environment);
}

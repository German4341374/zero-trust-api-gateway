import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

export function buildUpstreamApp(logger: FastifyBaseLogger): FastifyInstance {
  const app = Fastify({ loggerInstance: logger });

  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/api/profile', (request) => ({
    subject: request.headers['x-authenticated-subject'] ?? 'unknown',
    message: 'Profile access granted by the gateway',
  }));
  app.get('/api/admin', () => ({
    message: 'Administrative access granted',
  }));
  app.get<{ Params: { tenantId: string } }>(
    '/api/tenants/:tenantId/orders',
    (request) => ({
      tenant: request.params.tenantId,
      orders: [{ id: 'demo-order', status: 'READY' }],
    }),
  );

  return app;
}

import pino from 'pino';

import { buildUpstreamApp } from '../src/upstream-app.js';

describe('demo upstream', () => {
  it('returns the gateway-authenticated subject', async () => {
    const app = buildUpstreamApp(pino({ level: 'silent' }));
    const response = await app.inject({
      url: '/api/profile',
      headers: { 'x-authenticated-subject': 'user-123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ subject: 'user-123' });
    await app.close();
  });
});

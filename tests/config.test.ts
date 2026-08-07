import { loadConfig } from '../src/config.js';

describe('configuration', () => {
  it('loads safe local defaults', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({
      PORT: 8080,
      OIDC_AUDIENCE: 'gateway-api',
      RATE_LIMIT_REQUESTS: 20,
    });
  });

  it('rejects invalid limits and URLs', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
    expect(() => loadConfig({ UPSTREAM_URL: 'not-a-url' })).toThrow();
    expect(() => loadConfig({ RATE_LIMIT_REQUESTS: '0' })).toThrow();
  });
});

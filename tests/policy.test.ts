import { createServer, type Server } from 'node:http';

import {
  buildPolicyInput,
  OpaAuthorizer,
  parseDecision,
} from '../src/policy.js';

async function policyServer(
  status: number,
  responseBody: unknown,
): Promise<{ server: Server; endpoint: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Test server did not bind');
  }
  return { server, endpoint: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

describe('policy integration', () => {
  it('builds a normalized policy input', () => {
    expect(
      buildPolicyInput('get', '/api/profile', {
        subject: 'user-1',
        roles: ['viewer'],
        tenant: 'acme',
        expiresAt: 100,
      }),
    ).toEqual({
      method: 'GET',
      path: '/api/profile',
      identity: { subject: 'user-1', roles: ['viewer'], tenant: 'acme' },
    });
  });

  it('parses an allow decision', () => {
    expect(
      parseDecision({ result: { allow: true, reason: 'matched' } }),
    ).toEqual({
      allow: true,
      reason: 'matched',
    });
  });

  it.each([
    null,
    {},
    { result: null },
    { result: { allow: 'yes', reason: 'bad' } },
  ])('rejects malformed OPA responses', (response) => {
    expect(() => parseDecision(response)).toThrow();
  });

  it('calls OPA and returns its structured decision', async () => {
    const { server, endpoint } = await policyServer(200, {
      result: { allow: true, reason: 'policy-match' },
    });

    try {
      await expect(
        new OpaAuthorizer(endpoint, 1000).authorize({
          method: 'GET',
          path: '/api/profile',
          identity: { subject: 'user', roles: ['viewer'], tenant: 'acme' },
        }),
      ).resolves.toEqual({ allow: true, reason: 'policy-match' });
    } finally {
      await close(server);
    }
  });

  it('rejects a non-success OPA response', async () => {
    const { server, endpoint } = await policyServer(500, {
      error: 'temporary',
    });

    try {
      await expect(
        new OpaAuthorizer(endpoint, 1000).authorize({
          method: 'GET',
          path: '/api/profile',
          identity: { subject: 'user', roles: [], tenant: undefined },
        }),
      ).rejects.toThrow('status 500');
    } finally {
      await close(server);
    }
  });
});

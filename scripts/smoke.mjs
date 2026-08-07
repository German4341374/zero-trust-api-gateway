const keycloakBase = 'http://127.0.0.1:8180';
const gatewayBase = 'http://127.0.0.1:8080';

async function waitFor(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function token(username, password) {
  const response = await fetch(
    `${keycloakBase}/realms/portfolio/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'gateway-demo',
        username,
        password,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Token request failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = await response.json();
  if (typeof body.access_token !== 'string')
    throw new Error('Token response has no access token');
  return body.access_token;
}

async function request(path, accessToken) {
  return fetch(`${gatewayBase}${path}`, {
    headers:
      accessToken === undefined
        ? {}
        : { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
}

function expectStatus(response, expected, scenario) {
  if (response.status !== expected) {
    throw new Error(
      `${scenario}: expected ${expected}, received ${response.status}`,
    );
  }
}

await waitFor(
  `${keycloakBase}/realms/portfolio/.well-known/openid-configuration`,
);
await waitFor(`${gatewayBase}/health/ready`);

const viewerToken = await token('viewer', 'local-demo-viewer');
const adminToken = await token('admin', 'local-demo-admin');

expectStatus(
  await request('/proxy/api/profile', viewerToken),
  200,
  'authenticated profile',
);
expectStatus(
  await request('/proxy/api/admin', viewerToken),
  403,
  'viewer admin denial',
);
expectStatus(
  await request('/proxy/api/admin', adminToken),
  200,
  'admin access',
);
expectStatus(
  await request('/proxy/api/tenants/acme/orders', viewerToken),
  200,
  'same-tenant access',
);
expectStatus(
  await request('/proxy/api/tenants/other/orders', viewerToken),
  403,
  'cross-tenant denial',
);
expectStatus(await request('/proxy/api/profile'), 401, 'missing token');

console.log('Zero-trust compose smoke test passed.');

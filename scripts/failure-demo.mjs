import { execFileSync } from 'node:child_process';

const gateway = 'http://127.0.0.1:8080';
const keycloak = 'http://127.0.0.1:8180';

function compose(...args) {
  execFileSync('docker', ['compose', ...args], { stdio: 'inherit' });
}

async function viewerToken() {
  const response = await fetch(
    `${keycloak}/realms/portfolio/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'gateway-demo',
        username: 'viewer',
        password: 'local-demo-viewer',
      }),
    },
  );
  const body = await response.json();
  return body.access_token;
}

async function status(token) {
  const response = await fetch(`${gateway}/proxy/api/profile`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return response.status;
}

const token = await viewerToken();
console.log(`Before failure: ${await status(token)}`);
compose('stop', 'opa');
console.log(
  `OPA unavailable (expected fail-closed 503): ${await status(token)}`,
);
compose('start', 'opa');
await new Promise((resolve) => setTimeout(resolve, 3000));
console.log(`After recovery: ${await status(token)}`);

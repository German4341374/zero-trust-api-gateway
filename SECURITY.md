# Security policy

## Supported version

Security fixes are applied to the latest commit on `main`.

## Reporting a vulnerability

Use GitHub private vulnerability reporting. Do not open a public issue for token validation bypasses, policy bypasses, SSRF, request smuggling, sensitive logging, or dependency vulnerabilities.

## Security posture

The gateway validates issuer, audience, expiration, signature, and the `RS256` algorithm. Authorization is delegated to versioned OPA policy. User-controlled destinations, redirects, cookies, and authorization headers are never forwarded. Redis or OPA failure denies traffic. Subject identifiers are hashed in audit logs.

The included Keycloak users and passwords are disposable local demonstration values. They must never be reused outside this repository.

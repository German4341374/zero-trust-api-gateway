# Architecture and trust boundaries

The public boundary contains only Keycloak and the gateway. PostgreSQL, Redis, OPA, and the demo upstream are attached to an internal Docker network and have no host ports.

## Request flow

1. The client obtains a short-lived access token from Keycloak.
2. The gateway validates the signature from the JWKS endpoint plus issuer, audience, expiry, and algorithm.
3. Redis applies an atomic fixed-window limit to a hash of the token subject.
4. OPA evaluates method, normalized path, roles, and tenant claim. Missing or unavailable policy decisions deny access.
5. The gateway constructs the destination from a fixed upstream origin, strips untrusted headers, disables redirects, and enforces time and size limits.
6. A structured authorization record is logged with a request ID and subject fingerprint, never the token.

## Trade-offs

- Remote JWKS enables automatic key rotation but makes first verification dependent on the identity provider. The library caches keys after retrieval.
- OPA keeps authorization reviewable and testable, but introduces a runtime dependency. This demo deliberately fails closed when it is unavailable.
- A fixed-window Redis limiter is simple and atomic. It can allow a boundary burst near a window transition; production systems may prefer a token bucket.
- Identity headers are safe only because the upstream is isolated and the gateway removes client-supplied versions before adding verified values.

## Production extensions

Use TLS or mTLS between every hop, a production Keycloak topology, Redis authentication and high availability, OPA bundles signed by CI, immutable image digests, external audit storage, and gateway replicas behind a load balancer.

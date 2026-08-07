# Authorization outage runbook

## Symptoms

- Gateway returns `503 dependency_unavailable`.
- Logs show `policy decision failed closed` or `rate limiter unavailable`.
- Readiness may fail when Redis is unavailable.

## Triage

1. Preserve a request ID from an affected response.
2. Check gateway, OPA, and Redis container health and recent logs.
3. Validate the OPA policy separately with `docker compose run --rm opa test /policies`.
4. Confirm the gateway can resolve `opa` and `redis` on the internal network.
5. If tokens fail, check Keycloak readiness and the JWKS endpoint without copying tokens into logs.

## Recovery

Restart only the failed dependency, wait for readiness, then repeat a known permitted request and a known denied request. Do not bypass OPA, disable JWT checks, or switch to fail-open behavior during recovery.

## Escalation evidence

Record timestamps, request IDs, affected paths, container health, and sanitized error messages. Never attach bearer tokens, cookies, passwords, or raw authorization headers.

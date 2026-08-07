# Five-minute demonstration

## Minute 0–1: explain the boundary

Show the architecture diagram in the README. Explain that Keycloak authenticates, OPA authorizes, Redis limits abuse, and the gateway can reach only one configured internal service.

## Minute 1–2: start and verify

```bash
make up
make smoke
```

The smoke test proves successful authentication, role-based access, tenant isolation, and rejection of a missing token.

## Minute 2–3: show policy as code

Open `policies/gateway.rego`. Point out the default deny rule and the separate profile, administrator, and tenant decisions. Run:

```bash
docker compose run --rm opa test /policies
```

## Minute 3–4: demonstrate fail-closed recovery

```bash
make failure-demo
```

The permitted request changes from `200` to `503` while OPA is stopped, then returns to `200` after OPA restarts.

## Minute 4–5: discuss engineering choices

Show the tests for JWT claims and proxy paths, the non-root multi-stage image, internal Docker network, minimal CI permissions, and security runbooks. Finish with `make down`.

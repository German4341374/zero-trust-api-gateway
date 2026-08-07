# Contributing

Contributions are welcome through focused issues and pull requests.

1. Fork the repository and create a branch from `main`.
2. Install the pinned dependencies with `npm ci`.
3. Keep authentication and authorization fail closed.
4. Add tests for every policy, header, routing, or identity change.
5. Run `npm run check` and the Compose smoke test when Docker is available.
6. Use Conventional Commits, for example `fix: reject protocol-relative proxy paths`.

Do not add production credentials, private keys, exported user databases, or real access tokens to tests or documentation.

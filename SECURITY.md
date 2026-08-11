# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub's
[security advisory form](https://github.com/mnkagh/Ekusupo/security/advisories/new),
which is visible only to the maintainers. Include what you did, what you
expected, and what happened instead. A proof of concept helps but is not
required to file.

You should get a first response within a week. If a report is confirmed,
the fix and the advisory are published together.

## What is in scope

- The API (`services/api`), especially authentication, session handling,
  and the provider-token encryption in `providers/token-encryption.ts`.
- Provider connectors (`packages/providers/*`), particularly anything
  that could leak a token or send one to the wrong host.
- The browser extension (`apps/extension`), particularly the content
  script boundary and where sessions are stored.
- The web dashboard (`apps/web`), particularly XSS and CSRF.

## What is not in scope

- **Missing hardening in the local development setup.** `pnpm db:serve`
  intentionally exposes an unauthenticated Postgres socket on
  `127.0.0.1` for inspection; it is a development tool, documented as
  one, and never started by the server.
- **Rate limits being per-process.** Known and documented in
  `docs/running-and-testing.md` §8: the limiter resets on restart and
  does not span instances. That is a scaling limitation, not a report.
- **Anything requiring a provider's own credentials to be
  already compromised.**

## What this project already commits to

These are enforced in code and covered by tests, so a regression in any
of them _is_ a vulnerability worth reporting:

- Provider tokens are encrypted at rest (AES-256-GCM) and never returned
  by any endpoint, including the account export.
- Passwords are stored as salted scrypt hashes and compared in constant
  time.
- One user's transfers, connections and exports are unreachable by
  another, and a resource belonging to someone else is indistinguishable
  from one that does not exist (404, never 403).
- Credential-guessing and transfer-starting are both rate limited.
- No secret is ever committed; everything sensitive comes from the
  environment (see `services/api/.env.example`).

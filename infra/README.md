# Deploying Ekusupo

Two images and a volume. There is no database container: the API embeds
Postgres via `pglite` (ADR-0024), so the database is a directory.

```text
   browser
      |
      v
  web (nginx, static)  --->  api (node)  --->  /data volume
```

## Running it

From the **repository root**, not this directory — a pnpm workspace with
`workspace:*` dependencies cannot be built from a subdirectory:

```sh
cp infra/.env.example infra/.env     # then fill in the encryption key
docker compose -f infra/docker-compose.yml --env-file infra/.env up --build
```

The dashboard is on <http://localhost:8080>, the API on
<http://localhost:3000>.

To stop, keeping every account and transfer:

```sh
docker compose -f infra/docker-compose.yml down
```

To stop and erase all of it:

```sh
docker compose -f infra/docker-compose.yml down -v
```

## Things that will otherwise surprise you

**`VITE_API_BASE_URL` is baked into the web image at build time.** Vite
substitutes `import.meta.env.*` during the build, so the same image
cannot be pointed at a different API afterwards. One image per
environment. This is Vite's model, not a choice made here.

**Four URLs have to agree**, or OAuth fails with a 401 that looks like a
bug: the provider's registered redirect URI, `SPOTIFY_REDIRECT_URI`,
`WEB_APP_URL`, and `VITE_API_BASE_URL`. See
`docs/running-and-testing.md` §4 for why — browsers treat `localhost`
and `127.0.0.1` as different origins for cookies.

**`TRUST_PROXY` must stay off unless a proxy you control overwrites
`X-Forwarded-For`.** Sign-in throttling keys on the client address
(ADR-0033). Off behind a proxy means every client shares one budget,
which is merely annoying; on without one lets anyone forge a header and
skip the limit entirely.

**The API is a single process and holds the database open.** Do not run
two replicas against the same volume — `pglite` is single-connection, and
background transfers (ADR-0033) live in the process that started them.
Horizontal scale needs a hosted Postgres and a real job queue; both are
driver changes, and both are still future work.

## What this does not do

Stated rather than discovered:

- **No TLS.** Both services speak plain HTTP. Put them behind a
  terminating proxy — and set `TRUST_PROXY=true` when you do. Session
  cookies are marked `secure` only when `NODE_ENV=production`, which the
  API image sets.
- **No backups.** The `ekusupo-data` volume holds every account,
  encrypted provider token, and transfer. Backing it up is yours to
  arrange; this is enough to start with:

  ```sh
  docker run --rm -v ekusupo-data:/data -v "$PWD:/out" alpine \
    tar czf /out/ekusupo-backup.tar.gz /data
  ```

- **No secret management.** Credentials come from the environment.
  `infra/.env` is gitignored; a real deployment should use whatever its
  platform provides instead.
- **No log shipping, metrics, or tracing.** CLAUDE.md §13.5 wants all
  three. The API logs to stdout, which is the prerequisite and not the
  feature.
- **No image publishing.** CI builds and tests but does not push
  anywhere, because there is no registry to push to.

## Verifying an image locally

```sh
docker compose -f infra/docker-compose.yml --env-file infra/.env up --build -d
curl -s localhost:3000/health          # {"status":"ok"}
curl -sI localhost:8080/ | head -1     # HTTP/1.1 200 OK
curl -sI localhost:8080/manifest.webmanifest | grep -i content-type
```

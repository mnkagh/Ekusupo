# Running and Testing Ekusupo Locally

A guide to running what exists today and checking it actually works. It
is explicit about the boundary between what you can test with nothing
but this repository, and what needs credentials only you can obtain.

For repo scripts and layout, see
[`development-setup.md`](development-setup.md).

---

## 1. Setup

```sh
corepack enable        # once per machine
pnpm install
pnpm build
```

Then create the API's environment file:

```sh
cp services/api/.env.example services/api/.env
```

Open it and fill in `PROVIDER_TOKEN_ENCRYPTION_KEY`, which the file
explains how to generate. Leave the Spotify values blank for now —
§4 covers them. `.env` is gitignored; never commit it.

## 2. Check the whole repo is healthy

```sh
pnpm build         # tsc -b across every package
pnpm lint          # eslint
pnpm format:check  # prettier
pnpm test          # vitest, 246 tests
pnpm audit         # dependency vulnerabilities
```

All five should pass with no output beyond the command echo. `pnpm test`
takes roughly 30 seconds; `services/api`'s tests are slower than the
rest because they run against a real embedded Postgres rather than a
mock (ADR-0024), and each one boots its own instance.

To run a subset:

```sh
pnpm exec vitest run services/api
pnpm exec vitest run packages/core/src/run-transfer.test.ts
```

## 3. What works with no external accounts at all

Start the API:

```sh
cd services/api && pnpm dev      # http://localhost:3000
```

In a second terminal, start the web dashboard:

```sh
cd apps/web && pnpm dev          # http://localhost:5173
```

### In the browser

Open <http://localhost:5173>. You can:

1. **Sign up** with any email and password. The account is written to a
   real Postgres database on disk.
2. **Sign out and sign back in.** The session is an httpOnly cookie.
3. **Stop the API server (Ctrl-C), start it again, and refresh.** You
   are still signed in and your account still exists — this is the point
   of the on-disk database, and it is the fastest way to confirm
   persistence is genuine rather than an in-memory illusion.
4. **See the Connected Providers screen**, which will show Spotify as
   not connected. Clicking Connect returns a clear error until §4 is
   done.

### From the command line

Sign-up, session cookie, and the transfer API without touching a
browser:

```sh
API=http://localhost:3000

curl -s $API/health

curl -s -c jar.txt -X POST $API/auth/sign-up \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery"}'

curl -s -b jar.txt $API/auth/me
curl -s -b jar.txt $API/providers
curl -s -b jar.txt $API/transfers

# Expect a clear 400: you have not connected Spotify yet.
curl -s -b jar.txt -X POST $API/transfers/dry-run \
  -H 'Content-Type: application/json' \
  -d '{"sourcePlaylistId":"anything"}'
```

Things worth checking here, because they are real security properties
rather than cosmetic ones:

- Every `/transfers` and `/providers` route returns **401** without the
  cookie. Drop `-b jar.txt` from any of the above to see it.
- Sign up as a second user and try to read the first user's transfer by
  its id. You get **404**, not 403 — a transfer belonging to someone
  else is indistinguishable from one that does not exist.

## 4. What needs your own Spotify credentials

Connecting a real Spotify account is the one thing this repository
cannot do on your behalf. It needs a Client ID and Secret issued to
_you_ by Spotify, tied to a redirect URI they must know in advance.
Fabricating them is not possible, and no test in this repo pretends
otherwise: everything below the OAuth boundary is tested with an
injected fake provider, and the boundary itself is tested up to the real
`302` that hands control to Spotify.

### First, a gotcha that will otherwise cost you an hour

**Use one host name everywhere — do not mix `localhost` and
`127.0.0.1`.**

Browsers treat those two as different hosts for cookie purposes. The
OAuth callback requires two cookies: your session, and the CSRF state
token it issued when you clicked Connect. If you browse the dashboard at
`localhost` but Spotify redirects you to `127.0.0.1`, neither cookie is
sent, and the callback fails with a `401` that looks like a bug in the
app rather than a host mismatch.

Spotify's dashboard requires a loopback IP literal (`127.0.0.1`) rather
than `localhost` for new apps' redirect URIs, so the path of least
resistance is to put **everything** on `127.0.0.1`:

```sh
# services/api/.env
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/providers/spotify/callback
WEB_APP_URL=http://127.0.0.1:5173
```

```sh
# start the dashboard pointing at the same host
cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:3000 pnpm dev
```

Then browse to **<http://127.0.0.1:5173>**, not `localhost:5173`. If
your Spotify app settings do accept `localhost`, using `localhost`
consistently works equally well. What matters is that all four — the
redirect URI, `WEB_APP_URL`, `VITE_API_BASE_URL`, and the address in
your URL bar — agree.

### Then

1. Go to <https://developer.spotify.com/dashboard> and log in.
2. **Create app.** Any name and description.
3. Set the **Redirect URI** to exactly
   `http://127.0.0.1:3000/providers/spotify/callback` — it must match
   `SPOTIFY_REDIRECT_URI` character for character.
4. Choose **Web API** when asked which APIs you will use.
5. From the app's settings, copy the Client ID and Client Secret into
   `services/api/.env`.
6. Restart the API server.

Then, in the browser at <http://127.0.0.1:5173>, click **Connect
Spotify**. You should be sent to a genuine Spotify authorization page,
approve the scopes, and land back on the dashboard with Spotify listed
as connected.

If you get a `401` at the callback, it is almost certainly the host
mismatch above rather than bad credentials. `INVALID_CLIENT: Invalid
redirect URI` on Spotify's own page means step 3 does not match your
`.env`.

The scopes requested are read-only: `user-read-private`,
`user-read-email`, `playlist-read-private`,
`playlist-read-collaborative`. Nothing in the current build can modify
your Spotify library, and the Dry Run execution mode is incapable of
writing to any destination by design (ADR-0011).

### Confirming your token is encrypted at rest

Worth doing once, because "tokens are encrypted" is the kind of claim
that deserves checking rather than trusting:

```sh
grep -r "BQ" services/api/data/ | head
```

Spotify access tokens begin with `BQ`. You should find nothing
meaningful — the stored value is an AES-256-GCM ciphertext blob
(ADR-0025).

### Running a real Dry Run

With Spotify connected, grab any playlist ID (from a Spotify playlist
URL: `open.spotify.com/playlist/<THIS PART>`) and:

```sh
curl -s -b jar.txt -X POST $API/transfers/dry-run \
  -H 'Content-Type: application/json' \
  -d '{"sourcePlaylistId":"37i9dQZF1DXcBWIGoYBM5M"}'
```

**Expect `"status": "partial"` with every track skipped.** This looks
like a failure and is not one. Source and destination are both Spotify,
and Spotify's connector is read-only — it has no `tracks.search`
capability, so the engine can read and plan the transfer but has no
catalog to match against. The report says so explicitly in
`providerLimitationsEncountered`. A real cross-provider transfer needs a
second connector, which is the next major piece of work.

To see a genuinely successful end-to-end transfer today, run the
cross-provider integration test, which moves a playlist into a UPF file:

```sh
pnpm exec vitest run tests/integration
```

## 5. The browser extension

```sh
cd apps/extension && pnpm build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `apps/extension/dist`.

Visit any Spotify playlist page. A small panel appears in the
bottom-right corner with Transfer, Preview, and Copy UPF buttons. To
watch what it does, open `chrome://extensions`, find Ekusupo, and click
**Inspect views: service worker** for the background console.

The extension runs the Transfer Engine locally in its own service
worker; it does not talk to `services/api`. Connecting the two is not
done yet.

## 6. Resetting

```sh
rm -rf services/api/data      # wipes users, sessions, connections, transfers
```

The schema is recreated automatically on next start. There is no
migration framework yet, deliberately — no released data exists to
migrate (ADR-0024).

## 7. What is not built yet

So you know where the edges are, rather than discovering them by
hitting one:

- **Live Transfer over HTTP.** The API exposes Dry Run only. The engine
  supports Live Transfer and it is tested, but no route calls it.
- **Most of the dashboard.** CLAUDE.md §8.2 lists thirteen screens.
  Sign-in and Connected Providers exist. Transfer setup, progress,
  reports, history, UPF import/export, and account settings do not —
  the transfer API is reachable by `curl`, but no UI calls it.
- **A second real provider.** Everything cross-provider is proven
  against the UPF file connector, not a second streaming service.
- **Background jobs.** Transfers run inline inside the HTTP request.
  Acceptable for Dry Run, inadequate for large real transfers
  (CLAUDE.md §13.2).
- **Hosted Postgres.** `pglite` is real Postgres, but embedded and
  single-process. Swapping in a hosted instance is a driver change, not
  a redesign.
- **Deployment.** There is no container, no CI pipeline, no hosting.

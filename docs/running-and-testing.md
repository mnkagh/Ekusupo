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
pnpm test          # vitest, 437 tests
pnpm audit         # dependency vulnerabilities
```

All five should pass with no output beyond the command echo. `pnpm test`
takes roughly 30 seconds; `services/api`'s tests are slower than the
rest because they run against a real embedded Postgres rather than a
mock (ADR-0024), and each one boots its own instance.

Because every one of those tests compiles and boots a real database,
the suite is unusually sensitive to a busy machine. **Stop the API
server and `db:serve` before running it** — leaving one running can
starve the tests into timeouts that look like real failures but
disappear on a quiet machine.

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
5. **Import a UPF file and export it again**, on the UPF files panel.
   This is the one full transfer round trip that needs no provider
   account at all — see §4's "Putting a UPF file back".
6. **Change your password, download your data, or delete your account**,
   on the Account panel — see §6b.

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
- Sign in with the wrong password six times in a row. The sixth returns
  **429** with a `Retry-After` header (ADR-0033). It is keyed on your
  address, not on the email, so this cannot be used to lock someone else
  out of their own account. A successful sign-in clears the count, so
  two typos followed by the right password costs you nothing.

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

A connection made today still works tomorrow: a Spotify access token
lasts an hour, and the API refreshes it — and re-stores the result —
whenever it is at or near expiry. Before that was wired up the token and
the `refreshAuthentication` method both existed and nothing joined them,
so every connection broke after an hour with an authentication error the
user could not act on.

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

Playlists longer than 100 tracks are read in full — the connectors follow
each provider's pagination. Worth knowing because the bug in the other
direction is invisible: a short read reports success with a smaller
`totalItems`, and nothing looks wrong.

**Expect `"status": "partial"` with every track skipped.** This looks
like a failure and is not one. Source and destination are both Spotify,
and Spotify's connector is read-only — it has no `tracks.search`
capability, so the engine can read and plan the transfer but has no
catalog to match against. The report says so explicitly in
`providerLimitationsEncountered`. A real cross-provider transfer needs a
second connector, which is the next major piece of work.

### Running a real Live Transfer, into a file

This one genuinely writes, and you can see the result. Pick **A UPF file
(download)** as the destination on the Transfer panel, press
**Transfer**, accept the confirmation, and download the file. Or over
HTTP:

```sh
# Answers 202 with a job id — the transfer runs in the background.
curl -s -b jar.txt -X POST $API/transfers/live \
  -H 'Content-Type: application/json' \
  -d '{"sourcePlaylistId":"37i9dQZF1DXcBWIGoYBM5M","destinationProvider":"upf","confirm":true}'

# Poll until status is completed / partial / failed / cancelled.
curl -s -b jar.txt $API/transfers/<jobId>

# Then fetch the document the transfer produced:
curl -s -b jar.txt $API/transfers/<jobId>/upf

# Changed your mind halfway:
curl -s -b jar.txt -X POST $API/transfers/<jobId>/cancel
```

Transfers no longer block the request (ADR-0033), so a several-hundred
track playlist is a usable operation rather than a request that times
out. While one runs, `GET /transfers/<jobId>` reports `progress` and the
dashboard draws a real bar. Closing the tab does not stop it.

`confirm: true` is required by the route's schema, not by politeness —
drop it and you get a 400 (ADR-0032). Expect `"status": "completed"` with
`createdItems` equal to the track count, and `matchedItems: 0` — a file
has no catalogue to match against, so tracks are written through as-is
(ADR-0018). The report says so.

**Every other destination will refuse, and should.** Spotify's connector
is read-only and Apple Music's is catalogue-only, so both return a 400
naming the limitation. YouTube Music is the one real streaming
destination; it needs a Google Cloud OAuth client, and it has not been
verified against live servers.

### Putting a UPF file back

Upload one on the **UPF files** panel, choose a destination, and press
Import. An invalid file is rejected with every fault listed by path
rather than one generic message — try hand-editing a `createdAt` to
`"nope"` and uploading it to see that.

To see a cross-provider transfer proven end-to-end without any account at
all, run the integration tests, which move a playlist between two
independently-implemented connectors:

```sh
pnpm exec vitest run tests/integration
```

## 4b. Installing the dashboard as an app, and testing it on a phone

The dashboard is a Progressive Web App (ADR-0030): the same build
installs to a desktop dock or a phone home screen. Two things about
testing it that will otherwise waste your time:

**The service worker only registers in a production build.** `pnpm dev`
deliberately never registers it, so you cannot test installation from the
dev server. Use a preview build:

```sh
cd apps/web && pnpm build && pnpm preview   # http://localhost:4173
```

**Installing on a phone needs HTTPS or `localhost`.** Browsers refuse to
install a PWA served over plain HTTP from a LAN address, so
`http://192.168.x.x:4173` will load but show no install prompt. Either
tunnel it (`cloudflared tunnel --url http://localhost:4173`, `ngrok http
4173`, or similar) and open the HTTPS URL on the phone, or use Chrome's
device emulation on the desktop.

Then:

- **Chrome / Edge, desktop** — an install icon appears in the address
  bar. Or DevTools → **Application** → **Manifest** to check the icons
  and **Service Workers** to confirm it activated.
- **Android** — the browser menu offers **Install app** / **Add to Home
  screen**.
- **iOS Safari** — Share → **Add to Home Screen**. iOS gives no automatic
  prompt; this is Safari's behaviour, not a bug in the manifest.

To check responsiveness without a phone, DevTools device toolbar down to
320px wide. Nothing should overflow horizontally at any width.

Offline behaviour is deliberately limited: with the network off, the app
shell still loads, but any screen that needs the API shows an error
rather than stale data. The service worker never caches API responses —
a cached playlist or transfer report would be a stale answer presented as
a current one.

## 5. Browsing the database (pgAdmin, psql, DBeaver)

The database is genuine Postgres, but it normally runs _inside_ the API
process and never opens a port — so by default there is nothing for
pgAdmin to connect to. To get one:

```sh
# stop the API server first — see the warning below
cd services/api && pnpm db:serve
```

That serves the same on-disk data over the real Postgres wire protocol:

| Setting  | Value       |
| -------- | ----------- |
| Host     | `127.0.0.1` |
| Port     | `5432`      |
| Database | `postgres`  |
| Username | `postgres`  |
| Password | _(blank)_   |

Any Postgres client works — pgAdmin, psql, DBeaver, TablePlus. The
server reports itself as PostgreSQL 17.5, because that is what it
actually is.

Two limitations, both real:

- **Stop the API server first.** `pglite` is single-process: one data
  directory, one owner. Running both against the same directory risks
  corrupting it. This is why `db:serve` is a separate command rather
  than something the API does on the side.
- **One connection at a time.** The socket bridge available for this
  pglite version is single-connection. `psql` and a single DBeaver
  session are fine. pgAdmin opens several connections at once and may
  struggle — if it does, use `psql` or read the data through the API
  instead. This is a limitation of the bridge, not of your setup.

There is no authentication on that socket, which is exactly why it binds
to `127.0.0.1` and never `0.0.0.0` — the database holds password hashes
and encrypted provider tokens.

## 6. The browser extension

```sh
cd apps/extension
pnpm build           # Chrome/Edge -> dist/
pnpm build:firefox   # Firefox     -> dist-firefox/
pnpm build:all       # both
```

The two folders exist because Chrome and Firefox need different MV3
manifests — see ADR-0031. Load whichever matches your browser:

- **Chrome / Edge** — `chrome://extensions` → enable **Developer mode** →
  **Load unpacked** → select `apps/extension/dist`.
- **Firefox** — `about:debugging#/runtime/this-firefox` → **Load
  Temporary Add-on…** → select `apps/extension/dist-firefox/manifest.json`
  (the manifest file itself, not the folder). Temporary add-ons are
  cleared when Firefox restarts; reload after each rebuild.

Safari is not supported.

Visit any Spotify playlist page. A small panel appears in the
bottom-right corner with Transfer, Preview, and Copy UPF buttons. Apple
Music and YouTube Music pages are detected too, though their transfer
paths have not been verified against live provider servers.

To watch what it does: in Chrome, `chrome://extensions` → Ekusupo →
**Inspect views: service worker**. In Firefox, `about:debugging` →
**Inspect** next to the add-on.

The extension runs the Transfer Engine locally in its own service
worker; it does not talk to `services/api`. Connecting the two is not
done yet.

## 6b. Account settings

The **Account** panel is where CLAUDE.md §21.2's promises live:

- **Change password.** Requires the current one even though you are
  already signed in, and signs out your other devices — but not the tab
  you are in, which gets a fresh cookie. Prove it by signing in from a
  private window first, changing the password, then reloading the private
  window: it is signed out.
- **Download my data.** Everything Ekusupo holds about you as one JSON
  file. Provider access tokens are deliberately excluded — they are
  stored encrypted so that nothing hands them back out. Disconnect a
  provider to revoke them.
- **Delete my account.** Needs your password _and_ the literal word
  `DELETE`. Both are enforced by the API, not just the UI. It really
  deletes: sessions, provider connections and their encrypted tokens,
  transfer history and UPF exports all cascade with it, and the email
  becomes free to sign up with again.

## 7. Resetting

```sh
rm -rf services/api/data      # wipes users, sessions, connections, transfers
```

The schema is recreated automatically on next start. There is no
migration framework yet, deliberately — no released data exists to
migrate (ADR-0024).

## 8. What is not built yet

So you know where the edges are, rather than discovering them by
hitting one:

- **A verified transfer into a streaming provider.** Live Transfer ships
  and works end-to-end into a UPF file (ADR-0032). YouTube Music is the
  only connector that declares write capability, and its write path has
  never met a live Google server — that needs a Google Cloud OAuth
  client. Apple Music is catalogue-only and Spotify's connector is
  read-only, so neither can be a destination at all. Everything
  cross-provider that _is_ proven end-to-end is proven against the UPF
  file connector.
- **Apple Music and YouTube Music reads, verified.** Both connectors are
  tested up to the network boundary against injected fakes, but neither
  has been run against live provider servers — that needs a paid Apple
  developer account and a Google Cloud OAuth client (ADR-0029).
- **Overriding a low-confidence match.** The report now shows every
  uncertain match with both ends, the confidence, the reason and the
  alternatives considered — but you cannot pick a different one.
  Replacing a track needs the destination to support removing one from a
  playlist (`playlists.removeTracks`), which the Connector SDK declares
  and no provider implements.
- **Deploying it anywhere.** `infra/` has a Dockerfile per service and a
  compose file, and CI builds and tests every push — but the images have
  never been built or run here (no Docker in this environment), there is
  no registry, no TLS, and no backups. See `infra/README.md`.
- **A store-listed mobile app.** The dashboard is an installable PWA
  (ADR-0030) — it installs to a home screen and works offline for the
  shell — but it is not in the App Store or Play Store and does not use
  native APIs.
- **A live-installed Firefox extension.** The Firefox build is produced
  and asserted by tests, but has not been loaded in a real Firefox.
- **Resuming an interrupted transfer.** Transfers run in the background
  now (ADR-0033), but in this process — so a restart mid-transfer fails
  the job with a reason rather than picking it up again. Resuming needs
  to record how far the writes got, which nothing does yet
  (CLAUDE.md §9.3).
- **Rate limiting beyond credential guessing.** Sign-in, sign-up and the
  password checks are throttled; the transfer routes are not. The
  limiter is also per-process and in memory, so it resets on restart and
  does not span instances.
- **Hosted Postgres.** `pglite` is real Postgres, but embedded and
  single-process. Swapping in a hosted instance is a driver change, not
  a redesign.
- **Deployment.** There is no container, no CI pipeline, no hosting.

# ADR-0032: Live Transfer over HTTP, UPF as a destination, and account control

Status: Accepted

## Context

Three things stood between this repository and the MVP CLAUDE.md §8.2
describes. All three had the same shape: the engine could already do the
work, but no HTTP route reached it.

- **Live Transfer.** `runLiveTransfer` shipped in ADR-0011 and gained
  write-through in ADR-0018. The API exposed Dry Run only.
- **UPF import and export.** `@ekusupo/provider-upf-file` existed and was
  proven end-to-end by an integration test. Nothing in the product could
  produce or consume a file.
- **Account settings.** §21.2 promises a user can change their password,
  export their data, and delete everything. None of it existed.

A fourth problem underlay the first two: **there was no destination this
server could honestly write to.** Spotify's connector is read-only by
design. Apple Music's is catalogue-only. YouTube Music's connector
declares write capabilities, but ADR-0029 deliberately requested
`youtube.readonly`, so the granted token could not use them.

## Decision

**A UPF document is a first-class destination, `"upf"`.** Not a registry
entry — there is no account to connect and no credentials to configure,
so `GET /providers/catalog` has nothing to say about it. It is always
available, needs nothing connected, and is what "back up" means in this
product.

This makes Live Transfer genuinely testable end-to-end today rather than
theoretically correct pending someone else's credentials.

**Import is the same engine with the document as the source.**
`POST /transfers/import-upf` writes the uploaded document to a scratch
file, points the same UPF connector at it, and runs `runLiveTransfer`
into the chosen destination. A separate import path with its own matching
rules would be the duplication §3.3 forbids.

**One scratch-file abstraction serves both directions.**
`upf-scratch-file.ts` produces a file-backed connector that is either
seeded (import) or empty (export). A real file rather than an in-memory
twin, because a second implementation of the connector's contract is a
second thing to keep correct. The path is generated under the OS temp
directory and never derived from a request, so there is no traversal
surface.

**Exports live in Postgres, next to the job.** `transfer_jobs.upf_document`
is a `jsonb` column. One storage system rather than two: `ON DELETE
CASCADE` disposes of exports with the account, `rm -rf services/api/data`
still resets everything, and there is no orphaned-file sweeper to write.
`listForUser` returns `hasUpfDocument` rather than the document — a
hundred jobs must not mean a hundred libraries in one response.

**`confirm: true` is in the route's JSON schema, not in a handler.** A
Live Transfer writes to a real destination and §9.3 requires explicit
confirmation for exactly that. In the schema, no handler can forget it,
and a client that copies the Dry Run request shape gets a 400 rather than
an unexpected write.

**Write capability is checked before the source is read.**
`describeWriteLimitation` names the provider and offers the way out.
Leaving it to `runLiveTransfer` would produce a generic "cannot create or
populate playlists" _after_ the read had already happened.

**YouTube's scope widens to `youtube`.** ADR-0029 set the condition
explicitly: "the scope widens when Live Transfer ships, not before." It
ships here. `youtube` is the narrowest scope Google offers that permits
`playlists.insert`; there is no playlist-only write scope. Anyone
connected before this change holds a read-only token and must reconnect.

**Password changes invalidate every session, then issue a fresh one.**
Whoever knew the old password may still hold a live session; leaving
those standing would make the change decorative. The person making the
change gets a new cookie in the response, so they are not signed out of
the tab they are using. The current password is required even though the
caller is already authenticated — an unattended session is the exact
situation this defends against.

**Deleting an account needs the password _and_ the literal string
`DELETE`.** The password proves who is asking; the confirmation proves
they meant to. Deletion is one `DELETE FROM users`, because every
referencing table declares `ON DELETE CASCADE` — a hand-written cleanup
would be a weaker second copy of a rule the database already enforces,
and one that could silently miss a new table.

**The data export excludes provider tokens.** They are encrypted at rest
precisely so nothing hands them back out (§12.1, §21.3); an export that
decrypted them would undo that in one request. Which providers are
connected, and since when, is included — and the export says plainly what
it omits and why.

## Consequences

- Every CLAUDE.md §8.2 MVP screen now exists: sign-in, connected
  providers, transfer setup, progress, report, history, UPF import and
  export, account settings.
- A user can move a playlist into a file, keep it, and put it back — with
  no provider account at all beyond reading the source. That is §3.8's
  user-ownership promise made concrete.
- `@ekusupo/upf` gained a real validator (`parseUpfDocument`), which
  §5.2 always required of the format and nothing had yet provided. It
  reports every fault with a path rather than the first one.
- `ensureSchema` now carries an `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
  Still additive and idempotent, but this is the last change of its kind
  that can be made this way — a rename, a backfill or a narrowing is the
  signal to adopt `drizzle-kit` rather than to get clever here.
- **Transferring into a real streaming provider remains unverified
  against live servers.** The route, the capability check and the write
  path are exercised against injected fakes; YouTube's actual acceptance
  of a `playlists.insert` needs a Google Cloud OAuth client this
  repository cannot obtain.

## Alternatives Considered

- **Wait for a verified streaming destination before shipping Live
  Transfer.** Rejected: it would leave a tested engine unreachable
  indefinitely, gated on credentials outside this repository, when a
  genuinely useful destination was already available.
- **Store exports as files under `data/exports/<userId>/`.** Rejected —
  two storage systems, a traversal surface to defend, orphaned files to
  sweep, and a second thing to back up, all to avoid one `jsonb` column.
- **Validate UPF in the web app before uploading.** Rejected: two
  implementations of one contract, and the client's would inevitably
  drift from the server's. The client checks JSON syntax only, so an
  unreadable file fails without a round trip.
- **A one-click account deletion with a modal.** Rejected — a modal is a
  UI convention, not a guarantee. The password and the typed word are
  enforced by the API, so no client can skip them.

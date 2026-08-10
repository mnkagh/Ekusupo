# ADR-0033: Transfers run in the background; credential guessing is throttled

Status: Accepted

## Context

Two things were wrong with a build otherwise described as user-ready.

**Transfers blocked the HTTP request.** `POST /transfers/dry-run` ran the
whole engine inline and answered with the finished report. The engine
makes one provider call per track, so a 500-track playlist is minutes of
work: long enough to hit a proxy timeout, a browser timeout, or a
platform's request limit, and with nothing on screen but a spinner in the
meantime. CLAUDE.md §13.2 is explicit that this belongs in a background
job, and §9.3 asks for progress reporting and cancellation that an inline
run cannot provide.

**Nothing throttled password guessing.** `/auth/sign-in` could be called
without limit. §12.6 lists rate limiting first among the abuse-prevention
measures, and it was the one security control in that list with no
implementation at all.

## Decision

### Transfers

**`POST /transfers/{dry-run,live,import-upf}` answer 202 with a job.**
Not the report — the work has been accepted, not finished. Clients poll
`GET /transfers/:id`, which now carries `progress` alongside `status` and
`report`.

**`TransferRunner` owns the background run.** In-process, not a queue.
That matches the deployment this repository has — one process, embedded
Postgres (ADR-0024) — and reaching for BullMQ or a separate worker
service before either is a real constraint is the premature
infrastructure §16.2 warns against. The seam for adding one later is that
class, not a rewrite.

**A decorator announces the job, rather than changing `@ekusupo/core`.**
The engine legitimately owns job creation — it is what knows the
providers and the mode — and the same package runs inside a browser
extension with no HTTP request to answer. `AnnouncingJobStore` resolves a
promise the instant `create` lands, so the route can reply with an id
while the transfer runs on.

**That decorator also withholds the terminal status until everything is
stored.** This is not tidiness; it is a race that a test caught. The
engine writes its final status and only then returns, so a client that
polled until `completed` and immediately downloaded the export got a 404
for a file that was about to exist. Deferring the terminal write makes
"terminal" mean "everything about this job is stored", which is the only
version of it a poller can use.

**Progress writes are throttled to one per 400ms.** The engine emits an
event per track; a 500-track transfer does not need 500 `UPDATE`
statements to move a bar. The `done` event always lands, because it is
the one a poller is waiting for.

**Cancellation is cooperative, and that is the whole mechanism.**
`POST /transfers/:id/cancel` writes the status; the engine already checks
it between tracks. Nothing has to be signalled or aborted, which is
exactly why it works on a job the original request stopped waiting for
long ago. **Tracks already written stay written** — a transfer is not a
transaction, and silently deleting things the user can see on the
destination would be worse than stopping.

**Jobs left `running` by a dead process are failed at boot.**
`failInterruptedJobs` runs before the server accepts a request, so nobody
polls a job nothing is working on. Resuming instead (§9.3's "resume where
feasible") needs to know how far the writes got, which nothing records
yet — that is a real future feature, not a thing to fake.

### Rate limits

**A fixed-window counter, keyed by client address.** Fixed window admits
a known burst at the boundary (up to 2× across two adjacent windows),
which is acceptable for slowing credential guessing and is why this is
forty lines rather than a dependency. It is not a general-purpose API
quota and is not used as one.

**Keyed by address, deliberately not by email.** Counting failures per
account would let anyone lock a victim out of their own account by
guessing at it — trading a brute-force risk for a denial-of-service one.

**One budget follows the secret, not the URL.** Changing a password and
deleting an account both verify the same password, so they share a
counter. Separate ones let a guesser alternate endpoints for twice the
attempts; a test proves they cannot.

**A successful sign-in clears the budget**, so a person who mistyped
twice is not punished for it. A correct password is proof this was not
credential guessing.

**`trustProxy` is off unless `TRUST_PROXY=true`.** The limiter keys on
`request.ip`, which follows `X-Forwarded-For` only when that is on — and
that header is trivially forged by anyone talking to the server directly.
Wrong-off over-limits a shared address; wrong-on is a hole. The safe
default is the inconvenient one.

## Consequences

- A large playlist is now a usable transfer: it shows real progress, can
  be cancelled, and survives the user closing the tab.
- The API contract changed. `POST /transfers/*` answers 202 with `{ job,
pollUrl }`; the report is no longer in that response. Every client had
  to be updated, and the web dashboard now polls through one shared
  `useTransferJob` hook.
- `transfer_jobs` gained a `progress` column, added by the same
  additive `ALTER TABLE … IF NOT EXISTS` pattern as `upf_document`.
- Sign-in, sign-up, password change and account deletion return **429**
  with `Retry-After` once their budget is spent.
- **The limiter is per-process and in memory.** It resets on restart and
  does not span instances. Running several behind a load balancer needs a
  shared store — a driver change the interface already allows.
- Work still does not survive a restart. It is now reported honestly
  rather than left hanging, which is the difference between a limitation
  and a bug.

## Alternatives Considered

- **Server-Sent Events or a WebSocket for progress.** Rejected: a second
  transport to keep working, for a number that changes a few times a
  second at most. Polling every 700ms is indistinguishable to a user.
- **A real job queue (BullMQ, a worker service).** Rejected for now —
  §16.2. It buys durability across restarts and horizontal scale, neither
  of which this deployment has or needs yet, at the cost of Redis and a
  second process.
- **Keeping the synchronous response for small playlists.** Rejected: two
  code paths, and the size threshold would be a guess that is wrong for
  someone.
- **`@fastify/rate-limit`.** Reasonable, and a fair future choice. Passed
  over because the defaults would need auditing anyway and the piece
  actually needed here — a fixed window, keyed by address, resettable on
  success — is smaller than the audit.
- **Locking an account after N failed attempts.** Rejected: it hands
  anyone who knows an email address a way to lock its owner out.

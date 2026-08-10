import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { runDryRunTransfer, runLiveTransfer } from "@ekusupo/core";
import type {
  RunTransferResult,
  TransferJob,
  TransferJobStore,
  TransferProgressEvent,
} from "@ekusupo/core";
import type { UpfDocument } from "@ekusupo/upf";

import type { Database } from "../db/client.js";
import { PostgresTransferJobStore } from "./postgres-transfer-job-store.js";

/** One end of a transfer, plus whatever teardown it needs. */
export interface TransferEnd {
  provider: MusicProvider;
  session: AuthSession;
  dispose: () => Promise<void>;
}

export interface StartTransferParams {
  userId: string;
  mode: "dryRun" | "live";
  source: TransferEnd;
  destination: TransferEnd;
  sourcePlaylistId: string;
  /** Reads the document a UPF destination produced; returns undefined for any other. */
  collectUpfDocument?: () => Promise<UpfDocument | undefined>;
  /** Appended to the report when an app-level token was used to read a public playlist. */
  onFinished?: (result: RunTransferResult) => void;
}

/**
 * At most one progress write per this interval. The engine emits an event
 * per track, and a 500-track transfer does not need 500 UPDATE
 * statements to tell someone it is 60% done — the position is only ever
 * read by a human watching a bar move.
 */
const PROGRESS_WRITE_INTERVAL_MS = 400;

/**
 * Announces the job the moment the engine creates it, so the route can
 * reply with an id while the transfer is still running.
 *
 * A decorator rather than a change to `@ekusupo/core`: the engine
 * legitimately owns job creation (it is the thing that knows the
 * providers and the mode), and the same package runs inside a browser
 * extension that has no HTTP request to answer. Everything else passes
 * straight through.
 */
const TERMINAL_STATUSES = new Set(["completed", "partial", "failed", "cancelled"]);

class AnnouncingJobStore implements TransferJobStore {
  private announce!: (job: TransferJob) => void;
  readonly created: Promise<TransferJob>;
  private deferredTerminal?: Partial<TransferJob>;

  constructor(private readonly inner: TransferJobStore) {
    this.created = new Promise<TransferJob>((resolve) => {
      this.announce = resolve;
    });
  }

  async create(job: TransferJob): Promise<void> {
    await this.inner.create(job);
    this.announce(job);
  }

  get(id: string): Promise<TransferJob | undefined> {
    return this.inner.get(id);
  }

  /**
   * Non-terminal patches pass straight through. A **terminal** one is
   * held back until `flushTerminal`.
   *
   * The engine writes its final status and only then returns, so without
   * this the row would say `completed` while the report and the exported
   * document were still being stored — and a client that polls until
   * terminal and immediately downloads would get a 404 for a file that
   * was about to exist. Deferring makes "terminal" mean "everything about
   * this job is stored", which is the only version of it a poller can
   * use.
   */
  async update(id: string, patch: Partial<TransferJob>): Promise<void> {
    if (patch.status && TERMINAL_STATUSES.has(patch.status)) {
      this.deferredTerminal = { ...this.deferredTerminal, ...patch };
      return;
    }
    return this.inner.update(id, patch);
  }

  /** Applies the withheld terminal status. Always call, in a `finally`. */
  async flushTerminal(id: string, override?: Partial<TransferJob>): Promise<void> {
    const patch = override ?? this.deferredTerminal;
    if (!patch) return;
    this.deferredTerminal = undefined;
    await this.inner.update(id, patch);
  }
}

/**
 * Runs transfers off the request thread (CLAUDE.md §13.2). The route gets
 * a job id as soon as the row exists; the work continues afterwards and
 * the client polls `GET /transfers/:id`.
 *
 * In-process, not a queue. That matches the deployment this repository
 * has — one process, embedded Postgres (ADR-0024) — and the two
 * consequences are stated rather than hidden: work does not survive a
 * restart (`failInterruptedJobs` marks those failed at boot), and it does
 * not spread across instances. Reaching for BullMQ or a worker service
 * before either is a real constraint would be exactly the premature
 * infrastructure CLAUDE.md §16.2 warns about; the seam to add one later
 * is this class.
 */
export class TransferRunner {
  constructor(private readonly db: Database) {}

  /**
   * Resolves once the job row exists — not once the transfer finishes.
   * Rejects only if the job could not be created at all, which is a
   * genuine server fault rather than a transfer outcome.
   */
  async start(params: StartTransferParams): Promise<TransferJob> {
    const jobStore = new PostgresTransferJobStore(this.db, params.userId);
    const announcing = new AnnouncingJobStore(jobStore);

    let lastWrite = 0;
    let pendingProgress: TransferProgressEvent | undefined;
    // A box, not a plain `let`: the engine can emit progress before the
    // job row is announced, and the closure below has to see the id the
    // moment it exists rather than the value captured at creation.
    const announced: { jobId?: string } = {};

    const onProgress = (event: TransferProgressEvent): void => {
      pendingProgress = event;
      const jobId = announced.jobId;
      if (!jobId) return;

      const now = Date.now();
      // `done` always lands: it is the event a poller is waiting for, and
      // dropping it would leave a finished job showing a stale position.
      if (event.step !== "done" && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
      lastWrite = now;

      // Deliberately not awaited: a slow progress write must not stall
      // the transfer, and a failed one is not worth failing a transfer
      // over — the next event overwrites it anyway.
      void jobStore.saveProgress(jobId, event).catch(() => undefined);
    };

    const run = params.mode === "dryRun" ? runDryRunTransfer : runLiveTransfer;
    const running = run({
      source: params.source.provider,
      sourceSession: params.source.session,
      destination: params.destination.provider,
      destinationSession: params.destination.session,
      sourcePlaylistId: params.sourcePlaylistId,
      jobStore: announcing,
      options: { onProgress },
    });

    // Whichever comes first: the engine announcing the row, or the run
    // failing outright. Without the second, a create that threw would
    // leave this awaiting a promise nothing will ever settle.
    const job = await Promise.race([
      announcing.created,
      running.then(
        (result) => result.job,
        (error: unknown) =>
          Promise.reject(error instanceof Error ? error : new Error(String(error))),
      ),
    ]);
    announced.jobId = job.id;

    void this.finish(running, jobStore, announcing, job.id, params, () => pendingProgress);
    return job;
  }

  /** The tail of every run: store the report and any document, then clean up. */
  private async finish(
    running: Promise<RunTransferResult>,
    jobStore: PostgresTransferJobStore,
    announcing: AnnouncingJobStore,
    jobId: string,
    params: StartTransferParams,
    latestProgress: () => TransferProgressEvent | undefined,
  ): Promise<void> {
    let terminalOverride: Partial<TransferJob> | undefined;

    try {
      const result = await running;
      await jobStore.saveReport(jobId, result.report);

      const document = await params.collectUpfDocument?.();
      if (document) await jobStore.saveUpfDocument(jobId, document);

      const progress = latestProgress();
      if (progress) await jobStore.saveProgress(jobId, progress);

      params.onFinished?.(result);
    } catch (error) {
      // The engine reports its own failures in the report and does not
      // throw, so reaching here means something outside it broke —
      // storage, or a provider client misbehaving. The job must not be
      // left saying `running` forever.
      console.warn(`[Ekusupo API] transfer ${jobId} failed unexpectedly`, error);
      terminalOverride = { status: "failed", updatedAt: new Date().toISOString() };
      await jobStore
        .saveReport(jobId, {
          sourceProvider: params.source.provider.manifest.name,
          destinationProvider: params.destination.provider.manifest.name,
          itemType: "playlist",
          totalItems: 0,
          matchedItems: 0,
          createdItems: 0,
          skippedItems: 0,
          failedItems: 0,
          lowConfidenceMatches: [],
          unavailableItems: [],
          providerLimitationsEncountered: [],
          userActionsRequired: [],
          failureReason: "The transfer stopped unexpectedly. Nothing further was written.",
        })
        .catch(() => undefined);
    } finally {
      // Last, and unconditionally: this is what makes the job visible as
      // finished, so it must happen after everything a poller will read
      // and even if storing some of it went wrong. A job left
      // non-terminal here would be polled forever.
      await announcing.flushTerminal(jobId, terminalOverride).catch(() => undefined);

      await Promise.all([
        params.source.dispose().catch(() => undefined),
        params.destination.dispose().catch(() => undefined),
      ]);
    }
  }
}

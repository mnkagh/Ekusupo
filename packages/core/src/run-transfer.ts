import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import { matchTrack } from "@ekusupo/matching";
import type { MatchDecision } from "@ekusupo/matching";
import type { Playlist, Track } from "@ekusupo/upf";

import type { ExecutionMode } from "./execution-mode.js";
import type { TransferJob } from "./transfer-job.js";
import type { TransferJobStore } from "./transfer-job-store.js";
import { InMemoryTransferJobStore } from "./transfer-job-store.js";
import type { TransferOptions } from "./transfer-options.js";
import { createEmptyReport } from "./transfer-report.js";
import type { TransferReport } from "./transfer-report.js";

export interface RunTransferParams {
  source: MusicProvider;
  sourceSession: AuthSession;
  destination: MusicProvider;
  destinationSession: AuthSession;
  sourcePlaylistId: string;
  jobStore?: TransferJobStore;
  options?: TransferOptions;
}

export interface RunTransferResult {
  job: TransferJob;
  report: TransferReport;
}

const DEFAULT_RETRY_DELAY_MS = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

type RetryOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** The only retry policy in v0.1: one retry on a `retryable` ConnectorError. */
async function callWithRetry<T>(fn: () => Promise<T>): Promise<RetryOutcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (!(error instanceof ConnectorError) || !error.retryable) {
      return { ok: false, error };
    }
    await wait(error.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS);
    try {
      return { ok: true, value: await fn() };
    } catch (retryError) {
      return { ok: false, error: retryError };
    }
  }
}

async function createJob(
  jobStore: TransferJobStore,
  params: Pick<RunTransferParams, "source" | "destination" | "sourcePlaylistId">,
  mode: ExecutionMode,
): Promise<TransferJob> {
  const job: TransferJob = {
    id: newJobId(),
    status: "pending",
    sourceProvider: params.source.manifest.name,
    destinationProvider: params.destination.manifest.name,
    sourcePlaylistId: params.sourcePlaylistId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    dryRun: mode === "dryRun",
  };
  await jobStore.create(job);
  return job;
}

async function failJob(
  jobStore: TransferJobStore,
  job: TransferJob,
  report: TransferReport,
  reason: string,
): Promise<RunTransferResult> {
  const updatedAt = nowIso();
  job.status = "failed";
  job.updatedAt = updatedAt;
  await jobStore.update(job.id, { status: "failed", updatedAt });
  report.failureReason = reason;
  report.providerLimitationsEncountered.push(reason);
  return { job, report };
}

async function finishJob(
  jobStore: TransferJobStore,
  job: TransferJob,
  report: TransferReport,
): Promise<RunTransferResult> {
  const finalStatus =
    job.status === "cancelled"
      ? "cancelled"
      : report.failedItems > 0 || report.skippedItems > 0
        ? "partial"
        : "completed";

  job.status = finalStatus;
  job.updatedAt = nowIso();
  await jobStore.update(job.id, { status: finalStatus, updatedAt: job.updatedAt });
  return { job, report };
}

type ReadSourceResult = { playlist: Playlist } | { failed: RunTransferResult };

/** Validates and reads the source playlist — the one requirement both execution modes share. */
async function readSourcePlaylist(
  source: MusicProvider,
  sourceSession: AuthSession,
  sourcePlaylistId: string,
  jobStore: TransferJobStore,
  job: TransferJob,
  report: TransferReport,
): Promise<ReadSourceResult> {
  const sourceCapabilities = source.getCapabilities();
  const getPlaylist = source.getPlaylist;
  if (!getPlaylist || !sourceCapabilities.supports.has("playlists.read")) {
    return {
      failed: await failJob(jobStore, job, report, "Source provider cannot read playlists."),
    };
  }

  await jobStore.update(job.id, { status: "running", updatedAt: nowIso() });
  job.status = "running";

  try {
    const playlist = await getPlaylist(sourceSession, sourcePlaylistId);
    report.totalItems = playlist.items.length;
    return { playlist };
  } catch (error) {
    return {
      failed: await failJob(
        jobStore,
        job,
        report,
        `Could not read the source playlist: ${describeError(error)}`,
      ),
    };
  }
}

async function isCancelled(jobStore: TransferJobStore, job: TransferJob): Promise<boolean> {
  const current = await jobStore.get(job.id);
  if (current?.status === "cancelled") {
    job.status = "cancelled";
    return true;
  }
  return false;
}

type TrackMatchAttempt =
  | { kind: "matched"; decision: MatchDecision }
  | { kind: "search_failed"; error: unknown }
  | { kind: "no_match" };

async function matchAgainstDestination(
  searchTracks: NonNullable<MusicProvider["searchTracks"]>,
  destinationSession: AuthSession,
  sourceTrack: Track,
): Promise<TrackMatchAttempt> {
  const searchResult = await callWithRetry(() =>
    searchTracks(destinationSession, {
      text: sourceTrack.title,
      isrc: sourceTrack.externalIds?.isrc,
    }),
  );
  if (!searchResult.ok) return { kind: "search_failed", error: searchResult.error };

  const outcome = matchTrack(sourceTrack, searchResult.value.items);
  return outcome.decision ? { kind: "matched", decision: outcome.decision } : { kind: "no_match" };
}

/** Applies a match attempt's outcome to the report; returns the decision only when matched. */
function recordMatchAttempt(
  report: TransferReport,
  sourceTrack: Track,
  attempt: TrackMatchAttempt,
): MatchDecision | undefined {
  if (attempt.kind === "search_failed") {
    report.providerLimitationsEncountered.push(
      `Search failed for "${sourceTrack.title}": ${describeError(attempt.error)}`,
    );
    report.unavailableItems.push(sourceTrack);
    report.skippedItems += 1;
    return undefined;
  }

  if (attempt.kind === "no_match") {
    report.unavailableItems.push(sourceTrack);
    report.skippedItems += 1;
    return undefined;
  }

  report.matchedItems += 1;
  if (attempt.decision.risk !== "low") {
    // Paired with the source track, not stored bare: a list of chosen
    // candidates cannot be reviewed without saying what each was chosen
    // for (CLAUDE.md §10.4).
    report.lowConfidenceMatches.push({ source: sourceTrack, decision: attempt.decision });
  }
  return attempt.decision;
}

/**
 * Validates the plan, normalizes to UPF, and matches against the
 * destination where possible. Never requires destination write or search
 * capabilities, and never mutates any provider — see
 * docs/decisions/0011-transfer-engine-execution-modes.md.
 */
export async function runDryRunTransfer(params: RunTransferParams): Promise<RunTransferResult> {
  const { source, sourceSession, destination, destinationSession, sourcePlaylistId } = params;
  const jobStore = params.jobStore ?? new InMemoryTransferJobStore();
  const onProgress = params.options?.onProgress;

  const job = await createJob(jobStore, { source, destination, sourcePlaylistId }, "dryRun");
  const report = createEmptyReport(source.manifest.name, destination.manifest.name);

  onProgress?.({ step: "validating" });

  const read = await readSourcePlaylist(
    source,
    sourceSession,
    sourcePlaylistId,
    jobStore,
    job,
    report,
  );
  if ("failed" in read) return read.failed;
  const tracks = read.playlist.items.map((item) => item.track);

  onProgress?.({ step: "reading_source" });

  const destinationCapabilities = destination.getCapabilities();
  const searchTracks = destination.searchTracks;
  const canSearch = Boolean(searchTracks) && destinationCapabilities.supports.has("tracks.search");
  if (!canSearch) {
    report.providerLimitationsEncountered.push(
      "Destination provider cannot search tracks — dry run produced a plan without destination matches.",
    );
  }

  for (let index = 0; index < tracks.length; index += 1) {
    if (await isCancelled(jobStore, job)) break;

    const sourceTrack = tracks[index];
    if (!sourceTrack) continue;

    onProgress?.({ step: "matching", processed: index, total: tracks.length });

    if (canSearch && searchTracks) {
      const attempt = await matchAgainstDestination(searchTracks, destinationSession, sourceTrack);
      recordMatchAttempt(report, sourceTrack, attempt);
    } else {
      report.unavailableItems.push(sourceTrack);
      report.skippedItems += 1;
    }
  }

  const result = await finishJob(jobStore, job, report);
  onProgress?.({ step: "done", processed: tracks.length, total: tracks.length });
  return result;
}

/**
 * Determines what to write for one source track. When the destination can
 * search, this is match-based (find the equivalent destination-native
 * track). When it can't, there's no catalog to match against, so the
 * source track is written through directly — see ADR-0018.
 */
type WritePlan = { kind: "write"; track: Track } | { kind: "skip" };

async function planTrackWrite(
  sourceTrack: Track,
  report: TransferReport,
  destination: { searchTracks?: MusicProvider["searchTracks"] },
  destinationSession: AuthSession,
  canSearch: boolean,
): Promise<WritePlan> {
  if (!canSearch || !destination.searchTracks) {
    return { kind: "write", track: sourceTrack };
  }

  const attempt = await matchAgainstDestination(
    destination.searchTracks,
    destinationSession,
    sourceTrack,
  );
  const decision = recordMatchAttempt(report, sourceTrack, attempt);
  return decision ? { kind: "write", track: decision.candidate } : { kind: "skip" };
}

/**
 * Validates full destination write capabilities up front, then writes
 * each track — matched against the destination's own catalog when it can
 * search (`tracks.search`), written through as-is when it can't (ADR-0018;
 * a destination with no catalog, like a file export target, has nothing
 * to match against). The only execution mode that mutates the destination
 * — see docs/decisions/0011-transfer-engine-execution-modes.md.
 */
export async function runLiveTransfer(params: RunTransferParams): Promise<RunTransferResult> {
  const { source, sourceSession, destination, destinationSession, sourcePlaylistId } = params;
  const jobStore = params.jobStore ?? new InMemoryTransferJobStore();
  const onProgress = params.options?.onProgress;

  const job = await createJob(jobStore, { source, destination, sourcePlaylistId }, "live");
  const report = createEmptyReport(source.manifest.name, destination.manifest.name);

  onProgress?.({ step: "validating" });

  const destinationCapabilities = destination.getCapabilities();
  const searchTracks = destination.searchTracks;
  const canSearch = Boolean(searchTracks) && destinationCapabilities.supports.has("tracks.search");

  const createPlaylist = destination.createPlaylist;
  const addTracksToPlaylist = destination.addTracksToPlaylist;
  if (
    !createPlaylist ||
    !addTracksToPlaylist ||
    !destinationCapabilities.supports.has("playlists.create") ||
    !destinationCapabilities.supports.has("playlists.addTracks")
  ) {
    return failJob(
      jobStore,
      job,
      report,
      "Destination provider cannot create or populate playlists.",
    );
  }

  if (!canSearch) {
    report.providerLimitationsEncountered.push(
      "Destination provider cannot search tracks — items are written through as-is, without matching.",
    );
  }

  const read = await readSourcePlaylist(
    source,
    sourceSession,
    sourcePlaylistId,
    jobStore,
    job,
    report,
  );
  if ("failed" in read) return read.failed;
  const { playlist } = read;
  const tracks = playlist.items.map((item) => item.track);

  onProgress?.({ step: "reading_source" });

  const createdPlaylist = await createPlaylist(destinationSession, {
    title: playlist.title,
    description: playlist.description,
    privacy: playlist.privacy === "unknown" ? undefined : playlist.privacy,
  });
  const destinationPlaylistId = createdPlaylist.id;

  for (let index = 0; index < tracks.length; index += 1) {
    if (await isCancelled(jobStore, job)) break;

    const sourceTrack = tracks[index];
    if (!sourceTrack) continue;

    onProgress?.({ step: "matching", processed: index, total: tracks.length });

    const plan = await planTrackWrite(
      sourceTrack,
      report,
      { searchTracks },
      destinationSession,
      canSearch,
    );
    if (plan.kind === "skip") continue;

    onProgress?.({ step: "writing", processed: index, total: tracks.length });
    const writeResult = await callWithRetry(() =>
      addTracksToPlaylist(destinationSession, destinationPlaylistId, [plan.track]),
    );

    if (writeResult.ok) {
      report.createdItems += 1;
    } else {
      report.failedItems += 1;
      report.userActionsRequired.push(
        `Could not add "${sourceTrack.title}" to the destination playlist: ${describeError(writeResult.error)}`,
      );
    }
  }

  const result = await finishJob(jobStore, job, report);
  onProgress?.({ step: "done", processed: tracks.length, total: tracks.length });
  return result;
}

/**
 * Orchestrates moving one playlist from `source` to `destination`. Never
 * throws for a partial failure. Dispatches to `runDryRunTransfer` or
 * `runLiveTransfer` based on `options.dryRun` — see
 * docs/transfer-engine.md and docs/decisions/0011-transfer-engine-execution-modes.md
 * for the full flow each mode implements.
 */
export async function runTransfer(params: RunTransferParams): Promise<RunTransferResult> {
  const mode: ExecutionMode = params.options?.dryRun ? "dryRun" : "live";
  return mode === "dryRun" ? runDryRunTransfer(params) : runLiveTransfer(params);
}

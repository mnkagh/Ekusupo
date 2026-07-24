import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import { matchTrack } from "@ekusupo/matching";

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
  report.providerLimitationsEncountered.push(reason);
  return { job, report };
}

/**
 * Orchestrates moving one playlist from `source` to `destination`. Never
 * throws for a partial failure — see docs/transfer-engine.md for the full
 * flow and scope this implements.
 */
export async function runTransfer(params: RunTransferParams): Promise<RunTransferResult> {
  const { source, sourceSession, destination, destinationSession, sourcePlaylistId } = params;
  const jobStore = params.jobStore ?? new InMemoryTransferJobStore();
  const dryRun = params.options?.dryRun ?? false;
  const onProgress = params.options?.onProgress;

  const job: TransferJob = {
    id: newJobId(),
    status: "pending",
    sourceProvider: source.manifest.name,
    destinationProvider: destination.manifest.name,
    sourcePlaylistId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    dryRun,
  };
  await jobStore.create(job);

  const report = createEmptyReport(source.manifest.name, destination.manifest.name);

  onProgress?.({ step: "validating" });

  const sourceCapabilities = source.getCapabilities();
  const destinationCapabilities = destination.getCapabilities();

  const getPlaylist = source.getPlaylist;
  if (!getPlaylist || !sourceCapabilities.supports.has("playlists.read")) {
    return failJob(jobStore, job, report, "Source provider cannot read playlists.");
  }

  const searchTracks = destination.searchTracks;
  if (!searchTracks || !destinationCapabilities.supports.has("tracks.search")) {
    return failJob(jobStore, job, report, "Destination provider cannot search tracks.");
  }

  const createPlaylist = destination.createPlaylist;
  const addTracksToPlaylist = destination.addTracksToPlaylist;
  if (
    !dryRun &&
    (!createPlaylist ||
      !addTracksToPlaylist ||
      !destinationCapabilities.supports.has("playlists.create") ||
      !destinationCapabilities.supports.has("playlists.addTracks"))
  ) {
    return failJob(
      jobStore,
      job,
      report,
      "Destination provider cannot create or populate playlists.",
    );
  }

  await jobStore.update(job.id, { status: "running", updatedAt: nowIso() });
  job.status = "running";

  onProgress?.({ step: "reading_source" });
  const playlist = await getPlaylist(sourceSession, sourcePlaylistId);
  const sourceTracks = playlist.items.map((item) => item.track);
  report.totalItems = sourceTracks.length;

  let destinationPlaylistId: string | undefined;
  if (!dryRun && createPlaylist) {
    const created = await createPlaylist(destinationSession, {
      title: playlist.title,
      description: playlist.description,
      privacy: playlist.privacy === "unknown" ? undefined : playlist.privacy,
    });
    destinationPlaylistId = created.id;
  }

  for (let index = 0; index < sourceTracks.length; index += 1) {
    const currentJob = await jobStore.get(job.id);
    if (currentJob?.status === "cancelled") {
      job.status = "cancelled";
      break;
    }

    const sourceTrack = sourceTracks[index];
    if (!sourceTrack) continue;

    onProgress?.({ step: "matching", processed: index, total: sourceTracks.length });

    const searchResult = await callWithRetry(() =>
      searchTracks(destinationSession, {
        text: sourceTrack.title,
        isrc: sourceTrack.externalIds?.isrc,
      }),
    );

    if (!searchResult.ok) {
      report.providerLimitationsEncountered.push(
        `Search failed for "${sourceTrack.title}": ${describeError(searchResult.error)}`,
      );
      report.unavailableItems.push(sourceTrack);
      report.skippedItems += 1;
      continue;
    }

    const outcome = matchTrack(sourceTrack, searchResult.value.items);
    if (!outcome.decision) {
      report.unavailableItems.push(sourceTrack);
      report.skippedItems += 1;
      continue;
    }

    const decision = outcome.decision;
    report.matchedItems += 1;
    if (decision.risk !== "low") {
      report.lowConfidenceMatches.push(decision);
    }

    if (dryRun || !addTracksToPlaylist || !destinationPlaylistId) continue;

    onProgress?.({ step: "writing", processed: index, total: sourceTracks.length });
    const playlistId = destinationPlaylistId;
    const writeResult = await callWithRetry(() =>
      addTracksToPlaylist(destinationSession, playlistId, [decision.candidate]),
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

  const finalStatus =
    job.status === "cancelled"
      ? "cancelled"
      : report.failedItems > 0 || report.skippedItems > 0
        ? "partial"
        : "completed";

  job.status = finalStatus;
  job.updatedAt = nowIso();
  await jobStore.update(job.id, { status: finalStatus, updatedAt: job.updatedAt });

  onProgress?.({ step: "done", processed: sourceTracks.length, total: sourceTracks.length });

  return { job, report };
}

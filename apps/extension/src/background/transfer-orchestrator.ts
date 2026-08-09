import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { runDryRunTransfer } from "@ekusupo/core";
import type { TransferProgressEvent, TransferReport } from "@ekusupo/core";

import type { DetectedResource, TransferReportSummary } from "../shared/messages.js";

export interface TransferOrchestratorDeps {
  getProvider: (name: string) => MusicProvider | undefined;
  getSession: (provider: string) => AuthSession | undefined;
  onProgress: (event: TransferProgressEvent) => void;
  onCompleted: (report: TransferReport) => void;
  onFailed: (reason: string) => void;
}

export function summarizeReport(report: TransferReport): TransferReportSummary {
  return {
    totalItems: report.totalItems,
    matchedItems: report.matchedItems,
    createdItems: report.createdItems,
    skippedItems: report.skippedItems,
    failedItems: report.failedItems,
  };
}

/**
 * Runs a Dry Run transfer for a detected resource — the only execution
 * mode PR5 wires up, per ADR-0011 and the user's explicit instruction to
 * resume browser-extension integration with Dry Run first. No `chrome.*`
 * dependency, so this is directly unit-testable with fake providers, the
 * same style `packages/core/src/run-transfer.test.ts` already uses.
 *
 * There's no destination-selection UI yet, so source and destination are
 * always the same connected provider — docs/transfer-engine.md documents
 * this as a valid Dry Run scope ("works today against a single real
 * provider used as both source and destination").
 */
export async function runDryRunTransferForResource(
  resource: DetectedResource,
  deps: TransferOrchestratorDeps,
): Promise<void> {
  if (resource.resourceType !== "playlist") {
    deps.onFailed(`Ekusupo can only transfer playlists today, not a ${resource.resourceType}.`);
    return;
  }

  const provider = deps.getProvider(resource.provider);
  if (!provider) {
    deps.onFailed(`"${resource.provider}" is not a supported provider.`);
    return;
  }

  const session = deps.getSession(resource.provider);
  if (!session) {
    deps.onFailed(
      `${resource.provider} isn't connected yet — connect your account before starting a transfer.`,
    );
    return;
  }

  try {
    const { job, report } = await runDryRunTransfer({
      source: provider,
      sourceSession: session,
      destination: provider,
      destinationSession: session,
      sourcePlaylistId: resource.resourceId,
      options: { onProgress: deps.onProgress },
    });
    // The engine reports a stopped run as a `failed` job rather than
    // throwing, so the status has to be checked explicitly — the `catch`
    // below never sees it. Without this, a run that never read the
    // source would surface to the user as a completed transfer whose
    // counters happen to be zero.
    if (job.status === "failed") {
      deps.onFailed(report.failureReason ?? "The transfer could not be completed.");
      return;
    }
    deps.onCompleted(report);
  } catch (error) {
    deps.onFailed(error instanceof Error ? error.message : "Unknown transfer error.");
  }
}

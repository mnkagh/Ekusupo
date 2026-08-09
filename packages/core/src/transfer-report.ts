import type { Track } from "@ekusupo/upf";
import type { MatchDecision } from "@ekusupo/matching";

/** CLAUDE.md §9.4. Every `runTransfer` call returns one of these, success or not. */
export interface TransferReport {
  sourceProvider: string;
  destinationProvider: string;
  /** Only value in v0.1 — see docs/transfer-engine.md. */
  itemType: "playlist";
  totalItems: number;
  matchedItems: number;
  createdItems: number;
  skippedItems: number;
  failedItems: number;
  lowConfidenceMatches: MatchDecision[];
  unavailableItems: Track[];
  providerLimitationsEncountered: string[];
  userActionsRequired: string[];
  /**
   * Set only when the job's status is `failed` — the single reason the
   * whole transfer stopped, as opposed to the per-item notes above.
   * Clients need this to tell "finished, with caveats" from "did not
   * finish", which the counters alone can't express: a run that fails
   * before reading the source has all-zero counters, exactly like a run
   * over an empty playlist (CLAUDE.md §16.3, "errors should be
   * classified"). Also appended to `providerLimitationsEncountered` so
   * existing report renderers still show it without changes.
   */
  failureReason?: string;
}

export function createEmptyReport(
  sourceProvider: string,
  destinationProvider: string,
): TransferReport {
  return {
    sourceProvider,
    destinationProvider,
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
  };
}

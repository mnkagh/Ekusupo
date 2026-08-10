import type { Track } from "@ekusupo/upf";
import type { MatchDecision } from "@ekusupo/matching";

/**
 * A match the engine was not confident about, paired with the track it
 * came from.
 *
 * The pairing is the point. A `MatchDecision` alone names only what was
 * *chosen*, and a list of chosen tracks is unreviewable: "we picked
 * 'Mr. Brightside (Live)'" tells nobody whether that was right without
 * saying what it was picked *for*. CLAUDE.md §10.4 asks that
 * low-confidence matches be reviewable, and a reviewer needs both ends.
 */
export interface LowConfidenceMatch {
  /** The track being transferred, from the source playlist. */
  source: Track;
  /** What the engine chose, why, and what else it considered. */
  decision: MatchDecision;
}

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
  lowConfidenceMatches: LowConfidenceMatch[];
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

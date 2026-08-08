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

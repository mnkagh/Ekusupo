import type { Track } from "@ekusupo/upf";

/**
 * Deterministic layers implemented in v0.1 (CLAUDE.md §10.2, layers 1-6).
 * AI-assisted layers (7-10) are Phase 7's job — see docs/matching-engine.md.
 */
export type MatchMethod =
  "provider_id" | "isrc_upc" | "normalized_title_artist" | "album_metadata" | "duration_tolerance";

export type MatchRisk = "low" | "medium" | "high";

export interface MatchDecision {
  candidate: Track;
  /** 0-100. */
  confidence: number;
  method: MatchMethod;
  reason: string;
  risk: MatchRisk;
  /** Other plausible candidates, present only when the match was ambiguous. */
  alternatives?: Track[];
}

export interface MatchOutcome {
  query: Track;
  /** Undefined means no match was found among the given candidates. */
  decision?: MatchDecision;
}

import type { Track } from "@ekusupo/upf";

import { normalizeArtistName, normalizeTitle, primaryArtistName } from "./normalize.js";
import type { MatchDecision, MatchMethod, MatchOutcome, MatchRisk } from "./types.js";

const DURATION_TOLERANCE_MS = 3000;

function sharesProviderId(query: Track, candidate: Track): boolean {
  if (!query.providerRefs || !candidate.providerRefs) return false;
  return Object.entries(query.providerRefs).some(
    ([provider, ref]) => candidate.providerRefs?.[provider]?.id === ref.id,
  );
}

function isrcOf(track: Track): string | undefined {
  return track.externalIds?.isrc;
}

function withinDurationTolerance(query: Track, candidate: Track): boolean {
  if (query.durationMs === undefined || candidate.durationMs === undefined) return false;
  return Math.abs(query.durationMs - candidate.durationMs) <= DURATION_TOLERANCE_MS;
}

function albumTitleMatches(query: Track, candidate: Track): boolean {
  if (!query.album || !candidate.album) return false;
  return normalizeTitle(query.album.title) === normalizeTitle(candidate.album.title);
}

function titleArtistMatches(query: Track, candidate: Track): boolean {
  const queryArtist = primaryArtistName(query);
  const candidateArtist = primaryArtistName(candidate);
  if (!queryArtist || !candidateArtist) return false;
  return (
    normalizeTitle(query.title) === normalizeTitle(candidate.title) &&
    normalizeArtistName(queryArtist) === normalizeArtistName(candidateArtist)
  );
}

/**
 * Explicit/clean disagreement never blocks a match — it's the same
 * recording either way — but it raises risk so the Transfer Engine can
 * surface it for review (CLAUDE.md §10.4, docs/matching-engine.md).
 */
function explicitMismatch(query: Track, candidate: Track): boolean {
  return (
    query.explicit !== undefined &&
    candidate.explicit !== undefined &&
    query.explicit !== "unknown" &&
    candidate.explicit !== "unknown" &&
    query.explicit !== candidate.explicit
  );
}

function riskFor(query: Track, candidate: Track, ambiguous: boolean): MatchRisk {
  if (ambiguous) return "high";
  if (explicitMismatch(query, candidate)) return "medium";
  return "low";
}

/** Callers only ever pass a non-empty `pool` — enforced by each call site's `if (pool.length > 0)` guard. */
function buildDecision(
  query: Track,
  pool: Track[],
  method: MatchMethod,
  confidence: number,
  reason: string,
): MatchDecision {
  const candidate = pool[0];
  if (!candidate) throw new Error("buildDecision requires at least one candidate");
  const alternatives = pool.slice(1);
  return {
    candidate,
    confidence,
    method,
    reason,
    risk: riskFor(query, candidate, pool.length > 1),
    ...(alternatives.length > 0 ? { alternatives } : {}),
  };
}

/**
 * Runs the deterministic layers (CLAUDE.md §10.2, layers 1-6) in order and
 * stops at the first sufficiently confident match. See
 * docs/matching-engine.md for the full rationale.
 */
export function matchTrack(query: Track, candidates: Track[]): MatchOutcome {
  if (candidates.length === 0) return { query };

  const byProviderId = candidates.filter((candidate) => sharesProviderId(query, candidate));
  if (byProviderId.length > 0) {
    return {
      query,
      decision: buildDecision(
        query,
        byProviderId,
        "provider_id",
        100,
        "Shared provider-native id.",
      ),
    };
  }

  const queryIsrc = isrcOf(query);
  if (queryIsrc) {
    const byIsrc = candidates.filter((candidate) => isrcOf(candidate) === queryIsrc);
    if (byIsrc.length > 0) {
      return {
        query,
        decision: buildDecision(query, byIsrc, "isrc_upc", 98, "Matched by ISRC."),
      };
    }
  }

  const byTitleArtist = candidates.filter((candidate) => titleArtistMatches(query, candidate));
  if (byTitleArtist.length === 0) return { query };

  const byAlbum = byTitleArtist.filter((candidate) => albumTitleMatches(query, candidate));
  const durationPool = byAlbum.length > 0 ? byAlbum : byTitleArtist;
  const byDuration = durationPool.filter((candidate) => withinDurationTolerance(query, candidate));

  if (byDuration.length > 0) {
    return {
      query,
      decision: buildDecision(
        query,
        byDuration,
        "duration_tolerance",
        byAlbum.length > 0 ? 90 : 82,
        "Matched by title, artist, and duration.",
      ),
    };
  }

  if (byAlbum.length > 0) {
    return {
      query,
      decision: buildDecision(
        query,
        byAlbum,
        "album_metadata",
        78,
        "Matched by title, artist, and album.",
      ),
    };
  }

  return {
    query,
    decision: buildDecision(
      query,
      byTitleArtist,
      "normalized_title_artist",
      65,
      "Matched by normalized title and primary artist only.",
    ),
  };
}

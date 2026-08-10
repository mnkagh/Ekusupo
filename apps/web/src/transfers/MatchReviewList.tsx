import type { LowConfidenceMatch, ReportTrack } from "../api/transfers-client.js";

interface MatchReviewListProps {
  matches: LowConfidenceMatch[];
}

/** Plain language for the engine's method names (CLAUDE.md §11.3, §20.1). */
const METHOD_LABELS: Record<string, string> = {
  provider_id: "the same track ID on both services",
  isrc_upc: "a matching ISRC — the recording's own identifier",
  normalized_title_artist: "the title and artist matching once punctuation was ignored",
  album_metadata: "the album it appears on",
  duration_tolerance: "the length being close enough",
};

function describeTrack(track: ReportTrack): string {
  const artists = track.artists?.map((artist) => artist.name).join(", ");
  return artists ? `${track.title} — ${artists}` : track.title;
}

function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Every match the engine was not sure about, with both ends shown.
 *
 * CLAUDE.md §10.4 requires low-confidence matches be reviewable and that
 * the system "avoid silently making poor matches"; §11.3 requires that
 * when a decision is uncertain, the evidence and the alternatives are
 * visible. This is that surface.
 *
 * **It shows; it does not yet let you change anything.** Replacing a
 * chosen track needs the destination connector to support removing one
 * from a playlist — `playlists.removeTracks` exists in the Connector SDK
 * and no provider implements it. An override button that silently did
 * nothing would be worse than none, so the honest state is stated on
 * screen rather than implied by its absence.
 */
export function MatchReviewList({ matches }: MatchReviewListProps) {
  if (matches.length === 0) return null;

  return (
    <section className="report__section">
      <h4 className="report__heading">Worth checking ({matches.length})</h4>
      <p className="report__note">
        These were transferred, but the match was not certain. Nothing here failed — it just
        deserves a listen.
      </p>

      <ul className="review">
        {matches.map(({ source, decision }) => {
          const sourceDuration = formatDuration(source.durationMs);
          const candidateDuration = formatDuration(decision.candidate.durationMs);

          return (
            <li key={`${source.id}:${decision.candidate.id}`} className="review__item">
              <div className="review__pair">
                <p className="review__from">
                  <span className="review__role">From</span>
                  {describeTrack(source)}
                  {sourceDuration && <span className="review__meta"> ({sourceDuration})</span>}
                </p>
                <p className="review__to">
                  <span className="review__role">Matched to</span>
                  {describeTrack(decision.candidate)}
                  {candidateDuration && (
                    <span className="review__meta"> ({candidateDuration})</span>
                  )}
                </p>
              </div>

              <p className="review__why">
                <span className={`review__risk review__risk--${decision.risk}`}>
                  {decision.risk === "high" ? "Uncertain" : "Fairly sure"}
                </span>
                {Math.round(decision.confidence)}% — matched on{" "}
                {METHOD_LABELS[decision.method] ?? decision.method}. {decision.reason}
              </p>

              {decision.alternatives && decision.alternatives.length > 0 && (
                <details className="review__alternatives">
                  <summary>
                    {decision.alternatives.length} other{" "}
                    {decision.alternatives.length === 1 ? "candidate" : "candidates"} considered
                  </summary>
                  <ul>
                    {decision.alternatives.map((alternative) => (
                      <li key={alternative.id}>{describeTrack(alternative)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <p className="report__note">
        Picking a different version isn&apos;t possible yet: it needs the destination to support
        removing a track from a playlist, which none of them implement.
      </p>
    </section>
  );
}

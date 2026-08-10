import type { TransferJob } from "../api/transfers-client.js";

interface TransferProgressViewProps {
  job: TransferJob;
  onCancel: () => void;
}

/** Plain language, not the engine's step names (CLAUDE.md §8.3). */
const STEP_LABELS: Record<string, string> = {
  validating: "Checking what each side can do",
  reading_source: "Reading the playlist",
  matching: "Finding each track",
  writing: "Writing to the destination",
  done: "Finishing up",
};

/**
 * What a running transfer looks like. Transfers run in the background
 * (ADR-0033), so this is on screen for as long as the work takes rather
 * than for the length of one request.
 *
 * Shows a determinate bar only once the engine reports a total — before
 * that the count is genuinely unknown, and a bar that invents a position
 * is worse than one that admits it does not have one.
 */
export function TransferProgressView({ job, onCancel }: TransferProgressViewProps) {
  const progress = job.progress ?? undefined;
  const label = STEP_LABELS[progress?.step ?? "validating"] ?? "Working";

  const total = progress?.total ?? 0;
  const processed = progress?.processed ?? 0;
  const known = total > 0;
  const percent = known ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="progress">
      <div className="progress__head">
        <p className="progress__label">
          {label}
          {known && (
            <span className="progress__count">
              {" "}
              — {processed} of {total}
            </span>
          )}
        </p>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {known ? (
        <div
          className="progress__track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Transfer progress"
        >
          <span className="progress__fill" style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <div className="progress__track progress__track--indeterminate" aria-hidden="true">
          <span className="progress__fill progress__fill--sweep" />
        </div>
      )}

      <p className="progress__note">
        This keeps running if you close the tab. Come back and it will be in Recent.
      </p>
    </div>
  );
}

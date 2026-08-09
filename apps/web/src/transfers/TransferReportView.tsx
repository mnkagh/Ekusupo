import type { TransferReport } from "../api/transfers-client.js";

export interface TransferReportViewProps {
  status: string;
  report: TransferReport;
}

/**
 * The report, rendered plainly.
 *
 * This is the surface CLAUDE.md §20.2 is about: after a transfer, show
 * what succeeded, what failed, what needs action. It is deliberately the
 * least decorated screen in the app — every flourish here costs
 * comprehension of the one thing the user came back to read.
 *
 * `status` is taken separately rather than inferred from the counters,
 * because a run that stopped before reading the source has all-zero
 * counts and is otherwise indistinguishable from a successful transfer
 * of an empty playlist.
 */
export function TransferReportView({ status, report }: TransferReportViewProps) {
  const failed = status === "failed";

  return (
    <div className="report">
      <div className={`report__verdict report__verdict--${failed ? "failed" : status}`}>
        <span className="status">
          <span className="status__dot" aria-hidden="true" />
          {failed ? "Did not finish" : status === "partial" ? "Finished with gaps" : "Finished"}
        </span>
        {failed && report.failureReason && <p className="report__reason">{report.failureReason}</p>}
      </div>

      {!failed && (
        <dl className="report__counts">
          <div className="report__count">
            <dt>Tracks</dt>
            <dd>{report.totalItems}</dd>
          </div>
          <div className="report__count">
            <dt>Matched</dt>
            <dd>{report.matchedItems}</dd>
          </div>
          <div className="report__count">
            <dt>Skipped</dt>
            <dd>{report.skippedItems}</dd>
          </div>
          <div className="report__count">
            <dt>Failed</dt>
            <dd>{report.failedItems}</dd>
          </div>
        </dl>
      )}

      {report.userActionsRequired.length > 0 && (
        <section className="report__section">
          <h4 className="report__heading">What you can do</h4>
          <ul className="report__list">
            {report.userActionsRequired.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>
      )}

      {report.providerLimitationsEncountered.length > 0 && (
        <section className="report__section">
          <h4 className="report__heading">Provider limitations</h4>
          <ul className="report__list report__list--muted">
            {report.providerLimitationsEncountered.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      )}

      {report.unavailableItems.length > 0 && (
        <section className="report__section">
          <h4 className="report__heading">Not carried over ({report.unavailableItems.length})</h4>
          <ul className="report__list report__list--tracks">
            {/* Capped: a 500-track playlist would otherwise render 500
                list items into a panel nobody scrolls to the end of. */}
            {report.unavailableItems.slice(0, 25).map((track) => (
              <li key={track.id || track.title}>
                <span className="report__track">{track.title}</span>
                {track.artists?.[0]?.name && (
                  <span className="report__artist">{track.artists[0].name}</span>
                )}
              </li>
            ))}
          </ul>
          {report.unavailableItems.length > 25 && (
            <p className="report__more">and {report.unavailableItems.length - 25} more</p>
          )}
        </section>
      )}
    </div>
  );
}

import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { CatalogProvider } from "../api/providers-client.js";
import { UPF_DESTINATION_ID, transfersClient } from "../api/transfers-client.js";
import type { SkippedLine } from "../api/transfers-client.js";
import { useTransferJob } from "./useTransferJob.js";
import { TransferProgressView } from "./TransferProgressView.js";
import { TransferReportView } from "./TransferReportView.js";

const PLACEHOLDER = [
  "The Killers - Mr. Brightside",
  "Daft Punk - One More Time",
  "3. Sigur Rós - Hoppípolla",
].join("\n");

/**
 * A playlist someone pasted from somewhere that is not a music service.
 *
 * Notes, a spreadsheet, a group chat, the description under a video —
 * this is where a lot of people's playlists actually live, and typing
 * one back into a music service by hand is precisely the work this
 * product exists to remove. No provider integration is needed on the
 * source side at all, so it works before any account is connected.
 */
export function PasteTracklist({ onFinished }: { onFinished?: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState(UPF_DESTINATION_ID);
  const [destinations, setDestinations] = useState<CatalogProvider[]>([]);
  const [skipped, setSkipped] = useState<SkippedLine[]>([]);
  const textId = useId();
  const titleId = useId();
  const destinationId = useId();

  const run = useTransferJob(onFinished);

  useEffect(() => {
    void providersClient
      .listCatalog()
      .then(({ providers }) => setDestinations(providers.filter((entry) => entry.configured)))
      .catch(() => setDestinations([]));
  }, []);

  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const busy = run.state.status === "starting" || run.state.status === "running";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSkipped([]);
    run.starting();

    void transfersClient
      .importTracklist(text, destination, title.trim() || undefined)
      .then((started) => {
        // Reported alongside the running job rather than after it: these
        // lines are missing from the transfer, and only the user can fix
        // the text they came from.
        if (started.skippedLines?.length) setSkipped(started.skippedLines);
        run.watch(started.job);
      })
      .catch((error: unknown) => {
        run.fail(error instanceof ApiError ? error.message : "Could not read that list.");
      });
  };

  return (
    <section className="panel rise" style={{ "--delay": "80ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          <h2 className="section-title">Paste a tracklist</h2>
          <span className="eyebrow">From anywhere</span>
        </div>
      </div>

      <div className="panel__body">
        <form className="transfer-form" onSubmit={submit}>
          <label className="field__label" htmlFor={textId}>
            One track per line
          </label>
          <textarea
            id={textId}
            className="field__input field__input--area"
            rows={8}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="transfer-form__hint">
            “Artist - Title” works best. Numbered lists, bullets, CSV, “Title by Artist” and
            trailing durations are all understood.
          </p>

          <label className="field__label" htmlFor={titleId}>
            Playlist name (optional)
          </label>
          <input
            id={titleId}
            className="field__input"
            value={title}
            placeholder="Pasted playlist"
            onChange={(event) => setTitle(event.target.value)}
          />

          <label className="field__label" htmlFor={destinationId}>
            Send to
          </label>
          <select
            id={destinationId}
            className="field__input"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value={UPF_DESTINATION_ID}>A UPF file (download)</option>
            {destinations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn--connect" disabled={busy || lineCount === 0}>
            {busy
              ? "Working…"
              : `Transfer ${lineCount || ""} ${lineCount === 1 ? "track" : "tracks"}`.trim()}
          </button>
        </form>

        {run.state.status === "error" && (
          <p role="alert" className="notice notice--error">
            {run.state.message}
          </p>
        )}

        {skipped.length > 0 && (
          <div className="notice notice--error" role="status">
            <p>
              {skipped.length} {skipped.length === 1 ? "line was" : "lines were"} not transferred:
            </p>
            <ul className="upf__problems">
              {skipped.map((entry) => (
                <li key={entry.line}>
                  <code>line {entry.line}</code> — {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {run.state.status === "running" && (
          <TransferProgressView job={run.state.job} onCancel={run.cancel} />
        )}

        {run.state.status === "finished" && run.state.job.report && (
          <>
            <TransferReportView status={run.state.job.status} report={run.state.job.report} />
            {run.state.job.hasUpfDocument && (
              <a
                className="btn btn--ghost btn--small"
                href={transfersClient.upfDownloadUrl(run.state.job.id)}
                download={`${run.state.job.id}.upf.json`}
              >
                Download the UPF file
              </a>
            )}
          </>
        )}
      </div>
    </section>
  );
}

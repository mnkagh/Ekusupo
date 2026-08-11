import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { CatalogProvider } from "../api/providers-client.js";
import { UPF_DESTINATION_ID, extractPlaylistId, transfersClient } from "../api/transfers-client.js";
import type { TransferJob } from "../api/transfers-client.js";
import { TransferProgressView } from "./TransferProgressView.js";
import { TransferReportView } from "./TransferReportView.js";
import { useTransferJob } from "./useTransferJob.js";

type Mode = "preview" | "live";

/** Always offered, needs nothing connected, and is what "back up" means here. */
const UPF_DESTINATION = { id: UPF_DESTINATION_ID, displayName: "A UPF file (download)" };

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Transfer setup, progress and report — CLAUDE.md §8.2's three transfer
 * screens, as one flow rather than three routes. There is nothing to
 * navigate between: you paste a link, pick where it goes, and read the
 * result.
 *
 * Two buttons rather than one, because Dry Run and Live Transfer are
 * genuinely different acts and §20.2 asks that we show what will happen
 * before it happens. Preview never writes anywhere; Transfer does, and
 * says so on the button and in a confirmation the user has to accept.
 */
export function TransferScreen() {
  const [input, setInput] = useState("");
  const [destination, setDestination] = useState(UPF_DESTINATION_ID);
  const [destinations, setDestinations] = useState<CatalogProvider[]>([]);
  const [history, setHistory] = useState<TransferJob[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  /** Job id awaiting a second click, then the one being deleted. */
  const [confirmingDelete, setConfirmingDelete] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<string | undefined>();
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [mode, setMode] = useState<Mode>("preview");
  const inputId = useId();
  const destinationId = useId();

  const loadHistory = useCallback(() => {
    void transfersClient
      .listTransfers()
      .then(({ transfers }) => setHistory(transfers))
      // A failed history fetch must not blank the screen — the transfer
      // form above it still works without it.
      .catch(() => setHistory([]));
  }, []);

  const run = useTransferJob(loadHistory);

  useEffect(loadHistory, [loadHistory]);

  useEffect(() => {
    // Only providers the server can actually construct are offered. A
    // provider that cannot be written to is filtered out by the API too,
    // but offering it here and rejecting it there would be a worse way to
    // find out.
    void providersClient
      .listCatalog()
      .then(({ providers }) => setDestinations(providers.filter((entry) => entry.configured)))
      .catch(() => setDestinations([]));
  }, []);

  const start = (next: Mode) => {
    const playlistId = extractPlaylistId(input);
    if (!playlistId) return;

    setPendingConfirm(false);
    setMode(next);
    run.starting();

    const request =
      next === "preview"
        ? transfersClient.dryRun(playlistId)
        : transfersClient.liveTransfer(playlistId, destination);

    // Resolves when the job exists, not when it finishes — the hook
    // watches it from there (ADR-0033).
    void request
      .then((started) => run.watch(started.job))
      .catch((error: unknown) => {
        run.fail(error instanceof ApiError ? error.message : "Something went wrong.");
      });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    start("preview");
  };

  /**
   * Two clicks, because this also destroys the transfer's report and its
   * UPF export — the user's own library data, and the only copy if they
   * never downloaded it (CLAUDE.md §9.3).
   */
  const removeFromHistory = (jobId: string) => {
    if (confirmingDelete !== jobId) {
      setConfirmingDelete(jobId);
      setHistoryError(undefined);
      return;
    }

    setConfirmingDelete(undefined);
    setDeleting(jobId);
    setHistoryError(undefined);
    void transfersClient
      .deleteTransfer(jobId)
      .then(loadHistory)
      .catch((error: unknown) => {
        setHistoryError(
          error instanceof ApiError ? error.message : "Could not delete that transfer.",
        );
      })
      .finally(() => setDeleting(undefined));
  };

  const destinationName =
    destination === UPF_DESTINATION_ID
      ? UPF_DESTINATION.displayName
      : (destinations.find((entry) => entry.id === destination)?.displayName ?? destination);

  const busy = run.state.status === "starting" || run.state.status === "running";
  const canRun = Boolean(input.trim()) && !busy;

  return (
    <section className="panel rise" style={{ "--delay": "40ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          <h2 className="section-title">Transfer</h2>
          <span className="eyebrow">Preview first — nothing is written until you confirm</span>
        </div>
      </div>

      <div className="panel__body">
        <form className="transfer-form" onSubmit={handleSubmit}>
          <label className="field__label" htmlFor={inputId}>
            Playlist link
          </label>
          <div className="transfer-form__row">
            <input
              id={inputId}
              className="field__input"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="https://open.spotify.com/playlist/..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" className="btn btn--ghost" disabled={!canRun}>
              {busy && mode === "preview" ? "Running…" : "Preview"}
            </button>
          </div>

          <label className="field__label" htmlFor={destinationId}>
            Send it to
          </label>
          <div className="transfer-form__row">
            <select
              id={destinationId}
              className="field__input"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              <option value={UPF_DESTINATION.id}>{UPF_DESTINATION.displayName}</option>
              {destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--connect"
              disabled={!canRun}
              onClick={() => setPendingConfirm(true)}
            >
              {busy && mode === "live" ? "Transferring…" : "Transfer"}
            </button>
          </div>

          <p className="transfer-form__hint">
            Paste a Spotify playlist link. Public playlists work without connecting an account.
          </p>
        </form>

        {pendingConfirm && (
          <div role="alertdialog" aria-label="Confirm transfer" className="confirm">
            <p className="confirm__text">
              This will really write to <strong>{destinationName}</strong>. Preview first if you are
              not sure what will carry over.
            </p>
            <div className="confirm__actions">
              <button type="button" className="btn btn--connect" onClick={() => start("live")}>
                Yes, transfer it
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setPendingConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {run.state.status === "starting" && (
          <p className="loading">
            <span className="loading__bar" aria-hidden="true" />
            Starting
          </p>
        )}

        {run.state.status === "running" && (
          <TransferProgressView job={run.state.job} onCancel={run.cancel} />
        )}

        {run.state.status === "error" && (
          <p role="alert" className="notice notice--error">
            {run.state.message}
          </p>
        )}

        {run.state.status === "finished" && run.state.job.report && (
          <>
            <TransferReportView status={run.state.job.status} report={run.state.job.report} />
            {run.state.job.hasUpfDocument && (
              <p className="notice notice--ok">
                <a
                  className="btn btn--connect"
                  href={transfersClient.upfDownloadUrl(run.state.job.id)}
                  download={`${run.state.job.id}.upf.json`}
                >
                  Download UPF file
                </a>
              </p>
            )}
          </>
        )}

        {history.length > 0 && (
          <section className="history">
            <h3 className="history__heading">Recent</h3>
            {historyError && (
              <p className="history__error" role="alert">
                {historyError}
              </p>
            )}
            <ul className="history__list">
              {history.slice(0, 8).map((job) => (
                <li key={job.id} className="history__item">
                  <span className={`status status--${job.status === "failed" ? "idle" : "live"}`}>
                    <span className="status__dot" aria-hidden="true" />
                    {job.status}
                  </span>
                  <span className="history__playlist">{job.sourcePlaylistId}</span>
                  <span className="history__when">{formatWhen(job.createdAt)}</span>
                  <span className="history__actions">
                    {job.hasUpfDocument && (
                      <a
                        className="history__download"
                        href={transfersClient.upfDownloadUrl(job.id)}
                        download={`${job.id}.upf.json`}
                      >
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className={`history__delete${
                        confirmingDelete === job.id ? " history__delete--confirming" : ""
                      }`}
                      onClick={() => removeFromHistory(job.id)}
                      disabled={deleting === job.id}
                      aria-label={
                        confirmingDelete === job.id
                          ? `Confirm deleting the transfer of ${job.sourcePlaylistId}`
                          : `Delete the transfer of ${job.sourcePlaylistId}`
                      }
                    >
                      {deleting === job.id
                        ? "Deleting…"
                        : confirmingDelete === job.id
                          ? "Confirm"
                          : "Delete"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

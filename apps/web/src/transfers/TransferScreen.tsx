import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { extractPlaylistId, transfersClient } from "../api/transfers-client.js";
import type { DryRunResult, TransferJob } from "../api/transfers-client.js";
import { TransferReportView } from "./TransferReportView.js";

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: DryRunResult }
  | { status: "error"; message: string };

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
 * navigate between: you paste a link, it runs, you read the result.
 *
 * Dry Run only, which is what the API exposes (ADR-0027). That is stated
 * on the screen rather than left for the user to discover: §20.2 asks
 * that we show what will happen *before* it happens, and "this will not
 * modify anything" is the most important thing to know here.
 */
export function TransferScreen() {
  const [input, setInput] = useState("");
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [history, setHistory] = useState<TransferJob[]>([]);
  const inputId = useId();

  const loadHistory = () => {
    void transfersClient
      .listTransfers()
      .then(({ transfers }) => setHistory(transfers))
      // A failed history fetch must not blank the screen — the transfer
      // form above it still works without it.
      .catch(() => setHistory([]));
  };

  useEffect(loadHistory, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playlistId = extractPlaylistId(input);
    if (!playlistId) return;

    setRun({ status: "running" });
    void transfersClient
      .dryRun(playlistId)
      .then((result) => {
        setRun({ status: "done", result });
        loadHistory();
      })
      .catch((error: unknown) => {
        setRun({
          status: "error",
          message: error instanceof ApiError ? error.message : "Something went wrong.",
        });
      });
  };

  return (
    <section className="panel rise" style={{ "--delay": "40ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          <h2 className="section-title">Transfer</h2>
          <span className="eyebrow">Dry run — nothing is modified</span>
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
            <button
              type="submit"
              className="btn btn--connect"
              disabled={run.status === "running" || !input.trim()}
            >
              {run.status === "running" ? "Running…" : "Preview transfer"}
            </button>
          </div>
          <p className="transfer-form__hint">
            Paste a Spotify playlist link. Public playlists work without connecting an account.
          </p>
        </form>

        {run.status === "running" && (
          <p className="loading">
            <span className="loading__bar" aria-hidden="true" />
            Reading the playlist
          </p>
        )}

        {run.status === "error" && (
          <p role="alert" className="notice notice--error">
            {run.message}
          </p>
        )}

        {run.status === "done" && (
          <TransferReportView status={run.result.job.status} report={run.result.report} />
        )}

        {history.length > 0 && (
          <section className="history">
            <h3 className="history__heading">Recent</h3>
            <ul className="history__list">
              {history.slice(0, 8).map((job) => (
                <li key={job.id} className="history__item">
                  <span className={`status status--${job.status === "failed" ? "idle" : "live"}`}>
                    <span className="status__dot" aria-hidden="true" />
                    {job.status}
                  </span>
                  <span className="history__playlist">{job.sourcePlaylistId}</span>
                  <span className="history__when">{formatWhen(job.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { ApiError } from "../api/errors.js";
import type { ApiProblem } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { CatalogProvider } from "../api/providers-client.js";
import { UPF_DESTINATION_ID, transfersClient } from "../api/transfers-client.js";
import type { TransferJob } from "../api/transfers-client.js";
import { TransferProgressView } from "./TransferProgressView.js";
import { TransferReportView } from "./TransferReportView.js";
import { useTransferJob } from "./useTransferJob.js";

/**
 * Only what this screen needs to *describe* a file before sending it —
 * the server does the real validation (`@ekusupo/upf`'s parser), and
 * duplicating those rules here would be two implementations of one
 * contract (CLAUDE.md §3.3).
 */
interface LoadedFile {
  name: string;
  document: unknown;
  playlists: { id: string; title: string; count: number }[];
}

type State =
  | { status: "empty" }
  | { status: "loaded"; file: LoadedFile }
  | { status: "importing"; file: LoadedFile }
  | { status: "rejected"; message: string; problems: ApiProblem[] };

/** Reads what the file claims to contain, without asserting it is valid. */
function summarize(name: string, parsed: unknown): LoadedFile {
  const playlists =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as never)["playlists"])
      ? ((parsed as { playlists: unknown[] }).playlists as Record<string, unknown>[])
      : [];

  return {
    name,
    document: parsed,
    playlists: playlists.map((playlist, index) => ({
      id: typeof playlist.id === "string" ? playlist.id : `#${index + 1}`,
      title: typeof playlist.title === "string" ? playlist.title : "Untitled",
      count: Array.isArray(playlist.items) ? playlist.items.length : 0,
    })),
  };
}

/**
 * UPF import and export — CLAUDE.md §8.2's remaining transfer screen, and
 * §3.8's user-ownership promise made concrete: a file the user keeps,
 * readable without Ekusupo, that no provider can revoke.
 *
 * Export lives on the Transfer screen (it is just a transfer whose
 * destination is a file), so this screen owns import plus a list of
 * everything already exported.
 */
export function UpfScreen() {
  const [state, setState] = useState<State>({ status: "empty" });
  const [destination, setDestination] = useState(UPF_DESTINATION_ID);
  const [destinations, setDestinations] = useState<CatalogProvider[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [exports, setExports] = useState<TransferJob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const destinationId = useId();
  const playlistFieldId = useId();

  const loadExports = useCallback(() => {
    void transfersClient
      .listTransfers()
      .then(({ transfers }) => setExports(transfers.filter((job) => job.hasUpfDocument)))
      .catch(() => setExports([]));
  }, []);

  const run = useTransferJob(loadExports);

  useEffect(loadExports, [loadExports]);

  useEffect(() => {
    void providersClient
      .listCatalog()
      .then(({ providers }) => setDestinations(providers.filter((entry) => entry.configured)))
      .catch(() => setDestinations([]));
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    void file
      .text()
      .then((text) => {
        // JSON syntax is checked here only so an unreadable file fails
        // instantly instead of after a round trip. Everything about
        // whether it is *UPF* is the server's answer to give.
        const parsed: unknown = JSON.parse(text);
        const loaded = summarize(file.name, parsed);
        setPlaylistId(loaded.playlists[0]?.id ?? "");
        setState({ status: "loaded", file: loaded });
      })
      .catch(() => {
        setState({
          status: "rejected",
          message: `${file.name} is not valid JSON, so it cannot be a UPF file.`,
          problems: [],
        });
      });
  };

  const startImport = () => {
    if (state.status !== "loaded") return;
    const file = state.file;
    setState({ status: "importing", file });
    run.starting();

    // Resolves once the job exists; the hook watches it from there
    // (ADR-0033). Validation failures still arrive here, as a rejection.
    void transfersClient
      .importUpf(file.document, destination, playlistId || undefined)
      .then((started) => run.watch(started.job))
      .catch((error: unknown) => {
        run.reset();
        setState({
          status: "rejected",
          message: error instanceof ApiError ? error.message : "The import failed.",
          problems: error instanceof ApiError ? error.problems : [],
        });
      });
  };

  const reset = () => {
    setState({ status: "empty" });
    setPlaylistId("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const file = state.status === "rejected" || state.status === "empty" ? null : state.file;

  return (
    <section className="panel rise" style={{ "--delay": "80ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          <h2 className="section-title">UPF files</h2>
          <span className="eyebrow">Your library, in a file you keep</span>
        </div>
      </div>

      <div className="panel__body">
        <div className="upf__intro">
          <p className="transfer-form__hint">
            A UPF file is a plain, readable record of a playlist — titles, artists, order, and the
            identifiers needed to find the same tracks elsewhere. Export one from the Transfer panel
            by sending a playlist to <strong>A UPF file</strong>; import one here to send it on to a
            provider.
          </p>
        </div>

        <div className="transfer-form">
          <label className="field__label" htmlFor={fileId}>
            UPF file
          </label>
          <input
            id={fileId}
            ref={fileInput}
            className="field__input"
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
          />

          {file && (
            <>
              <p className="upf__summary">
                <strong>{file.name}</strong> — {file.playlists.length}{" "}
                {file.playlists.length === 1 ? "playlist" : "playlists"}
              </p>

              {file.playlists.length > 1 && (
                <>
                  <label className="field__label" htmlFor={playlistFieldId}>
                    Which playlist
                  </label>
                  <select
                    id={playlistFieldId}
                    className="field__input"
                    value={playlistId}
                    onChange={(event) => setPlaylistId(event.target.value)}
                  >
                    {file.playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.title} ({playlist.count})
                      </option>
                    ))}
                  </select>
                </>
              )}

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
                  <option value={UPF_DESTINATION_ID}>A UPF file (download)</option>
                  {destinations.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--connect"
                  onClick={startImport}
                  disabled={state.status === "importing"}
                >
                  {state.status === "importing" ? "Importing…" : "Import"}
                </button>
              </div>
            </>
          )}
        </div>

        {run.state.status === "starting" && (
          <p className="loading">
            <span className="loading__bar" aria-hidden="true" />
            Starting the import
          </p>
        )}

        {run.state.status === "running" && (
          <TransferProgressView job={run.state.job} onCancel={run.cancel} />
        )}

        {state.status === "rejected" && (
          <div role="alert" className="notice notice--error">
            <p>{state.message}</p>
            {state.problems.length > 0 && (
              <ul className="upf__problems">
                {state.problems.map((problem) => (
                  <li key={`${problem.path}:${problem.message}`}>
                    <code>{problem.path || "(document)"}</code> — {problem.message}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn--ghost" onClick={reset}>
              Choose another file
            </button>
          </div>
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

        <section className="history">
          <h3 className="history__heading">Exports</h3>
          {exports.length === 0 ? (
            <p className="transfer-form__hint">
              Nothing exported yet. Send a playlist to <strong>A UPF file</strong> from the Transfer
              panel and it will appear here.
            </p>
          ) : (
            <ul className="history__list">
              {exports.slice(0, 8).map((job) => (
                <li key={job.id} className="history__item">
                  <span className="history__playlist">{job.sourcePlaylistId}</span>
                  <span className="history__when">{new Date(job.createdAt).toLocaleString()}</span>
                  <a
                    className="history__download"
                    href={transfersClient.upfDownloadUrl(job.id)}
                    download={`${job.id}.upf.json`}
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

/** Mirrors `@ekusupo/core`'s TransferReport — see docs/transfer-engine.md. */
export interface TransferReport {
  sourceProvider: string;
  destinationProvider: string;
  itemType: string;
  totalItems: number;
  matchedItems: number;
  createdItems: number;
  skippedItems: number;
  failedItems: number;
  lowConfidenceMatches: unknown[];
  unavailableItems: { id: string; title: string; artists?: { name: string }[] }[];
  providerLimitationsEncountered: string[];
  userActionsRequired: string[];
  failureReason?: string;
}

export interface TransferJob {
  id: string;
  status: string;
  sourceProvider: string;
  destinationProvider: string;
  sourcePlaylistId: string;
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
  report?: TransferReport | null;
  /** Whether a UPF document can be downloaded for this transfer. */
  hasUpfDocument?: boolean;
}

export interface DryRunResult {
  job: TransferJob;
  report: TransferReport;
  usedConnectedAccount?: boolean;
  /** Present only for a Live Transfer whose destination was UPF. */
  downloadUrl?: string;
}

/** One reported problem in an uploaded UPF document — see @ekusupo/upf. */
export interface UpfProblem {
  path: string;
  message: string;
}

/**
 * The destination id meaning "a UPF document I can download". Not a
 * provider — there is no account to connect — so it never appears in the
 * providers catalog and has to be named here.
 */
export const UPF_DESTINATION_ID = "upf";

export interface TransfersClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ErrorBody {
  error?: string;
  problems?: UpfProblem[];
}

/**
 * Spotify playlist links come in several shapes, and users paste
 * whichever one their client copied:
 *
 *   https://open.spotify.com/playlist/<id>?si=...
 *   spotify:playlist:<id>
 *   <id>
 *
 * All three are accepted rather than demanding a bare id, because
 * "paste the link" is the only instruction anyone should need. The
 * query string is dropped — Spotify appends a share token that is not
 * part of the id and produces a 404 if sent.
 */
export function extractPlaylistId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const uriMatch = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(trimmed);
  if (uriMatch?.[1]) return uriMatch[1];

  const urlMatch = /playlist\/([A-Za-z0-9]+)/.exec(trimmed);
  if (urlMatch?.[1]) return urlMatch[1];

  // Already a bare id, or something we cannot improve on — hand it
  // through and let the API report what it finds.
  return trimmed;
}

export function createTransfersClient(config: TransfersClientConfig = {}) {
  const baseUrl = config.baseUrl ?? API_BASE_URL;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const fetchImpl = config.fetchImpl ?? fetch;
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    const body = (await response.json().catch(() => ({}))) as T & ErrorBody;
    if (!response.ok) {
      throw new ApiError(body.error ?? "Request failed.", response.status, body.problems ?? []);
    }
    return body;
  }

  return {
    /**
     * Runs a Dry Run. Note this resolves for a *failed* transfer too —
     * the request succeeded, the transfer's outcome was failure, and the
     * report explains why. Callers must check `job.status` rather than
     * treating any resolved promise as success (ADR-0027).
     */
    dryRun(sourcePlaylistId: string): Promise<DryRunResult> {
      return request("/transfers/dry-run", {
        method: "POST",
        body: JSON.stringify({ sourcePlaylistId }),
      });
    },

    /**
     * Runs a real transfer. `confirm: true` is required by the API's own
     * schema, not decoration here — a Live Transfer writes to a real
     * destination and CLAUDE.md §9.3 requires explicit confirmation for
     * exactly that. Resolves for a failed transfer too; check
     * `job.status`.
     */
    liveTransfer(sourcePlaylistId: string, destinationProvider: string): Promise<DryRunResult> {
      return request("/transfers/live", {
        method: "POST",
        body: JSON.stringify({ sourcePlaylistId, destinationProvider, confirm: true }),
      });
    },

    /**
     * Rejects with an `ApiError` carrying `problems` when the document is
     * not valid UPF, so the caller can list every fault rather than
     * showing one generic message.
     */
    importUpf(
      document: unknown,
      destinationProvider: string,
      playlistId?: string,
    ): Promise<DryRunResult> {
      return request("/transfers/import-upf", {
        method: "POST",
        body: JSON.stringify({
          document,
          destinationProvider,
          confirm: true,
          ...(playlistId ? { playlistId } : {}),
        }),
      });
    },

    listTransfers(): Promise<{ transfers: TransferJob[] }> {
      return request("/transfers");
    },

    /**
     * A URL to navigate to or put in an `<a download>`, never something
     * to `fetch()` — the response carries a `Content-Disposition`
     * attachment header, which only means anything to the browser's own
     * download machinery.
     */
    upfDownloadUrl(jobId: string): string {
      return `${baseUrl}/transfers/${encodeURIComponent(jobId)}/upf`;
    },
  };
}

export const transfersClient = createTransfersClient();

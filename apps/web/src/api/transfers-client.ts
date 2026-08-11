import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

/** Mirrors `@ekusupo/upf`'s Track, narrowed to what this app displays. */
export interface ReportTrack {
  id: string;
  title: string;
  artists?: { name: string }[];
  album?: { title: string };
  durationMs?: number;
}

/**
 * A match the engine was not confident about. Mirrors
 * `@ekusupo/core`'s `LowConfidenceMatch` — both ends of the pairing,
 * because a chosen candidate cannot be judged without the track it was
 * chosen for (CLAUDE.md §10.4).
 */
export interface LowConfidenceMatch {
  source: ReportTrack;
  decision: {
    candidate: ReportTrack;
    confidence: number;
    method: string;
    reason: string;
    risk: "low" | "medium" | "high";
    alternatives?: ReportTrack[];
  };
}

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
  lowConfidenceMatches: LowConfidenceMatch[];
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
  progress?: TransferProgress | null;
  /** Whether a UPF document can be downloaded for this transfer. */
  hasUpfDocument?: boolean;
}

/** How far a running transfer has got — see @ekusupo/core. */
export interface TransferProgress {
  step: "validating" | "reading_source" | "matching" | "writing" | "done";
  processed?: number;
  total?: number;
}

/**
 * What starting a transfer returns: the job, not the outcome. Transfers
 * run in the background (ADR-0033), so the result arrives by polling
 * `getTransfer`.
 */
export interface StartedTransfer {
  job: TransferJob;
  pollUrl: string;
  usedConnectedAccount?: boolean;
}

/** A job is finished when its status is one of these. */
export const TERMINAL_STATUSES = ["completed", "partial", "failed", "cancelled"] as const;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
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
      // Only when there is a body — see auth-client.ts. `cancel` sends
      // none, and announcing JSON without it is a 400.
      headers: {
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });

    const body = (await response.json().catch(() => ({}))) as T & ErrorBody;
    if (!response.ok) {
      throw new ApiError(body.error ?? "Request failed.", response.status, body.problems ?? []);
    }
    return body;
  }

  return {
    /**
     * Starts a Dry Run. Resolves as soon as the job exists, **not** when
     * the transfer finishes — the work continues on the server
     * (ADR-0033). Poll `getTransfer` for the outcome.
     */
    dryRun(sourcePlaylistId: string): Promise<StartedTransfer> {
      return request("/transfers/dry-run", {
        method: "POST",
        body: JSON.stringify({ sourcePlaylistId }),
      });
    },

    /**
     * Starts a real transfer. `confirm: true` is required by the API's own
     * schema, not decoration here — a Live Transfer writes to a real
     * destination and CLAUDE.md §9.3 requires explicit confirmation for
     * exactly that.
     */
    liveTransfer(sourcePlaylistId: string, destinationProvider: string): Promise<StartedTransfer> {
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
    ): Promise<StartedTransfer> {
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

    getTransfer(jobId: string): Promise<{ transfer: TransferJob }> {
      return request(`/transfers/${encodeURIComponent(jobId)}`);
    },

    cancelTransfer(jobId: string): Promise<{ cancelled: true }> {
      return request(`/transfers/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    },

    listTransfers(): Promise<{ transfers: TransferJob[] }> {
      return request("/transfers");
    },

    /**
     * Removes a finished transfer from history, along with its report and
     * its stored UPF export. Rejects with a 409 for a transfer that is
     * still running — cancel it first.
     */
    deleteTransfer(jobId: string): Promise<{ deleted: true }> {
      return request(`/transfers/${encodeURIComponent(jobId)}`, { method: "DELETE" });
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

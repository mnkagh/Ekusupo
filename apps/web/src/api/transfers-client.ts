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
}

export interface DryRunResult {
  job: TransferJob;
  report: TransferReport;
  usedConnectedAccount?: boolean;
}

export interface TransfersClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ErrorBody {
  error?: string;
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
      throw new ApiError(body.error ?? "Request failed.", response.status);
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

    listTransfers(): Promise<{ transfers: TransferJob[] }> {
      return request("/transfers");
    },
  };
}

export const transfersClient = createTransfersClient();

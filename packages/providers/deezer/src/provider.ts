import type {
  AuthSession,
  MusicProvider,
  Page,
  ProviderCapabilities,
  SearchQuery,
} from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import type { Playlist, Track } from "@ekusupo/upf";

import { DEEZER_API_BASE, deezerManifest } from "./manifest.js";
import { normalizePlaylist, normalizeTrack } from "./normalize.js";
import type { DeezerErrorBody, DeezerPlaylist, DeezerSearchResponse } from "./types.js";

export interface DeezerProviderConfig {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

/**
 * At 25 tracks a page (Deezer's playlist payload size), 400 pages is
 * 10,000 tracks — past any real playlist. A bound rather than a
 * `while (next)` so a paging bug stops instead of spinning against a
 * rate limit.
 */
const MAX_TRACK_PAGES = 400;

/**
 * Deezer answers some failures with HTTP 200 and an error object in the
 * body; those are translated here rather than leaking as shapes the
 * normalizers would choke on.
 */
async function requestJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new ConnectorError("not_found", "Deezer has no such resource.", {
        providerMessage: `GET ${url} answered 404`,
      });
    }
    throw new ConnectorError("provider_unavailable", `Deezer answered ${response.status}.`, {
      retryable: true,
      providerMessage: `GET ${url}`,
    });
  }

  const body = (await response.json()) as T & DeezerErrorBody;
  if (body && typeof body === "object" && body.error) {
    const message = body.error.message ?? "Deezer reported an error.";
    // Quota exhaustion is the common body-error; retrying after a wait
    // is the engine's job — this just marks it honestly.
    throw new ConnectorError("provider_unavailable", message, {
      retryable: true,
      providerMessage: JSON.stringify(body.error),
    });
  }
  return body;
}

/**
 * Read-only connector for Deezer's public catalogue: any playlist and
 * the search index, with no account involved. There is deliberately no
 * write method and no user library read — absence of capability is the
 * contract (ADR-0004, decision 2).
 */
export function createDeezerProvider(config: DeezerProviderConfig = {}): MusicProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = config.apiBaseUrl ?? DEEZER_API_BASE;

  async function getPlaylist(session: AuthSession, playlistId: string): Promise<Playlist> {
    void session;
    const playlist = await requestJson<DeezerPlaylist>(
      `${base}/playlist/${encodeURIComponent(playlistId)}`,
      fetchImpl,
    );

    const items = [...(playlist.tracks.data ?? [])];
    let next = playlist.tracks.next;

    for (let page = 1; next && page < MAX_TRACK_PAGES; page += 1) {
      const following = await requestJson<DeezerPlaylist["tracks"]>(next, fetchImpl);
      const pageItems = following.data ?? [];
      if (pageItems.length === 0) break;
      items.push(...pageItems);
      next = following.next;
    }

    return normalizePlaylist({ ...playlist, tracks: { ...playlist.tracks, data: items } });
  }

  return {
    manifest: deezerManifest,

    getCapabilities(): ProviderCapabilities {
      return { supports: deezerManifest.supportedCapabilities };
    },

    authenticate: async () => ({ method: "none", raw: {} }),
    refreshAuthentication: async (session: AuthSession) => session,
    revokeAuthentication: async () => {},

    async searchTracks(_session: AuthSession, query: SearchQuery): Promise<Page<Track>> {
      // Deezer's advanced syntax takes `ISRC:<code>` inline; when only an
      // ISRC was given the text part drops out entirely.
      const terms = [query.text.trim(), query.isrc ? `ISRC:${query.isrc}` : ""]
        .filter(Boolean)
        .join(" ");
      const response = await requestJson<DeezerSearchResponse>(
        `${base}/search?q=${encodeURIComponent(terms)}`,
        fetchImpl,
      );

      return { items: (response.data ?? []).map(normalizeTrack) };
    },

    getPlaylist,
  };
}

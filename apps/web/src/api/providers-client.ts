import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

export interface ConnectedProvider {
  provider: string;
  connectedAt: string;
}

export interface ProvidersClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ErrorBody {
  error?: string;
}

/**
 * `getSpotifyConnectUrl` returns a URL to navigate the browser to
 * (`window.location.href = ...` or a plain `<a href>`), not something to
 * `fetch()` — `/providers/spotify/connect` is a real server-side 302 to
 * Spotify's own login/consent page; fetching it with JS would just
 * retrieve that page's HTML instead of taking the user there. See
 * ADR-0026.
 */
export function createProvidersClient(config: ProvidersClientConfig = {}) {
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
    listProviders(): Promise<{ providers: ConnectedProvider[] }> {
      return request("/providers");
    },

    disconnectProvider(provider: string): Promise<{ disconnected: true }> {
      return request(`/providers/${encodeURIComponent(provider)}`, { method: "DELETE" });
    },

    getSpotifyConnectUrl(): string {
      return `${baseUrl}/providers/spotify/connect`;
    },
  };
}

export const providersClient = createProvidersClient();

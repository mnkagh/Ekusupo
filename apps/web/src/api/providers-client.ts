import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

export interface ConnectedProvider {
  provider: string;
  connectedAt: string;
}

/** What the server says it can actually connect — see provider-registry.ts. */
export interface CatalogProvider {
  id: string;
  displayName: string;
  authKind: "oauth2" | "serverToken";
  configured: boolean;
  requiredEnv: string[];
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

    listCatalog(): Promise<{ providers: CatalogProvider[] }> {
      return request("/providers/catalog");
    },

    /**
     * A URL to navigate to, never something to `fetch()` — the connect
     * route is a real server-side 302 to the provider's own consent
     * page, and fetching it would just retrieve that page's HTML.
     */
    getConnectUrl(provider: string): string {
      return `${baseUrl}/providers/${encodeURIComponent(provider)}/connect`;
    },
  };
}

export const providersClient = createProvidersClient();

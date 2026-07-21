import { ConnectorError } from "@ekusupo/connector-sdk";
import type { AuthSession } from "@ekusupo/connector-sdk";

const DEFAULT_API_BASE_URL = "https://api.spotify.com/v1";

export interface SpotifyHttpClientConfig {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

export interface SpotifyHttpClient {
  request<T>(session: AuthSession, path: string): Promise<T>;
}

export function createSpotifyHttpClient(config: SpotifyHttpClientConfig = {}): SpotifyHttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  return {
    async request<T>(session: AuthSession, path: string): Promise<T> {
      const accessToken = session.raw.accessToken;
      if (typeof accessToken !== "string") {
        throw new ConnectorError(
          "authentication_error",
          "Session is missing an access token — call authenticate() first.",
        );
      }

      const response = await fetchImpl(`${apiBaseUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw mapSpotifyHttpError(response);
      }

      return (await response.json()) as T;
    },
  };
}

export function mapSpotifyHttpError(response: Response): ConnectorError {
  const providerMessage = `Spotify API responded with ${response.status} ${response.statusText}`;

  if (response.status === 401) {
    return new ConnectorError("authentication_error", "Spotify authentication failed or expired.", {
      providerMessage,
    });
  }
  if (response.status === 403) {
    return new ConnectorError("authorization_error", "Spotify denied this request.", {
      providerMessage,
    });
  }
  if (response.status === 404) {
    return new ConnectorError("not_found", "The requested Spotify resource was not found.", {
      providerMessage,
    });
  }
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    return new ConnectorError("rate_limited", "Spotify rate limit exceeded.", {
      providerMessage,
      retryAfterMs,
    });
  }
  if (response.status >= 500) {
    return new ConnectorError("provider_unavailable", "Spotify API is currently unavailable.", {
      providerMessage,
    });
  }
  return new ConnectorError("unknown_error", "Spotify API request failed.", { providerMessage });
}

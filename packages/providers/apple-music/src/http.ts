import { ConnectorError } from "@ekusupo/connector-sdk";
import type { AuthSession } from "@ekusupo/connector-sdk";

const DEFAULT_API_BASE_URL = "https://api.music.apple.com/v1";

export interface AppleMusicHttpClientConfig {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

export interface AppleMusicHttpClient {
  request<T>(session: AuthSession, path: string): Promise<T>;
}

/**
 * Apple Music needs **two** credentials on every call, which is what
 * makes it structurally different from Spotify:
 *
 * - `Authorization: Bearer <developer token>` — a JWT the *server*
 *   signs with a private key from an Apple Developer account. It
 *   identifies the app, and it is required even for public catalogue
 *   reads.
 * - `Music-User-Token` — identifies the listener, and is only present
 *   once someone has authorized through MusicKit. Catalogue reads work
 *   without it; anything personal does not.
 *
 * Both live on the session so this client stays a pure transport.
 */
export function createAppleMusicHttpClient(
  config: AppleMusicHttpClientConfig = {},
): AppleMusicHttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  return {
    async request<T>(session: AuthSession, path: string): Promise<T> {
      const developerToken = session.raw.developerToken;
      if (typeof developerToken !== "string") {
        throw new ConnectorError(
          "authentication_error",
          "Session is missing an Apple Music developer token — call authenticate() first.",
        );
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${developerToken}`,
      };
      // Present only for user-scoped requests; a catalogue read is valid
      // without it, so its absence is not an error here.
      if (typeof session.raw.musicUserToken === "string") {
        headers["Music-User-Token"] = session.raw.musicUserToken;
      }

      const response = await fetchImpl(`${apiBaseUrl}${path}`, { headers });
      if (!response.ok) {
        throw mapAppleMusicHttpError(response);
      }
      return (await response.json()) as T;
    },
  };
}

export function mapAppleMusicHttpError(response: Response): ConnectorError {
  const providerMessage = `Apple Music API responded with ${response.status} ${response.statusText}`;

  if (response.status === 401) {
    return new ConnectorError(
      "authentication_error",
      "Apple Music authentication failed or the developer token expired.",
      { providerMessage },
    );
  }
  if (response.status === 403) {
    // Distinct from 401 on purpose: this is the shape a missing
    // Music-User-Token takes when reading something user-scoped, and
    // "sign in again" would be the wrong advice.
    return new ConnectorError(
      "authorization_error",
      "Apple Music denied this request — it may need a listener to authorize access.",
      { providerMessage },
    );
  }
  if (response.status === 404) {
    return new ConnectorError("not_found", "The requested Apple Music resource was not found.", {
      providerMessage,
    });
  }
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    return new ConnectorError("rate_limited", "Apple Music rate limit exceeded.", {
      providerMessage,
      retryAfterMs,
    });
  }
  if (response.status >= 500) {
    return new ConnectorError("provider_unavailable", "Apple Music API is currently unavailable.", {
      providerMessage,
    });
  }
  return new ConnectorError("unknown_error", "Apple Music API request failed.", {
    providerMessage,
  });
}

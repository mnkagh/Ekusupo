import { ConnectorError } from "@ekusupo/connector-sdk";
import type { AuthSession } from "@ekusupo/connector-sdk";

const DEFAULT_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

export interface YouTubeHttpClientConfig {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

export interface YouTubeHttpClient {
  request<T>(session: AuthSession, path: string): Promise<T>;
  post<T>(session: AuthSession, path: string, body: unknown): Promise<T>;
}

export function createYouTubeHttpClient(config: YouTubeHttpClientConfig = {}): YouTubeHttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  function authHeader(session: AuthSession): string {
    const accessToken = session.raw.accessToken;
    if (typeof accessToken !== "string") {
      throw new ConnectorError(
        "authentication_error",
        "Session is missing an access token — call authenticate() first.",
      );
    }
    return `Bearer ${accessToken}`;
  }

  return {
    async request<T>(session: AuthSession, path: string): Promise<T> {
      const response = await fetchImpl(`${apiBaseUrl}${path}`, {
        headers: { Authorization: authHeader(session) },
      });
      if (!response.ok) throw await mapYouTubeHttpError(response);
      return (await response.json()) as T;
    },

    async post<T>(session: AuthSession, path: string, body: unknown): Promise<T> {
      const response = await fetchImpl(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: authHeader(session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await mapYouTubeHttpError(response);
      return (await response.json()) as T;
    },
  };
}

/**
 * Async because YouTube puts the *actionable* part of a failure in the
 * response body, not the status line: a 403 is `quotaExceeded` on a busy
 * day and `forbidden` on a permissions problem, and those need different
 * responses from the caller. Reading the body is the only way to tell.
 */
export async function mapYouTubeHttpError(response: Response): Promise<ConnectorError> {
  const providerMessage = `YouTube API responded with ${response.status} ${response.statusText}`;
  let reason = "";
  try {
    const body = (await response.clone().json()) as {
      error?: { errors?: { reason?: string }[] };
    };
    reason = body.error?.errors?.[0]?.reason ?? "";
  } catch {
    // A non-JSON error body is possible; the status alone still maps.
  }

  if (response.status === 401) {
    return new ConnectorError("authentication_error", "YouTube authentication failed or expired.", {
      providerMessage,
    });
  }
  if (response.status === 403) {
    // Quota exhaustion is a *rate* problem that resets, so it is
    // retryable; a permissions denial is not. Collapsing both into
    // authorization_error would make the engine give up on a transfer
    // that would have succeeded an hour later.
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
      return new ConnectorError("rate_limited", "YouTube API quota exceeded for today.", {
        providerMessage,
        retryable: true,
      });
    }
    return new ConnectorError("authorization_error", "YouTube denied this request.", {
      providerMessage,
    });
  }
  if (response.status === 404) {
    return new ConnectorError("not_found", "The requested YouTube resource was not found.", {
      providerMessage,
    });
  }
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    return new ConnectorError("rate_limited", "YouTube rate limit exceeded.", {
      providerMessage,
      retryAfterMs: retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined,
    });
  }
  if (response.status >= 500) {
    return new ConnectorError("provider_unavailable", "YouTube API is currently unavailable.", {
      providerMessage,
    });
  }
  return new ConnectorError("unknown_error", "YouTube API request failed.", { providerMessage });
}

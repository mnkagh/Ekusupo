/** `"none"` covers connectors that need no remote authentication at all. */
export type AuthMethod = "oauth2" | "apiKey" | "none";

/**
 * What Core hands a provider to start/complete authentication. `raw` is
 * opaque to the SDK — each provider defines what goes in it (an OAuth
 * authorization code, an API key, etc.). The SDK never parses or
 * generates a token.
 */
export interface AuthInput {
  method: AuthMethod;
  raw: Record<string, unknown>;
}

/**
 * What a provider hands back once authenticated. `expiresAt` is the one
 * field the SDK does understand, so Core can generically know a session
 * may be stale without knowing the token format underneath.
 */
export interface AuthSession {
  method: AuthMethod;
  raw: Record<string, unknown>;
  /** ISO 8601. */
  expiresAt?: string;
}

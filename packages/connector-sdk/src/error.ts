/**
 * Deliberately scoped to failures a single connector call can have.
 * Cross-call outcomes like "partial transfer failure" or "match failure"
 * (CLAUDE.md §16.3) belong to the Transfer Engine's own error model, not
 * here — see ADR-0004.
 */
export type ConnectorErrorCode =
  | "authentication_error"
  | "authorization_error"
  | "rate_limited"
  | "provider_unavailable"
  | "unsupported_capability"
  | "validation_error"
  | "not_found"
  | "unknown_error";

export interface ConnectorErrorOptions {
  /** The raw error message/detail from the provider, preserved for debugging. */
  providerMessage?: string;
  /** Defaults to true for "rate_limited"/"provider_unavailable", false otherwise. */
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}

/** Every error a `MusicProvider` method throws should be a `ConnectorError`. */
export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly providerMessage?: string;

  constructor(code: ConnectorErrorCode, message: string, options: ConnectorErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ConnectorError";
    this.code = code;
    this.retryable =
      options.retryable ?? (code === "rate_limited" || code === "provider_unavailable");
    this.retryAfterMs = options.retryAfterMs;
    this.providerMessage = options.providerMessage;
  }
}

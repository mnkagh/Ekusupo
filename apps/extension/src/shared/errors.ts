/** Mirrors ConnectorError's shape (packages/connector-sdk/src/error.ts). */
export type MessageErrorCode = "no_handler" | "handler_error";

export class MessageError extends Error {
  readonly code: MessageErrorCode;

  constructor(code: MessageErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "MessageError";
    this.code = code;
  }
}

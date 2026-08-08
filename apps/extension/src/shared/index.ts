export { MessageError } from "./errors.js";
export type { MessageErrorCode } from "./errors.js";
export { onMessage, sendToBackground, sendToTab } from "./message-bus.js";
export type {
  DetectedResource,
  ExtensionMessage,
  MessageMap,
  MessageResponse,
  MessageType,
  ResourceType,
  StartTransferPayload,
  TransferProgressPayload,
  TransferReportSummary,
  TransferStatus,
} from "./messages.js";

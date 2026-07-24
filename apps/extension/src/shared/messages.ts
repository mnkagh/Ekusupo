/**
 * The extension's entire message catalog. Payloads/responses are plain,
 * structured-cloneable data only — never a type imported from
 * @ekusupo/*, not even type-only. See docs/browser-extension.md
 * "Messaging layer" and ADR-0008.
 */

export type ResourceType = "playlist" | "track" | "album";

export interface DetectedResource {
  provider: string;
  resourceType: ResourceType;
  resourceId: string;
}

export interface StartTransferPayload {
  sourceProvider: string;
  sourcePlaylistId: string;
  destinationProvider: string;
}

/** Mirrors, but does not import, @ekusupo/core's TransferJobStatus. */
export type TransferStatus =
  "pending" | "running" | "paused" | "cancelled" | "completed" | "failed" | "partial";

export interface TransferProgressPayload {
  jobId: string;
  step: string;
  processed?: number;
  total?: number;
}

/** Mirrors, but does not import, @ekusupo/core's TransferReport. */
export interface TransferReportSummary {
  totalItems: number;
  matchedItems: number;
  createdItems: number;
  skippedItems: number;
  failedItems: number;
}

export interface MessageMap {
  // Popup -> Background
  DetectCurrentPage: { payload: undefined; response: { resource: DetectedResource | null } };
  StartTransfer: { payload: StartTransferPayload; response: { jobId: string } };
  GetTransferStatus: { payload: { jobId: string }; response: { status: TransferStatus } };
  AuthenticateProvider: { payload: { provider: string }; response: { connected: boolean } };

  // Background -> Content
  ReadPageMetadata: { payload: undefined; response: { resource: DetectedResource | null } };
  InjectUI: { payload: { resource: DetectedResource }; response: { injected: boolean } };
  HighlightPlaylist: { payload: { resourceId: string }; response: { highlighted: boolean } };

  // Content -> Background
  CurrentResource: {
    payload: { resource: DetectedResource | null };
    response: { acknowledged: true };
  };
  UserClickedTransfer: {
    payload: { resource: DetectedResource };
    response: { acknowledged: true };
  };

  // Background -> Popup (push-style; see docs/browser-extension.md)
  TransferProgress: { payload: TransferProgressPayload; response: { acknowledged: true } };
  TransferCompleted: {
    payload: { jobId: string; report: TransferReportSummary };
    response: { acknowledged: true };
  };
  TransferFailed: {
    payload: { jobId: string; reason: string };
    response: { acknowledged: true };
  };
}

export type MessageType = keyof MessageMap;

export interface ExtensionMessage<T extends MessageType = MessageType> {
  type: T;
  payload: MessageMap[T]["payload"];
}

export type MessageResponse<T extends MessageType> = MessageMap[T]["response"];

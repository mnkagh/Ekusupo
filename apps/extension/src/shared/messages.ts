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

/**
 * The shape a UI (injected panel, popup) renders from — built directly
 * from TransferProgress/Completed/Failed payloads, not a separately
 * invented vocabulary (see docs/browser-extension.md "Progress UI" and
 * ADR-0013). Shared between `content/ui/ActionPanel.tsx` and
 * `popup/Popup.tsx` so "what does a transfer's state look like" has one
 * definition.
 */
export type TransferPanelState =
  | { kind: "idle" }
  | { kind: "running"; step: string; processed?: number; total?: number }
  | { kind: "completed"; summary: TransferReportSummary }
  | { kind: "failed"; reason: string };

export interface MessageMap {
  // Popup / Options -> Background
  DetectCurrentPage: { payload: undefined; response: { resource: DetectedResource | null } };
  StartTransfer: { payload: StartTransferPayload; response: { jobId: string } };
  /**
   * Keyed by tabId, not jobId — the popup knows which tab it's looking at
   * (`chrome.tabs.query({ active: true, currentWindow: true })`), not
   * which job is running there. See ADR-0015.
   */
  GetTabTransferState: { payload: { tabId: number }; response: { state: TransferPanelState } };
  /**
   * Sent from `options/` once it's already run the PKCE redirect
   * (`chrome.identity.launchWebAuthFlow`) and has an authorization code
   * in hand — background only does the token exchange. See ADR-0020.
   */
  AuthenticateProvider: {
    payload: {
      provider: string;
      code: string;
      redirectUri: string;
      codeVerifier: string;
      clientId: string;
    };
    response: { connected: boolean };
  };

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
  PreviewRequested: {
    payload: { resource: DetectedResource };
    response: { acknowledged: true };
  };
  CopyUpfRequested: {
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

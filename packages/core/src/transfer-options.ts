export type TransferProgressStep =
  "validating" | "reading_source" | "matching" | "writing" | "done";

export interface TransferProgressEvent {
  step: TransferProgressStep;
  /** Tracks processed so far, once processing has started. */
  processed?: number;
  total?: number;
}

export interface TransferOptions {
  /** Run the full read-and-match pipeline but skip every write call. */
  dryRun?: boolean;
  onProgress?: (event: TransferProgressEvent) => void;
}

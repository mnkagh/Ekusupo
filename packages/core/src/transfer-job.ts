export type TransferJobStatus =
  "pending" | "running" | "paused" | "cancelled" | "completed" | "failed" | "partial";

export interface TransferJob {
  id: string;
  status: TransferJobStatus;
  /** `MusicProvider.manifest.name`. */
  sourceProvider: string;
  destinationProvider: string;
  sourcePlaylistId: string;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
  dryRun: boolean;
}

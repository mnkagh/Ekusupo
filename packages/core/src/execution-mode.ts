/**
 * See docs/decisions/0011-transfer-engine-execution-modes.md. Dry Run
 * validates, normalizes to UPF, and matches against the destination where
 * possible, but never requires destination write or search capabilities
 * and never mutates any provider. Live Transfer requires and uses full
 * destination write capabilities to actually move tracks.
 */
export type ExecutionMode = "dryRun" | "live";

// Deliberately does NOT export types.ts (Apple-native shapes) or
// normalize.ts (internal conversion functions) — see ADR-0004, decision 1.
// Consumers only ever see MusicProvider + UPF types.
export { appleMusicManifest } from "./manifest.js";
export { createAppleMusicProvider } from "./provider.js";
export type { AppleMusicProviderConfig } from "./provider.js";

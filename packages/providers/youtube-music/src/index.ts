// Deliberately does NOT export types.ts (YouTube-native shapes) or
// normalize.ts (internal conversion functions) — see ADR-0004, decision 1.
// Consumers only ever see MusicProvider + UPF types.
export { youtubeMusicManifest } from "./manifest.js";
export { createYouTubeMusicProvider } from "./provider.js";
export type { YouTubeMusicProviderConfig } from "./provider.js";

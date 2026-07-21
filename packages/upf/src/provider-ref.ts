/**
 * A reference to an entity on a specific provider. The provider itself is
 * never part of this type — it's the runtime string key in `ProviderRefs`.
 * See docs/universal-playlist-format.md#provider-agnosticism.
 */
export interface ProviderRef {
  /** This entity's id on that provider. */
  id: string;
  /** A canonical/shareable URL on that provider, if any. */
  url?: string;
  /** Provider-specific fields not otherwise modeled — isolated, never required. */
  raw?: Record<string, unknown>;
}

/**
 * Keyed by an arbitrary runtime provider slug (e.g. "spotify"), never a
 * closed union of known providers — this is what keeps packages/upf itself
 * provider-agnostic.
 */
export type ProviderRefs = Record<string, ProviderRef>;

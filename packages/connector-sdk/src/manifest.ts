import type { AuthMethod } from "./auth.js";
import type { ProviderCapability } from "./capability.js";

/**
 * Static metadata describing a connector, readable without constructing
 * or authenticating a `MusicProvider` instance. Provider packages should
 * also export this as a standalone value (see docs/connector-sdk.md).
 */
export interface ProviderManifest {
  /** Stable slug, e.g. "spotify" — a runtime value, never a type. */
  name: string;
  displayName: string;
  /** The provider package's own version. */
  version: string;
  authenticationMethods: AuthMethod[];
  /**
   * The static ceiling of what this integration is built to support.
   * `MusicProvider.getCapabilities()` is the authoritative runtime value
   * and should never exceed this set.
   */
  supportedCapabilities: ReadonlySet<ProviderCapability>;
  website?: string;
  documentation?: string;
  icon?: string;
}

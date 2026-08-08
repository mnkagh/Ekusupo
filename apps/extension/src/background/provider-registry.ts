import type { MusicProvider } from "@ekusupo/connector-sdk";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";

export interface ProviderConfig {
  /** Needed for authenticate() — see ADR-0019/ADR-0020. Ignored by providers that don't need one. */
  clientId?: string;
}

/**
 * The one place `background/` names a concrete provider package — see
 * docs/browser-extension.md "Adding a future provider." Everything else
 * (session store, transfer orchestrator) takes an already-resolved
 * `MusicProvider` and never sees a provider name string, so adding a
 * second provider later is one new map entry here, not a change to any
 * other file.
 */
const PROVIDER_FACTORIES: Record<string, (config?: ProviderConfig) => MusicProvider> = {
  spotify: (config) => createSpotifyProvider({ clientId: config?.clientId }),
};

export function getProvider(name: string, config?: ProviderConfig): MusicProvider | undefined {
  return PROVIDER_FACTORIES[name]?.(config);
}

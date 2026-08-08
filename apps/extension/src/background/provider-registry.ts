import type { MusicProvider } from "@ekusupo/connector-sdk";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";

/**
 * The one place `background/` names a concrete provider package — see
 * docs/browser-extension.md "Adding a future provider." Everything else
 * (session store, transfer orchestrator) takes an already-resolved
 * `MusicProvider` and never sees a provider name string, so adding a
 * second provider later is one new map entry here, not a change to any
 * other file.
 */
const PROVIDER_FACTORIES: Record<string, () => MusicProvider> = {
  spotify: () => createSpotifyProvider(),
};

export function getProvider(name: string): MusicProvider | undefined {
  return PROVIDER_FACTORIES[name]?.();
}

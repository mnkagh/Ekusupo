import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import type { Playlist } from "@ekusupo/upf";
import { describe, expect, it, vi } from "vitest";

import type { DetectedResource } from "../shared/messages.js";
import { runDryRunTransferForResource, summarizeReport } from "./transfer-orchestrator.js";

const session: AuthSession = { method: "none", raw: {} };

const playlistResource: DetectedResource = {
  provider: "spotify",
  resourceType: "playlist",
  resourceId: "playlist-1",
};

/** Mirrors the fake-provider style already used in packages/core's tests. */
function makeReadOnlyProvider(playlist: Playlist): MusicProvider {
  return {
    manifest: {
      name: "spotify",
      displayName: "Spotify",
      version: "0.0.0",
      authenticationMethods: ["oauth2"],
      supportedCapabilities: new Set(["profile.read", "playlists.read"]),
    },
    getCapabilities: () => ({ supports: new Set(["profile.read", "playlists.read"]) }),
    authenticate: async () => session,
    refreshAuthentication: async (s) => s,
    revokeAuthentication: async () => {},
    getPlaylist: async () => playlist,
  };
}

function makePlaylist(): Playlist {
  return {
    id: "playlist-1",
    title: "My Playlist",
    items: [{ track: { id: "t1", title: "Song", artists: [{ id: "a1", name: "Artist" }] } }],
  };
}

describe("runDryRunTransferForResource", () => {
  it("fails without calling the engine when the resource isn't a playlist", async () => {
    const onFailed = vi.fn();
    const getProvider = vi.fn();

    await runDryRunTransferForResource(
      { provider: "spotify", resourceType: "album", resourceId: "album-1" },
      {
        getProvider,
        getSession: () => session,
        onProgress: vi.fn(),
        onCompleted: vi.fn(),
        onFailed,
      },
    );

    expect(getProvider).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(
      "Ekusupo can only transfer playlists today, not a album.",
    );
  });

  it("fails clearly when the provider isn't supported", async () => {
    const onFailed = vi.fn();

    await runDryRunTransferForResource(playlistResource, {
      getProvider: () => undefined,
      getSession: () => session,
      onProgress: vi.fn(),
      onCompleted: vi.fn(),
      onFailed,
    });

    expect(onFailed).toHaveBeenCalledWith('"spotify" is not a supported provider.');
  });

  it("fails clearly when the provider has no session yet — no OAuth flow exists", async () => {
    const onFailed = vi.fn();
    const provider = makeReadOnlyProvider(makePlaylist());

    await runDryRunTransferForResource(playlistResource, {
      getProvider: () => provider,
      getSession: () => undefined,
      onProgress: vi.fn(),
      onCompleted: vi.fn(),
      onFailed,
    });

    expect(onFailed).toHaveBeenCalledWith(
      "spotify isn't connected yet — connect your account before starting a transfer.",
    );
  });

  it("runs a dry run using the same provider as source and destination", async () => {
    const provider = makeReadOnlyProvider(makePlaylist());
    const onProgress = vi.fn();
    const onCompleted = vi.fn();

    await runDryRunTransferForResource(playlistResource, {
      getProvider: () => provider,
      getSession: () => session,
      onProgress,
      onCompleted,
      onFailed: vi.fn(),
    });

    expect(onProgress).toHaveBeenCalled();
    expect(onCompleted).toHaveBeenCalledTimes(1);
    const report = onCompleted.mock.calls[0]?.[0];
    expect(report.totalItems).toBe(1);
    expect(report.sourceProvider).toBe("spotify");
    expect(report.destinationProvider).toBe("spotify");
    // Read-only Spotify can't search, so dry run reports the limitation
    // rather than a match — see ADR-0011.
    expect(report.providerLimitationsEncountered).toEqual([
      "Destination provider cannot search tracks — dry run produced a plan without destination matches.",
    ]);
  });

  it("reports a failure, not a completion, when the source can't be read", async () => {
    const provider: MusicProvider = {
      manifest: {
        name: "spotify",
        displayName: "Spotify",
        version: "0.0.0",
        authenticationMethods: ["oauth2"],
        supportedCapabilities: new Set(["profile.read", "playlists.read"]),
      },
      getCapabilities: () => ({ supports: new Set(["profile.read", "playlists.read"]) }),
      authenticate: async () => session,
      refreshAuthentication: async (s) => s,
      revokeAuthentication: async () => {},
      getPlaylist: async () => {
        throw new Error("network unreachable");
      },
    };
    const onFailed = vi.fn();
    const onCompleted = vi.fn();

    await runDryRunTransferForResource(playlistResource, {
      getProvider: () => provider,
      getSession: () => session,
      onProgress: vi.fn(),
      onCompleted,
      onFailed,
    });

    // The engine turns a source-read failure into a `failed` job rather
    // than throwing, so the reason arrives via the report. Asserting
    // `onCompleted` stayed unused is the point of this test: a failed run
    // has all-zero counters and would otherwise be indistinguishable from
    // a successful transfer of an empty playlist.
    expect(onFailed).toHaveBeenCalledWith(
      "Could not read the source playlist: network unreachable",
    );
    expect(onCompleted).not.toHaveBeenCalled();
  });
});

describe("summarizeReport", () => {
  it("keeps only the small summary fields the extension's wire protocol needs", () => {
    const summary = summarizeReport({
      sourceProvider: "spotify",
      destinationProvider: "spotify",
      itemType: "playlist",
      totalItems: 3,
      matchedItems: 1,
      createdItems: 0,
      skippedItems: 2,
      failedItems: 0,
      lowConfidenceMatches: [],
      unavailableItems: [],
      providerLimitationsEncountered: ["note"],
      userActionsRequired: [],
    });

    expect(summary).toEqual({
      totalItems: 3,
      matchedItems: 1,
      createdItems: 0,
      skippedItems: 2,
      failedItems: 0,
    });
  });
});

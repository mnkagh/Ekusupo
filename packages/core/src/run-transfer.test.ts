import type {
  AuthSession,
  CreatePlaylistInput,
  MusicProvider,
  Page,
  ProviderCapability,
  SearchQuery,
} from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import type { Playlist, Track } from "@ekusupo/upf";
import { describe, expect, it } from "vitest";

import { runDryRunTransfer, runTransfer } from "./run-transfer.js";
import { InMemoryTransferJobStore } from "./transfer-job-store.js";

const sourceSession: AuthSession = { method: "none", raw: {} };
const destinationSession: AuthSession = { method: "none", raw: {} };

function track(overrides: Partial<Track> & Pick<Track, "id" | "title">): Track {
  return {
    artists: [{ id: "artist-1", name: "Artist" }],
    ...overrides,
  };
}

function playlist(tracks: Track[]): Playlist {
  return {
    id: "playlist-1",
    title: "My Playlist",
    items: tracks.map((item) => ({ track: item })),
  };
}

/**
 * A fake readable-source `MusicProvider` — mirrors the fake provider
 * technique already used in `packages/connector-sdk`'s own tests, letting
 * cross-provider orchestration be validated without a second real
 * connector (ADR-0006).
 */
function makeSource(sourcePlaylist: Playlist): MusicProvider {
  return {
    manifest: {
      name: "fake-source",
      displayName: "Fake Source",
      version: "0.0.0",
      authenticationMethods: ["none"],
      supportedCapabilities: new Set(["playlists.read"]),
    },
    getCapabilities: () => ({ supports: new Set(["playlists.read"]) }),
    authenticate: async () => ({ method: "none", raw: {} }),
    refreshAuthentication: async (session) => session,
    revokeAuthentication: async () => {},
    getPlaylist: async () => sourcePlaylist,
  };
}

interface FakeDestination extends MusicProvider {
  createdPlaylists: CreatePlaylistInput[];
  addedTracks: { playlistId: string; tracks: Track[] }[];
}

interface FakeDestinationOptions {
  capabilities?: ProviderCapability[];
  search: (query: SearchQuery) => Promise<Page<Track>>;
}

function makeDestination(options: FakeDestinationOptions): FakeDestination {
  const createdPlaylists: CreatePlaylistInput[] = [];
  const addedTracks: { playlistId: string; tracks: Track[] }[] = [];
  const capabilities = new Set<ProviderCapability>(
    options.capabilities ?? ["tracks.search", "playlists.create", "playlists.addTracks"],
  );

  return {
    manifest: {
      name: "fake-destination",
      displayName: "Fake Destination",
      version: "0.0.0",
      authenticationMethods: ["none"],
      supportedCapabilities: capabilities,
    },
    getCapabilities: () => ({ supports: capabilities }),
    authenticate: async () => ({ method: "none", raw: {} }),
    refreshAuthentication: async (session) => session,
    revokeAuthentication: async () => {},
    searchTracks: async (_session, query) => options.search(query),
    createPlaylist: capabilities.has("playlists.create")
      ? async (_session, input) => {
          createdPlaylists.push(input);
          return { id: "dest-playlist-1", title: input.title, items: [] };
        }
      : undefined,
    addTracksToPlaylist: capabilities.has("playlists.addTracks")
      ? async (_session, playlistId, tracks) => {
          addedTracks.push({ playlistId, tracks });
          return {
            id: playlistId,
            title: "dest-playlist",
            items: tracks.map((t) => ({ track: t })),
          };
        }
      : undefined,
    createdPlaylists,
    addedTracks,
  };
}

/**
 * Mirrors the real Spotify provider's declared capabilities exactly
 * (`profile.read`, `playlists.read` only — no search or write methods at
 * all). Used to prove dry run works against the one real provider that
 * exists today. See ADR-0011.
 */
function makeReadOnlyDestination(): MusicProvider {
  return {
    manifest: {
      name: "read-only-destination",
      displayName: "Read-only Destination",
      version: "0.0.0",
      authenticationMethods: ["none"],
      supportedCapabilities: new Set(["profile.read", "playlists.read"]),
    },
    getCapabilities: () => ({ supports: new Set(["profile.read", "playlists.read"]) }),
    authenticate: async () => ({ method: "none", raw: {} }),
    refreshAuthentication: async (session) => session,
    revokeAuthentication: async () => {},
  };
}

describe("runTransfer", () => {
  it("completes a full transfer end to end", async () => {
    const songA = track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } });
    const songB = track({ id: "s2", title: "Song B", externalIds: { isrc: "ISRC-B" } });
    const source = makeSource(playlist([songA, songB]));
    const destination = makeDestination({
      search: async (query) => {
        if (query.isrc === "ISRC-A") {
          return { items: [track({ id: "d1", title: "Song A", externalIds: { isrc: "ISRC-A" } })] };
        }
        if (query.isrc === "ISRC-B") {
          return { items: [track({ id: "d2", title: "Song B", externalIds: { isrc: "ISRC-B" } })] };
        }
        return { items: [] };
      },
    });

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
    });

    expect(job.status).toBe("completed");
    expect(report.totalItems).toBe(2);
    expect(report.matchedItems).toBe(2);
    expect(report.createdItems).toBe(2);
    expect(report.failedItems).toBe(0);
    expect(destination.createdPlaylists).toHaveLength(1);
    expect(destination.addedTracks).toHaveLength(2);
  });

  it("reports a partial failure when a track can't be matched", async () => {
    const songA = track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } });
    const obscure = track({ id: "s2", title: "Obscure B-Side" });
    const source = makeSource(playlist([songA, obscure]));
    const destination = makeDestination({
      search: async (query) =>
        query.isrc === "ISRC-A"
          ? { items: [track({ id: "d1", title: "Song A", externalIds: { isrc: "ISRC-A" } })] }
          : { items: [] },
    });

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
    });

    expect(job.status).toBe("partial");
    expect(report.matchedItems).toBe(1);
    expect(report.skippedItems).toBe(1);
    expect(report.unavailableItems).toHaveLength(1);
  });

  it("dry run matches without writing anything", async () => {
    const songA = track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } });
    const source = makeSource(playlist([songA]));
    const destination = makeDestination({
      search: async () => ({
        items: [track({ id: "d1", title: "Song A", externalIds: { isrc: "ISRC-A" } })],
      }),
    });

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
      options: { dryRun: true },
    });

    expect(job.status).toBe("completed");
    expect(report.matchedItems).toBe(1);
    expect(report.createdItems).toBe(0);
    expect(destination.createdPlaylists).toHaveLength(0);
    expect(destination.addedTracks).toHaveLength(0);
  });

  it("fails fast when the destination can't create or populate playlists", async () => {
    const source = makeSource(playlist([track({ id: "s1", title: "Song A" })]));
    const destination = makeDestination({
      capabilities: ["tracks.search"],
      search: async () => ({ items: [] }),
    });

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
    });

    expect(job.status).toBe("failed");
    expect(report.totalItems).toBe(0);
    expect(report.providerLimitationsEncountered).toHaveLength(1);
  });

  it("retries once on a retryable rate-limited search error, then succeeds", async () => {
    const source = makeSource(
      playlist([track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } })]),
    );
    let attempts = 0;
    const destination = makeDestination({
      search: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ConnectorError("rate_limited", "slow down", { retryAfterMs: 5 });
        }
        return { items: [track({ id: "d1", title: "Song A", externalIds: { isrc: "ISRC-A" } })] };
      },
    });

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
    });

    expect(attempts).toBe(2);
    expect(job.status).toBe("completed");
    expect(report.createdItems).toBe(1);
  });

  it("stops processing once the job is cancelled mid-run", async () => {
    const source = makeSource(
      playlist([
        track({ id: "s1", title: "Song A" }),
        track({ id: "s2", title: "Song B" }),
        track({ id: "s3", title: "Song C" }),
      ]),
    );
    const destination = makeDestination({ search: async () => ({ items: [] }) });

    class CancelAfterFirstGetStore extends InMemoryTransferJobStore {
      private getCount = 0;
      override async get(id: string) {
        this.getCount += 1;
        if (this.getCount > 1) {
          await this.update(id, { status: "cancelled" });
        }
        return super.get(id);
      }
    }

    const { job, report } = await runTransfer({
      source,
      sourceSession,
      destination,
      destinationSession,
      sourcePlaylistId: "playlist-1",
      jobStore: new CancelAfterFirstGetStore(),
    });

    expect(job.status).toBe("cancelled");
    expect(report.totalItems).toBe(3);
    expect(report.matchedItems).toBe(0);
    expect(report.skippedItems).toBe(1);
  });

  describe("dry run execution mode (ADR-0011)", () => {
    it("completes against a read-only destination with no search capability at all", async () => {
      const songA = track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } });
      const songB = track({ id: "s2", title: "Song B", externalIds: { isrc: "ISRC-B" } });
      const source = makeSource(playlist([songA, songB]));
      const destination = makeReadOnlyDestination();

      const { job, report } = await runTransfer({
        source,
        sourceSession,
        destination,
        destinationSession,
        sourcePlaylistId: "playlist-1",
        options: { dryRun: true },
      });

      expect(job.status).toBe("partial");
      expect(job.dryRun).toBe(true);
      expect(report.totalItems).toBe(2);
      expect(report.matchedItems).toBe(0);
      expect(report.skippedItems).toBe(2);
      expect(report.unavailableItems).toHaveLength(2);
      expect(report.providerLimitationsEncountered).toEqual([
        "Destination provider cannot search tracks — dry run produced a plan without destination matches.",
      ]);
    });

    it("never calls destination write methods, even when the destination has them", async () => {
      const songA = track({ id: "s1", title: "Song A", externalIds: { isrc: "ISRC-A" } });
      const source = makeSource(playlist([songA]));
      const destination = makeDestination({
        search: async () => ({
          items: [track({ id: "d1", title: "Song A", externalIds: { isrc: "ISRC-A" } })],
        }),
      });

      const { report } = await runDryRunTransfer({
        source,
        sourceSession,
        destination,
        destinationSession,
        sourcePlaylistId: "playlist-1",
      });

      expect(report.matchedItems).toBe(1);
      expect(destination.createdPlaylists).toHaveLength(0);
      expect(destination.addedTracks).toHaveLength(0);
    });

    it("still fails when the source itself can't be read, same as a live transfer", async () => {
      const unreadableSource: MusicProvider = {
        manifest: {
          name: "unreadable-source",
          displayName: "Unreadable Source",
          version: "0.0.0",
          authenticationMethods: ["none"],
          supportedCapabilities: new Set([]),
        },
        getCapabilities: () => ({ supports: new Set([]) }),
        authenticate: async () => ({ method: "none", raw: {} }),
        refreshAuthentication: async (session) => session,
        revokeAuthentication: async () => {},
      };
      const destination = makeReadOnlyDestination();

      const { job, report } = await runDryRunTransfer({
        source: unreadableSource,
        sourceSession,
        destination,
        destinationSession,
        sourcePlaylistId: "playlist-1",
      });

      expect(job.status).toBe("failed");
      expect(report.providerLimitationsEncountered).toEqual([
        "Source provider cannot read playlists.",
      ]);
    });
  });
});

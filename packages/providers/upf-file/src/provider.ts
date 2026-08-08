import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  AuthSession,
  CreatePlaylistInput,
  MusicProvider,
  Page,
  ProviderCapabilities,
} from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import type { Playlist, Track, UpfDocument } from "@ekusupo/upf";
import { UPF_FORMAT_NAME, UPF_FORMAT_VERSION } from "@ekusupo/upf";

import { upfFileManifest } from "./manifest.js";

export interface UpfFileProviderConfig {
  /** Absolute or relative path to a single UPF JSON file (a small multi-playlist library). */
  filePath: string;
}

function newPlaylistId(): string {
  return `upf-file-playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDocument(): UpfDocument {
  return {
    format: UPF_FORMAT_NAME,
    version: UPF_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    playlists: [],
  };
}

async function readDocument(filePath: string): Promise<UpfDocument> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDocument();
    throw new ConnectorError("unknown_error", `Could not read ${filePath}.`, { cause: error });
  }

  try {
    return JSON.parse(raw) as UpfDocument;
  } catch (error) {
    throw new ConnectorError("validation_error", `${filePath} is not valid JSON.`, {
      cause: error,
    });
  }
}

async function writeDocument(filePath: string, document: UpfDocument): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(document, null, 2), "utf-8");
}

function findPlaylist(document: UpfDocument, playlistId: string, filePath: string): Playlist {
  const playlist = document.playlists.find((candidate) => candidate.id === playlistId);
  if (!playlist) {
    throw new ConnectorError("not_found", `No playlist "${playlistId}" in ${filePath}.`);
  }
  return playlist;
}

/**
 * Reads and writes a single UPF JSON file as a small multi-playlist
 * library — no live network calls, no external credentials, matching
 * CLAUDE.md §6.2's "export format connector" / "backup connector"
 * category. Source and destination behavior use exactly the shapes
 * `packages/upf` already defines; there's no provider-specific
 * normalization step because the file already speaks UPF.
 */
export function createUpfFileProvider(config: UpfFileProviderConfig): MusicProvider {
  const { filePath } = config;

  return {
    manifest: upfFileManifest,

    getCapabilities(): ProviderCapabilities {
      return { supports: upfFileManifest.supportedCapabilities };
    },

    async authenticate(): Promise<AuthSession> {
      return { method: "none", raw: {} };
    },
    async refreshAuthentication(session: AuthSession): Promise<AuthSession> {
      return session;
    },
    async revokeAuthentication(): Promise<void> {},

    async listPlaylists(): Promise<Page<Playlist>> {
      const document = await readDocument(filePath);
      return { items: document.playlists };
    },

    async getPlaylist(_session: AuthSession, playlistId: string): Promise<Playlist> {
      const document = await readDocument(filePath);
      return findPlaylist(document, playlistId, filePath);
    },

    async createPlaylist(_session: AuthSession, input: CreatePlaylistInput): Promise<Playlist> {
      const document = await readDocument(filePath);
      const playlist: Playlist = {
        id: newPlaylistId(),
        title: input.title,
        description: input.description,
        items: (input.tracks ?? []).map((track) => ({ track })),
        privacy: input.privacy,
        createdAt: new Date().toISOString(),
      };
      document.playlists.push(playlist);
      await writeDocument(filePath, document);
      return playlist;
    },

    async addTracksToPlaylist(
      _session: AuthSession,
      playlistId: string,
      tracks: Track[],
    ): Promise<Playlist> {
      const document = await readDocument(filePath);
      const playlist = findPlaylist(document, playlistId, filePath);
      playlist.items.push(...tracks.map((track) => ({ track })));
      playlist.updatedAt = new Date().toISOString();
      await writeDocument(filePath, document);
      return playlist;
    },
  };
}

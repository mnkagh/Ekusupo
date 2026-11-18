import { randomUUID } from 'node:crypto';
import { db } from './database';

export interface TrackRow {
  id: string;
  provider: string;
  provider_track_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_ms: number;
  artwork_url: string | null;
  media_url: string | null;
  source: string;
  metadata_json: string | null;
}

export function upsertTrack(track: {
  id?: string;
  provider: string;
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  artworkUrl?: string;
  mediaUrl?: string;
  source: 'demo' | 'live' | 'imported';
  metadata?: Record<string, unknown>;
}) {
  const id = track.id ?? `${track.provider}:${track.providerTrackId}`;
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO tracks (id, provider, provider_track_id, title, artist, album, duration_ms, artwork_url, media_url, source, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_track_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration_ms = excluded.duration_ms,
      artwork_url = excluded.artwork_url,
      media_url = excluded.media_url,
      source = excluded.source,
      metadata_json = excluded.metadata_json
  `,
  ).run(
    id,
    track.provider,
    track.providerTrackId,
    track.title,
    track.artist,
    track.album ?? null,
    track.durationMs,
    track.artworkUrl ?? null,
    track.mediaUrl ?? null,
    track.source,
    track.metadata ? JSON.stringify(track.metadata) : null,
    now,
  );
  return id;
}

export function getTrack(id: string): TrackRow | undefined {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
}

export function listDemoTracks(): TrackRow[] {
  return db
    .prepare("SELECT * FROM tracks WHERE source = 'demo' ORDER BY created_at ASC")
    .all() as TrackRow[];
}

export function listTracksByProvider(provider: string): TrackRow[] {
  return db.prepare('SELECT * FROM tracks WHERE provider = ?').all(provider) as TrackRow[];
}

export function toTrackDto(row: TrackRow) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? undefined,
    durationMs: row.duration_ms,
    artworkUrl: row.artwork_url ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaType:
      row.provider === 'youtube-music' || /\.(mp4|webm)(\?|$)/i.test(row.media_url ?? '')
        ? 'video'
        : 'audio',
    provider: row.provider,
    source: row.source as 'demo' | 'live' | 'imported',
  };
}

export function addLibraryItem(userId: string, trackId: string) {
  db.prepare(
    'INSERT OR IGNORE INTO library_items (id, user_id, track_id, added_at) VALUES (?, ?, ?, ?)',
  ).run(randomUUID(), userId, trackId, new Date().toISOString());
}

export function listLibrary(userId: string | null): TrackRow[] {
  if (!userId) return listDemoTracks();
  const rows = db
    .prepare(
      `
    SELECT t.* FROM tracks t
    JOIN library_items li ON li.track_id = t.id
    WHERE li.user_id = ?
    ORDER BY li.added_at DESC
  `,
    )
    .all(userId) as TrackRow[];
  if (rows.length === 0) return listDemoTracks();
  return rows;
}

export function listPlaylists(userId: string) {
  return db
    .prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as Array<{
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export function listDemoPlaylists() {
  const user = db.prepare("SELECT id FROM users WHERE email = 'demo@ekusupo.local'").get() as
    { id: string } | undefined;
  if (!user) return [];
  return listPlaylists(user.id);
}

export function listPlaylistTracks(playlistId: string): TrackRow[] {
  return db
    .prepare(
      `
    SELECT t.* FROM tracks t
    JOIN playlist_items pi ON pi.track_id = t.id
    WHERE pi.playlist_id = ?
    ORDER BY pi.position ASC
  `,
    )
    .all(playlistId) as TrackRow[];
}

export function createPlaylist(userId: string, name: string) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO playlists (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, null, now, now);
  return id;
}

export function addPlaylistTrack(playlistId: string, trackId: string) {
  const count = db
    .prepare('SELECT COUNT(*) as count FROM playlist_items WHERE playlist_id = ?')
    .get(playlistId) as { count: number };
  db.prepare(
    'INSERT OR IGNORE INTO playlist_items (id, playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), playlistId, trackId, count.count, new Date().toISOString());
}

export function recordHistory(userId: string, trackId: string) {
  db.prepare(
    'INSERT INTO listening_history (id, user_id, track_id, played_at) VALUES (?, ?, ?, ?)',
  ).run(randomUUID(), userId, trackId, new Date().toISOString());
}

export function listHistory(userId: string) {
  return db
    .prepare(
      `
    SELECT lh.id, lh.played_at, t.* FROM listening_history lh
    JOIN tracks t ON t.id = lh.track_id
    WHERE lh.user_id = ?
    ORDER BY lh.played_at DESC
    LIMIT 100
  `,
    )
    .all(userId) as Array<TrackRow & { id: string; played_at: string }>;
}

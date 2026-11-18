import { randomUUID } from 'node:crypto';
import { db } from './database';

const demoTracks = [
  {
    id: 'demo-track-1',
    provider: 'demo',
    providerTrackId: 'demo-1',
    title: 'Clair de Lune',
    artist: 'Claude Debussy',
    album: 'Suite bergamasque',
    durationMs: 312000,
    artworkUrl: 'https://archive.org/services/img/clair-de-lune_202408',
    mediaUrl: 'https://archive.org/download/clair-de-lune_202408/clair%20de%20lune.mp3',
    source: 'demo',
  },
  {
    id: 'demo-track-2',
    provider: 'demo',
    providerTrackId: 'demo-2',
    title: 'Moonlight Sonata (Adagio sostenuto)',
    artist: 'Ludwig van Beethoven',
    album: 'Piano Sonata No. 14',
    durationMs: 330000,
    artworkUrl: 'https://archive.org/services/img/205-presto',
    mediaUrl: 'https://archive.org/download/205-presto/103%20Adagio%20sostenuto.mp3',
    source: 'demo',
  },
  {
    id: 'demo-track-3',
    provider: 'demo',
    providerTrackId: 'demo-3',
    title: 'Dvorak: Symphony No. 9 (From the New World)',
    artist: 'Antonin Dvorak',
    album: 'Symphony No. 9',
    durationMs: 690000,
    artworkUrl: 'https://archive.org/services/img/new-world-1st-mvmt-kubelik-chicago',
    mediaUrl:
      'https://archive.org/download/new-world-1st-mvmt-kubelik-chicago/New%20World%201st%20mvmt%20(kubelik-chicago).mp3',
    source: 'demo',
  },
];

export function seedDatabase() {
  const now = new Date().toISOString();
  const insertTrack = db.prepare(`
    INSERT OR IGNORE INTO tracks (id, provider, provider_track_id, title, artist, album, duration_ms, artwork_url, media_url, source, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const track of demoTracks) {
    insertTrack.run(
      track.id,
      track.provider,
      track.providerTrackId,
      track.title,
      track.artist,
      track.album,
      track.durationMs,
      track.artworkUrl,
      track.mediaUrl,
      track.source,
      JSON.stringify({ demo: true, license: 'public-domain-archive' }),
      now,
    );
    db.prepare(
      `UPDATE tracks SET title = ?, artist = ?, album = ?, duration_ms = ?, artwork_url = ?, media_url = ?, metadata_json = ? WHERE id = ?`,
    ).run(
      track.title,
      track.artist,
      track.album,
      track.durationMs,
      track.artworkUrl,
      track.mediaUrl,
      JSON.stringify({ demo: true, license: 'public-domain-archive' }),
      track.id,
    );
  }

  const systemUser = db.prepare("SELECT id FROM users WHERE email = 'demo@ekusupo.local'").get() as
    { id: string } | undefined;
  let systemUserId = systemUser?.id;
  if (!systemUserId) {
    systemUserId = randomUUID();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(systemUserId, 'demo@ekusupo.local', 'not-a-login-account', now, now);
  }

  const playlistExists = db
    .prepare('SELECT id FROM playlists WHERE user_id = ? AND name = ?')
    .get(systemUserId, 'Demo: Evening Listening');
  if (!playlistExists) {
    const playlistId = randomUUID();
    db.prepare(
      'INSERT INTO playlists (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      playlistId,
      systemUserId,
      'Demo: Evening Listening',
      'Clearly marked demo playlist using public-domain sample media.',
      now,
      now,
    );
    demoTracks.forEach((track, index) => {
      db.prepare(
        'INSERT OR IGNORE INTO playlist_items (id, playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?, ?)',
      ).run(randomUUID(), playlistId, track.id, index, now);
    });
  }

  const libraryExists = db
    .prepare('SELECT id FROM library_items WHERE user_id = ?')
    .get(systemUserId);
  if (!libraryExists) {
    for (const track of demoTracks) {
      db.prepare(
        'INSERT OR IGNORE INTO library_items (id, user_id, track_id, added_at) VALUES (?, ?, ?, ?)',
      ).run(randomUUID(), systemUserId, track.id, now);
    }
  }
}

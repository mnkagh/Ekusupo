import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import { getSessionFromRequest } from '../auth/routes';
import {
  listPlaylistTracks,
  listDemoTracks,
  listTracksByProvider,
  upsertTrack,
  createPlaylist,
  addPlaylistTrack,
} from '../db/tracks';

const transferSchema = z.object({
  sourceProvider: z.string(),
  destinationProvider: z.string(),
  playlistId: z.string().optional(),
});

function normalize(value: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function registerTransferRoutes(app: FastifyInstance) {
  app.post('/transfers/preview', async (request, reply) => {
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sourceProvider, destinationProvider, playlistId } = parsed.data;
    const sourceTracks = playlistId
      ? listPlaylistTracks(playlistId)
      : sourceProvider === 'demo'
        ? listDemoTracks()
        : listTracksByProvider(sourceProvider);

    const destinationTracks = listTracksByProvider(destinationProvider);

    const items = sourceTracks.map((sourceTrack) => {
      const destinationTrack = destinationTracks.find((candidate) => {
        if (
          sourceTrack.provider_track_id &&
          candidate.provider_track_id === sourceTrack.provider_track_id
        )
          return true;
        const sameTitle = normalize(sourceTrack.title) === normalize(candidate.title);
        const sameArtist = normalize(sourceTrack.artist) === normalize(candidate.artist);
        const sameDuration =
          sourceTrack.duration_ms === 0 ||
          candidate.duration_ms === 0 ||
          Math.abs(sourceTrack.duration_ms - candidate.duration_ms) <= 2000;
        return sameTitle && sameArtist && sameDuration;
      });

      return {
        sourceTrackId: sourceTrack.id,
        destinationTrackId: destinationTrack?.id,
        status: destinationTrack ? ('matched' as const) : ('unmatched' as const),
      };
    });

    const report = {
      id: randomUUID(),
      sourceProvider,
      destinationProvider,
      matched: items.filter((item) => item.status === 'matched').length,
      unmatched: items.filter((item) => item.status === 'unmatched').length,
      dryRun: true as const,
      items,
    };

    db.prepare(
      'INSERT INTO transfer_jobs (id, user_id, source_provider, destination_provider, status, report_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      report.id,
      null,
      sourceProvider,
      destinationProvider,
      'preview',
      JSON.stringify(report),
      new Date().toISOString(),
      new Date().toISOString(),
    );

    return report;
  });

  app.post('/transfers/import', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = z
      .object({
        document: z.object({
          format: z.literal('UPF'),
          version: z.string(),
          playlist: z.object({ name: z.string(), trackIds: z.array(z.string()) }),
          tracks: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              artist: z.string(),
              album: z.string().optional(),
              durationMs: z.number(),
              artworkUrl: z.string().optional(),
              mediaUrl: z.string().optional(),
              provider: z.string(),
              source: z.enum(['demo', 'live', 'imported']),
            }),
          ),
        }),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { document } = parsed.data;
    const trackIds = [];
    for (const track of document.tracks) {
      const id = upsertTrack({
        id: track.id,
        provider: track.provider,
        providerTrackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl,
        mediaUrl: track.mediaUrl,
        source: 'imported',
      });
      trackIds.push(id);
    }

    const playlistId = createPlaylist(user.id, document.playlist.name);
    for (const trackId of document.playlist.trackIds) {
      addPlaylistTrack(playlistId, trackId);
    }

    return { playlistId, name: document.playlist.name, trackIds };
  });

  app.post('/transfers/execute', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = z
      .object({
        sourceProvider: z.string(),
        destinationProvider: z.string(),
        playlistId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { sourceProvider, destinationProvider, playlistId } = parsed.data;
    if (destinationProvider !== 'demo') {
      return reply.code(501).send({
        error:
          'Live transfer is only implemented for the demo provider. Other providers require provider write APIs and credentials.',
      });
    }

    const sourceTracks = playlistId
      ? listPlaylistTracks(playlistId)
      : sourceProvider === 'demo'
        ? listDemoTracks()
        : listTracksByProvider(sourceProvider);

    const destinationPlaylistId = createPlaylist(
      user.id,
      `Transferred: ${sourceProvider} to ${destinationProvider}`,
    );
    for (const track of sourceTracks) {
      addPlaylistTrack(destinationPlaylistId, track.id);
    }

    return {
      id: randomUUID(),
      sourceProvider,
      destinationProvider,
      destinationPlaylistId,
      matched: sourceTracks.length,
      unmatched: 0,
      live: true,
    };
  });
}

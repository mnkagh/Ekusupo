import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import { listPlaylistTracks, listDemoTracks, listTracksByProvider } from '../db/tracks';

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
}

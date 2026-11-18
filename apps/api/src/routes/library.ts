import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSessionFromRequest } from '../auth/routes';
import { listLibrary, addLibraryItem, toTrackDto, getTrack } from '../db/tracks';

export function registerLibraryRoutes(app: FastifyInstance) {
  app.get('/library', async (request) => {
    const user = getSessionFromRequest(request);
    const tracks = listLibrary(user?.id ?? null);
    return { tracks: tracks.map(toTrackDto), demo: !user };
  });

  app.post('/library', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = z.object({ trackId: z.string() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const track = getTrack(parsed.data.trackId);
    if (!track) return reply.code(404).send({ error: 'Track not found' });

    addLibraryItem(user.id, parsed.data.trackId);
    return { ok: true };
  });
}

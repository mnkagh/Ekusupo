import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSessionFromRequest } from '../auth/routes';
import { recordHistory, listHistory, toTrackDto } from '../db/tracks';

export function registerHistoryRoutes(app: FastifyInstance) {
  app.get('/history', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });
    const rows = listHistory(user.id);
    return rows.map((row) => ({
      id: row.id,
      track: toTrackDto(row),
      playedAt: row.played_at,
    }));
  });

  app.post('/history', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = z.object({ trackId: z.string() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    recordHistory(user.id, parsed.data.trackId);
    return { ok: true };
  });
}

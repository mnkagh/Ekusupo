import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const querySchema = z.object({
  artist: z.string().min(1),
  title: z.string().min(1),
  duration: z.coerce.number().optional(),
});

function parseLrc(lrc: string) {
  const lines = [];
  for (const rawLine of lrc.split('\n')) {
    const match = rawLine.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)$/);
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: minutes * 60 + seconds + fraction, text });
  }
  return lines;
}

export function registerLyricsRoutes(app: FastifyInstance) {
  app.get('/lyrics', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { artist, title, duration } = parsed.data;
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    if (duration) params.set('duration', String(Math.round(duration)));

    try {
      const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
      if (!response.ok) return reply.code(404).send({ error: 'Lyrics not available' });
      const data = (await response.json()) as { syncedLyrics?: string; plainLyrics?: string };
      const lines = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
      if (!lines.length && !data.plainLyrics)
        return reply.code(404).send({ error: 'Lyrics not available' });
      return { lines, plain: data.plainLyrics };
    } catch {
      return reply.code(502).send({ error: 'Lyrics service unavailable' });
    }
  });
}

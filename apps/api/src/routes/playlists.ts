import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSessionFromRequest } from '../auth/routes';
import {
  listPlaylists,
  listDemoPlaylists,
  createPlaylist,
  addPlaylistTrack,
  listPlaylistTracks,
  getTrack,
} from '../db/tracks';

export function registerPlaylistRoutes(app: FastifyInstance) {
  app.get('/playlists', async (request) => {
    const user = getSessionFromRequest(request);
    const playlists = user ? listPlaylists(user.id) : listDemoPlaylists();
    return playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      trackIds: listPlaylistTracks(playlist.id).map((track) => track.id),
    }));
  });

  app.post('/playlists', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const parsed = z.object({ name: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const id = createPlaylist(user.id, parsed.data.name);
    return { id, name: parsed.data.name, trackIds: [] };
  });

  app.post('/playlists/:id/tracks', async (request, reply) => {
    const user = getSessionFromRequest(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });

    const { id } = request.params as { id: string };
    const parsed = z.object({ trackId: z.string() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const playlist = listPlaylists(user.id).find((item) => item.id === id);
    if (!playlist) return reply.code(404).send({ error: 'Playlist not found' });

    const track = getTrack(parsed.data.trackId);
    if (!track) return reply.code(404).send({ error: 'Track not found' });

    addPlaylistTrack(id, parsed.data.trackId);
    return { ok: true };
  });
}

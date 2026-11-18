import type { FastifyInstance } from 'fastify';
import { getSessionFromRequest } from '../auth/routes';
import { listPlaylists, listDemoPlaylists, listPlaylistTracks, toTrackDto } from '../db/tracks';

export function registerExportRoutes(app: FastifyInstance) {
  app.get('/export/playlists/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = getSessionFromRequest(request);
    const playlists = user ? listPlaylists(user.id) : listDemoPlaylists();
    const playlist = playlists.find((item) => item.id === id);
    if (!playlist) return reply.code(404).send({ error: 'Playlist not found' });

    const tracks = listPlaylistTracks(id);
    return {
      format: 'UPF',
      version: '0.1.0',
      playlist: {
        name: playlist.name,
        trackIds: tracks.map((track) => track.id),
      },
      tracks: tracks.map(toTrackDto),
    };
  });
}

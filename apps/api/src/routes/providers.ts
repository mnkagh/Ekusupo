import type { FastifyInstance } from 'fastify';

const hasEnv = (name: string) => Boolean(process.env[name]?.trim());

export const providers = [
  {
    id: 'demo',
    name: 'Ekusupo Demo',
    description: 'Clearly marked development/demo data using public-domain sample media.',
    capabilities: ['search', 'playback', 'library', 'playlists'],
    configured: true,
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    description:
      'Official YouTube platform integration. Search and playback require server-side API configuration.',
    capabilities: ['search', 'video', 'playback'],
    configured: hasEnv('YOUTUBE_API_KEY'),
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description:
      'Spotify Web API and Web Playback SDK. Full playback requires a Premium account and configured credentials.',
    capabilities: ['search', 'library', 'playlists'],
    configured: hasEnv('SPOTIFY_CLIENT_ID') && hasEnv('SPOTIFY_CLIENT_SECRET'),
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    description: 'SoundCloud API integration for supported tracks.',
    capabilities: ['search', 'playback'],
    configured: hasEnv('SOUNDCLOUD_CLIENT_ID'),
  },
  {
    id: 'internet-archive',
    name: 'Internet Archive',
    description: 'Public catalog search and media playback through Archive.org.',
    capabilities: ['search', 'audio', 'video', 'playback'],
    configured: true,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    description: 'Public catalog search and 30-second preview playback.',
    capabilities: ['search', 'preview'],
    configured: true,
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    description: 'Planned connector.',
    capabilities: [],
    configured: false,
    comingSoon: true,
  },
  {
    id: 'tidal',
    name: 'TIDAL',
    description: 'Planned connector.',
    capabilities: [],
    configured: false,
    comingSoon: true,
  },
  {
    id: 'amazon-music',
    name: 'Amazon Music',
    description: 'Planned connector.',
    capabilities: [],
    configured: false,
    comingSoon: true,
  },
];

export function registerProviderRoutes(app: FastifyInstance) {
  app.get('/providers', async () =>
    providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.comingSoon
        ? 'coming_soon'
        : provider.configured
          ? provider.id === 'demo'
            ? 'connected'
            : 'available'
          : 'requires_configuration',
      capabilities: provider.capabilities,
      description: provider.description,
    })),
  );
}

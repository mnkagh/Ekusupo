/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { upsertTrack, toTrackDto, getTrack } from '../db/tracks';
import { listDemoTracks } from '../db/tracks';

const querySchema = z.object({
  q: z.string().min(1),
  provider: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(8).default(5),
  offset: z.coerce.number().int().min(0).default(0),
});

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function internetArchiveResults(query: string, limit: number, offset: number) {
  const data = await fetchJson(
    `https://archive.org/advancedsearch.php?q=mediatype:(audio OR movies) AND (${encodeURIComponent(query)})&fl[]=identifier,title,creator&rows=${limit}&start=${offset}&output=json`,
  );
  const docs = data?.response?.docs ?? [];
  const settled = await Promise.allSettled(
    docs.map(async (doc: { identifier: string; title?: string; creator?: string }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      try {
        const metadata = await fetchJson(
          `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}/files`,
          {
            signal: controller.signal,
          },
        );
        const file = (metadata?.result ?? []).find((item: { name?: string }) =>
          /\.(mp3|ogg|wav|m4a|mp4|webm)$/i.test(item.name ?? ''),
        );
        if (!file) return null;
        const id = upsertTrack({
          provider: 'internet-archive',
          providerTrackId: doc.identifier,
          title: doc.title || doc.identifier,
          artist: doc.creator || 'Internet Archive',
          durationMs: 0,
          artworkUrl: `https://archive.org/services/img/${doc.identifier}`,
          mediaUrl: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(file.name)}`,
          source: 'live',
          metadata: { archiveIdentifier: doc.identifier, fileName: file.name },
        });
        return toTrackDto(getTrack(id)!);
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  return settled
    .filter(
      (result): result is PromiseFulfilledResult<ReturnType<typeof toTrackDto> | null> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value)
    .filter((result): result is ReturnType<typeof toTrackDto> => Boolean(result));
}

async function deezerResults(query: string, limit: number, offset: number) {
  const data = await fetchJson(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`,
  );
  return (data?.data ?? []).map((item: any) => {
    const id = upsertTrack({
      provider: 'deezer',
      providerTrackId: String(item.id),
      title: item.title,
      artist: item.artist?.name ?? 'Unknown artist',
      album: item.album?.title,
      durationMs: (item.duration ?? 0) * 1000,
      artworkUrl: item.album?.cover_medium,
      mediaUrl: item.preview,
      source: 'live',
      metadata: { deezerId: item.id },
    });
    return toTrackDto(getTrack(id)!);
  });
}

async function youtubeResults(query: string, limit: number) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${key}`,
  );
  return (data?.items ?? []).map((item: any) => {
    const id = upsertTrack({
      provider: 'youtube-music',
      providerTrackId: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      durationMs: 0,
      artworkUrl: item.snippet.thumbnails?.medium?.url,
      mediaUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
      source: 'live',
      metadata: { youtubeVideoId: item.id.videoId },
    });
    return toTrackDto(getTrack(id)!);
  });
}

async function soundCloudResults(query: string, limit: number, offset: number) {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return [];
  const data = await fetchJson(
    `https://api.soundcloud.com/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}&offset=${offset}`,
  );
  return (Array.isArray(data) ? data : []).map((item: any) => {
    const id = upsertTrack({
      provider: 'soundcloud',
      providerTrackId: String(item.id),
      title: item.title,
      artist: item.user?.username ?? 'Unknown artist',
      durationMs: item.duration ?? 0,
      artworkUrl: item.artwork_url?.replace('-large', '-t500x500'),
      mediaUrl: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=${clientId}`,
      source: 'live',
      metadata: { soundCloudId: item.id },
    });
    return toTrackDto(getTrack(id)!);
  });
}

async function spotifyResults(query: string, limit: number, offset: number) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenResponse.ok) return [];
  const tokenData = await tokenResponse.json();
  const data = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`,
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    } as any,
  );
  return (data?.tracks?.items ?? []).map((item: any) => {
    const id = upsertTrack({
      provider: 'spotify',
      providerTrackId: item.id,
      title: item.name,
      artist: item.artists?.map((artist: any) => artist.name).join(', ') ?? 'Unknown artist',
      album: item.album?.name,
      durationMs: item.duration_ms,
      artworkUrl: item.album?.images?.[1]?.url,
      mediaUrl: undefined,
      source: 'live',
      metadata: { spotifyId: item.id, spotifyUrl: item.external_urls?.spotify },
    });
    return toTrackDto(getTrack(id)!);
  });
}

export function registerSearchRoutes(app: FastifyInstance) {
  app.get('/search', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { q, provider = 'all', limit, offset } = parsed.data;
    const demoResults =
      offset === 0
        ? listDemoTracks()
            .filter((track) =>
              `${track.title} ${track.artist} ${track.album ?? ''}`
                .toLowerCase()
                .includes(q.toLowerCase()),
            )
            .map(toTrackDto)
        : [];

    const providerNames =
      provider === 'all'
        ? ['internet-archive', 'deezer', 'youtube-music', 'soundcloud', 'spotify']
        : [provider];

    const liveResults = (
      await Promise.all(
        providerNames.map(async (name) => {
          try {
            if (name === 'internet-archive') return await internetArchiveResults(q, limit, offset);
            if (name === 'deezer') return await deezerResults(q, limit, offset);
            if (name === 'youtube-music') return offset === 0 ? await youtubeResults(q, limit) : [];
            if (name === 'soundcloud') return await soundCloudResults(q, limit, offset);
            if (name === 'spotify') return await spotifyResults(q, limit, offset);
            return [];
          } catch {
            return [];
          }
        }),
      )
    ).flat();

    const results = provider === 'demo' ? demoResults : [...demoResults, ...liveResults];
    return {
      query: q,
      provider,
      results,
      demo: provider === 'demo' || results.every((item) => item.source === 'demo'),
      nextOffset: liveResults.length >= limit ? offset + limit : null,
    };
  });
}

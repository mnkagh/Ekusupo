/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { upsertTrack, toTrackDto, getTrack } from '../db/tracks';
import { listDemoTracks } from '../db/tracks';

const querySchema = z.object({
  q: z.string().min(1),
  provider: z.string().optional(),
});

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function internetArchiveResults(query: string) {
  const data = await fetchJson(
    `https://archive.org/advancedsearch.php?q=mediatype:(audio OR movies) AND (${encodeURIComponent(query)})&fl[]=identifier,title,creator&rows=4&output=json`,
  );
  const docs = data?.response?.docs ?? [];
  const results = [];
  for (const doc of docs) {
    try {
      const metadata = await fetchJson(
        `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}/files`,
      );
      const file = (metadata?.result ?? []).find((item: { name?: string }) =>
        /\.(mp3|ogg|wav|m4a|mp4|webm)$/i.test(item.name ?? ''),
      );
      if (!file) continue;
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
      const row = getTrack(id)!;
      results.push(toTrackDto(row));
    } catch {
      // Skip items whose metadata cannot be resolved.
    }
  }
  return results;
}

async function deezerResults(query: string) {
  const data = await fetchJson(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`,
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

async function youtubeResults(query: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=8&key=${key}`,
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

async function soundCloudResults(query: string) {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return [];
  const data = await fetchJson(
    `https://api.soundcloud.com/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`,
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

async function spotifyResults(query: string) {
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
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`,
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

    const { q, provider = 'all' } = parsed.data;
    const demoResults = listDemoTracks()
      .filter((track) =>
        `${track.title} ${track.artist} ${track.album ?? ''}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
      .map(toTrackDto);

    const providersToSearch =
      provider === 'all'
        ? ['internet-archive', 'deezer', 'youtube-music', 'soundcloud', 'spotify']
        : [provider];

    const liveResults = (
      await Promise.all(
        providersToSearch.map(async (name) => {
          try {
            if (name === 'internet-archive') return await internetArchiveResults(q);
            if (name === 'deezer') return await deezerResults(q);
            if (name === 'youtube-music') return await youtubeResults(q);
            if (name === 'soundcloud') return await soundCloudResults(q);
            if (name === 'spotify') return await spotifyResults(q);
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
    };
  });
}

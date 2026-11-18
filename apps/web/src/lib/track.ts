import type { Track } from '../features/playback/types';
import type { TrackDto } from '../lib/api';

export function toTrack(track: TrackDto): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl,
    mediaUrl: track.mediaUrl,
    provider: track.provider,
    source: track.source,
  };
}

/**
 * YouTube Data API v3 shapes, narrowed to the fields this connector
 * reads. Not exported from the package index (ADR-0004).
 */

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

export interface YouTubePlaylistItemSnippet {
  title: string;
  description?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  publishedAt?: string;
  thumbnails?: YouTubeThumbnails;
  resourceId?: { kind: string; videoId: string };
  position?: number;
}

export interface YouTubePlaylistItem {
  id: string;
  snippet?: YouTubePlaylistItemSnippet;
}

export interface YouTubePlaylistSnippet {
  title: string;
  description?: string;
  channelTitle?: string;
  thumbnails?: YouTubeThumbnails;
}

export interface YouTubePlaylist {
  id: string;
  snippet?: YouTubePlaylistSnippet;
  status?: { privacyStatus?: "public" | "private" | "unlisted" };
}

export interface YouTubeSearchItem {
  id?: { kind: string; videoId?: string };
  snippet?: YouTubePlaylistItemSnippet;
}

export interface YouTubeListResponse<T> {
  items?: T[];
  nextPageToken?: string;
}

export interface YouTubeChannel {
  id: string;
  snippet?: { title?: string; customUrl?: string };
}

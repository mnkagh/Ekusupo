/**
 * Cursor-based and opaque — works regardless of whether the underlying
 * provider API is offset-, page-, or cursor-based; that translation is
 * the connector's job.
 */
export interface PageRequest {
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

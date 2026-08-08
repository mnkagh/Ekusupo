export interface Session {
  id: string;
  userId: string;
  /** ISO 8601. */
  createdAt: string;
  expiresAt: string;
}

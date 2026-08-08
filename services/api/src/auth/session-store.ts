import type { Session } from "./session.js";

/**
 * Pure CRUD, same as `UserStore` and `packages/core`'s `TransferJobStore`
 * — expiry is the auth service's decision, not the store's, so the store
 * stays a dumb, swappable-for-Postgres-later container. See ADR-0022.
 */
export interface SessionStore {
  create(session: Session): Promise<void>;
  get(id: string): Promise<Session | undefined>;
  delete(id: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

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
  /**
   * Signs out every device. Needed by a password change: whoever knew the
   * old password may still hold a live session, and leaving those
   * standing would make the change decorative.
   */
  deleteForUser(userId: string): Promise<void>;
  /**
   * Drops every session that expired before `now`, returning how many.
   *
   * Expiry is still the auth service's decision — this store does not
   * decide what "expired" means, it is told. What it fixes is that
   * expiry was only ever *enforced* when a session was presented, so a
   * row for a device that never came back stayed forever: an
   * unbounded table, holding data past the point it could be used for
   * anything (CLAUDE.md §21.1).
   */
  deleteExpired(now: Date): Promise<number>;
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

  async deleteForUser(userId: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(id);
    }
  }

  async deleteExpired(now: Date): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (new Date(session.expiresAt).getTime() < now.getTime()) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

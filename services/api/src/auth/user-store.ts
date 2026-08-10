import type { User } from "./user.js";

/**
 * Injectable, same pattern as packages/core's `TransferJobStore` — no
 * live Postgres exists to verify against in this environment (ADR-0017
 * picked it, but connecting to one is a separate, later step). A
 * Postgres-backed implementation is future work once there's real
 * infrastructure to run it against; this interface shouldn't need to
 * change when that happens. See ADR-0022.
 */
export interface UserStore {
  create(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  /**
   * Removes the account itself. Sessions, provider connections and
   * transfers go with it via `ON DELETE CASCADE` in the real store — see
   * `db/schema.ts`. CLAUDE.md §21.2 requires this be possible at all.
   */
  delete(id: string): Promise<void>;
}

export class InMemoryUserStore implements UserStore {
  private readonly byId = new Map<string, User>();
  private readonly byEmail = new Map<string, User>();

  async create(user: User): Promise<void> {
    this.byId.set(user.id, user);
    this.byEmail.set(user.email.toLowerCase(), user);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.byEmail.get(email.toLowerCase());
  }

  async findById(id: string): Promise<User | undefined> {
    return this.byId.get(id);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(id);
    if (!user) return;
    const updated: User = { ...user, passwordHash };
    this.byId.set(id, updated);
    this.byEmail.set(user.email.toLowerCase(), updated);
  }

  async delete(id: string): Promise<void> {
    const user = this.byId.get(id);
    if (!user) return;
    this.byId.delete(id);
    this.byEmail.delete(user.email.toLowerCase());
  }
}

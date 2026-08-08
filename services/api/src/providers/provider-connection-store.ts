import type { ProviderConnection } from "./provider-connection.js";

/**
 * Injectable, same pattern as `UserStore`/`SessionStore` (ADR-0022,
 * ADR-0024). `upsert`, not `create` — reconnecting a provider (e.g. after
 * a token expires) should replace the existing connection, matching the
 * database's own `UNIQUE(user_id, provider)` constraint.
 */
export interface ProviderConnectionStore {
  upsert(connection: ProviderConnection): Promise<void>;
  findByUserAndProvider(userId: string, provider: string): Promise<ProviderConnection | undefined>;
  listByUser(userId: string): Promise<ProviderConnection[]>;
  delete(userId: string, provider: string): Promise<void>;
}

export class InMemoryProviderConnectionStore implements ProviderConnectionStore {
  private readonly connections = new Map<string, ProviderConnection>();

  private key(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  async upsert(connection: ProviderConnection): Promise<void> {
    this.connections.set(this.key(connection.userId, connection.provider), connection);
  }

  async findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<ProviderConnection | undefined> {
    return this.connections.get(this.key(userId, provider));
  }

  async listByUser(userId: string): Promise<ProviderConnection[]> {
    return [...this.connections.values()].filter((connection) => connection.userId === userId);
  }

  async delete(userId: string, provider: string): Promise<void> {
    this.connections.delete(this.key(userId, provider));
  }
}

import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { providerConnectionsTable } from "../db/schema.js";
import type { ProviderConnection } from "./provider-connection.js";
import type { ProviderConnectionStore } from "./provider-connection-store.js";

function toConnection(row: typeof providerConnectionsTable.$inferSelect): ProviderConnection {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    encryptedTokens: row.encryptedTokens,
    connectedAt: row.connectedAt.toISOString(),
  };
}

/** Real implementation of `ProviderConnectionStore` — see ADR-0024/ADR-0025. */
export class PostgresProviderConnectionStore implements ProviderConnectionStore {
  constructor(private readonly db: Database) {}

  async upsert(connection: ProviderConnection): Promise<void> {
    await this.db
      .insert(providerConnectionsTable)
      .values({
        id: connection.id,
        userId: connection.userId,
        provider: connection.provider,
        encryptedTokens: connection.encryptedTokens,
        connectedAt: new Date(connection.connectedAt),
      })
      .onConflictDoUpdate({
        target: [providerConnectionsTable.userId, providerConnectionsTable.provider],
        set: {
          encryptedTokens: connection.encryptedTokens,
          connectedAt: new Date(connection.connectedAt),
        },
      });
  }

  async findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<ProviderConnection | undefined> {
    const [row] = await this.db
      .select()
      .from(providerConnectionsTable)
      .where(
        and(
          eq(providerConnectionsTable.userId, userId),
          eq(providerConnectionsTable.provider, provider),
        ),
      );
    return row ? toConnection(row) : undefined;
  }

  async listByUser(userId: string): Promise<ProviderConnection[]> {
    const rows = await this.db
      .select()
      .from(providerConnectionsTable)
      .where(eq(providerConnectionsTable.userId, userId));
    return rows.map(toConnection);
  }

  async delete(userId: string, provider: string): Promise<void> {
    await this.db
      .delete(providerConnectionsTable)
      .where(
        and(
          eq(providerConnectionsTable.userId, userId),
          eq(providerConnectionsTable.provider, provider),
        ),
      );
  }
}

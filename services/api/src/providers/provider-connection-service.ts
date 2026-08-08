import { randomUUID } from "node:crypto";

import type { AuthSession } from "@ekusupo/connector-sdk";

import type { ProviderConnection } from "./provider-connection.js";
import type { ProviderConnectionStore } from "./provider-connection-store.js";
import { decryptTokens, encryptTokens } from "./token-encryption.js";

export interface ConnectedProviderSummary {
  provider: string;
  connectedAt: string;
}

/**
 * Owns encryption so callers (routes, and later the Transfer Engine
 * wiring) only ever see a real `AuthSession` or a summary with no
 * tokens in it — never the encrypted blob directly. See ADR-0025.
 */
export class ProviderConnectionService {
  constructor(private readonly store: ProviderConnectionStore) {}

  async saveSession(userId: string, provider: string, session: AuthSession): Promise<void> {
    const connection: ProviderConnection = {
      id: randomUUID(),
      userId,
      provider,
      encryptedTokens: encryptTokens(JSON.stringify(session)),
      connectedAt: new Date().toISOString(),
    };
    await this.store.upsert(connection);
  }

  async getSession(userId: string, provider: string): Promise<AuthSession | undefined> {
    const connection = await this.store.findByUserAndProvider(userId, provider);
    if (!connection) return undefined;
    return JSON.parse(decryptTokens(connection.encryptedTokens)) as AuthSession;
  }

  async listConnections(userId: string): Promise<ConnectedProviderSummary[]> {
    const connections = await this.store.listByUser(userId);
    return connections.map((connection) => ({
      provider: connection.provider,
      connectedAt: connection.connectedAt,
    }));
  }

  async disconnect(userId: string, provider: string): Promise<void> {
    await this.store.delete(userId, provider);
  }
}

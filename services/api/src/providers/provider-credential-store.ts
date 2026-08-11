import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { providerCredentialsTable } from "../db/schema.js";
import type { ProviderCredentials } from "./provider-registry.js";
import { decryptTokens, encryptTokens } from "./token-encryption.js";

/**
 * What a user is told about their own stored credentials.
 *
 * Deliberately not the credentials. A client id is not especially
 * secret, but a client secret is, and an endpoint that returns "the
 * settings you saved" is the obvious place for one to leak back out to a
 * browser, into a screenshot, or into a support ticket. The UI only ever
 * needs to know that something is stored and roughly which app it is, so
 * that is all this carries.
 */
export interface StoredCredentialSummary {
  provider: string;
  /** Enough to recognise which app it is; never the secret. */
  clientIdPreview?: string;
  hasSecret: boolean;
  redirectUri?: string;
  updatedAt: string;
}

/** Shows the shape of an id without showing all of it. */
function previewClientId(clientId: string | undefined): string | undefined {
  if (!clientId) return undefined;
  if (clientId.length <= 8) return `${clientId.slice(0, 2)}…`;
  return `${clientId.slice(0, 4)}…${clientId.slice(-4)}`;
}

/**
 * Each user's own provider app credentials, encrypted at rest.
 *
 * Scoped to a user on construction, the same pattern
 * `PostgresTransferJobStore` uses: the user id cannot be forgotten at a
 * call site because there is no call site that takes one.
 */
export class PostgresProviderCredentialStore {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  async get(provider: string): Promise<ProviderCredentials | undefined> {
    const [row] = await this.db
      .select()
      .from(providerCredentialsTable)
      .where(
        and(
          eq(providerCredentialsTable.userId, this.userId),
          eq(providerCredentialsTable.provider, provider),
        ),
      );
    if (!row) return undefined;
    return JSON.parse(decryptTokens(row.encryptedCredentials)) as ProviderCredentials;
  }

  /** Upsert: re-saving replaces, so there is one row per user per provider. */
  async save(provider: string, credentials: ProviderCredentials): Promise<void> {
    const now = new Date();
    const encrypted = encryptTokens(JSON.stringify(credentials));

    await this.db
      .insert(providerCredentialsTable)
      .values({
        id: randomUUID(),
        userId: this.userId,
        provider,
        encryptedCredentials: encrypted,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [providerCredentialsTable.userId, providerCredentialsTable.provider],
        set: { encryptedCredentials: encrypted, updatedAt: now },
      });
  }

  async delete(provider: string): Promise<boolean> {
    const rows = await this.db
      .delete(providerCredentialsTable)
      .where(
        and(
          eq(providerCredentialsTable.userId, this.userId),
          eq(providerCredentialsTable.provider, provider),
        ),
      )
      .returning({ id: providerCredentialsTable.id });
    return rows.length > 0;
  }

  /** Summaries only — see `StoredCredentialSummary`. */
  async list(): Promise<StoredCredentialSummary[]> {
    const rows = await this.db
      .select()
      .from(providerCredentialsTable)
      .where(eq(providerCredentialsTable.userId, this.userId));

    return rows.map((row) => {
      const credentials = JSON.parse(
        decryptTokens(row.encryptedCredentials),
      ) as ProviderCredentials;
      return {
        provider: row.provider,
        clientIdPreview: previewClientId(credentials.clientId),
        hasSecret: Boolean(credentials.clientSecret ?? credentials.developerToken),
        redirectUri: credentials.redirectUri,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}

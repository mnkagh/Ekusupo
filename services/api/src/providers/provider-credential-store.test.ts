import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresUserStore } from "../auth/postgres-user-store.js";
import type { Database } from "../db/client.js";
import { createTestDatabase } from "../db/test-database.js";
import { resolveCredentials } from "./credential-resolver.js";
import { PostgresProviderCredentialStore } from "./provider-credential-store.js";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const SPOTIFY_APP = {
  clientId: "user-own-client-id-abcdef",
  clientSecret: "user-own-secret",
  redirectUri: "http://127.0.0.1:3000/providers/spotify/callback",
};

let db: Database;
let closeDb: () => Promise<void>;
let storeA: PostgresProviderCredentialStore;
let storeB: PostgresProviderCredentialStore;
const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

beforeEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  ({ db, close: closeDb } = await createTestDatabase());

  const users = new PostgresUserStore(db);
  for (const [id, email] of [
    [USER_A, "a@example.com"],
    [USER_B, "b@example.com"],
  ] as const) {
    await users.create({
      id,
      email,
      passwordHash: "salt:hash",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  }

  storeA = new PostgresProviderCredentialStore(db, USER_A);
  storeB = new PostgresProviderCredentialStore(db, USER_B);
});

afterEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
  await closeDb();
});

describe("PostgresProviderCredentialStore", () => {
  it("stores and reads back a user's own app", async () => {
    await storeA.save("spotify", SPOTIFY_APP);
    await expect(storeA.get("spotify")).resolves.toEqual(SPOTIFY_APP);
  });

  it("never stores the secret in plaintext", async () => {
    // The whole point of the column being encrypted. A client secret is
    // exactly as sensitive as an access token (CLAUDE.md §12.1).
    await storeA.save("spotify", SPOTIFY_APP);

    const rows = await db.execute("SELECT encrypted_credentials FROM provider_credentials");
    const stored = JSON.stringify(rows.rows);
    expect(stored).not.toContain("user-own-secret");
    expect(stored).not.toContain("user-own-client-id-abcdef");
  });

  it("keeps one row per user per provider, replacing on re-save", async () => {
    await storeA.save("spotify", SPOTIFY_APP);
    await storeA.save("spotify", { ...SPOTIFY_APP, clientSecret: "rotated" });

    await expect(storeA.get("spotify")).resolves.toMatchObject({ clientSecret: "rotated" });
    expect(await storeA.list()).toHaveLength(1);
  });

  it("does not let one user read another's credentials", async () => {
    await storeA.save("spotify", SPOTIFY_APP);
    await expect(storeB.get("spotify")).resolves.toBeUndefined();
  });

  it("does not let one user delete another's credentials", async () => {
    await storeA.save("spotify", SPOTIFY_APP);

    await expect(storeB.delete("spotify")).resolves.toBe(false);
    await expect(storeA.get("spotify")).resolves.toEqual(SPOTIFY_APP);
  });

  it("summarises without handing the secret back out", async () => {
    await storeA.save("spotify", SPOTIFY_APP);

    const [summary] = await storeA.list();
    expect(summary).toMatchObject({ provider: "spotify", hasSecret: true });
    // The id is previewed so someone can tell which app it is; the
    // secret has no representation here at all.
    expect(summary?.clientIdPreview).toBe("user…cdef");
    expect(JSON.stringify(summary)).not.toContain("user-own-secret");
  });

  it("disposes of credentials with the user that owns them (cascade)", async () => {
    await storeA.save("spotify", SPOTIFY_APP);
    await new PostgresUserStore(db).delete(USER_A);

    await expect(storeA.get("spotify")).resolves.toBeUndefined();
  });
});

describe("resolveCredentials", () => {
  const serverCredentials = {
    spotify: { clientId: "server-id", clientSecret: "server-secret" },
  };

  it("prefers the user's own app over the deployment's", async () => {
    await storeA.save("spotify", SPOTIFY_APP);

    const resolved = await resolveCredentials(USER_A, "spotify", { db, serverCredentials });

    expect(resolved.source).toBe("user");
    expect(resolved.credentials.clientId).toBe(SPOTIFY_APP.clientId);
  });

  it("falls back to the deployment's when the user has none", async () => {
    const resolved = await resolveCredentials(USER_A, "spotify", { db, serverCredentials });

    expect(resolved.source).toBe("server");
    expect(resolved.credentials.clientId).toBe("server-id");
  });

  it("reports none when neither side is configured", async () => {
    const resolved = await resolveCredentials(USER_A, "spotify", {
      db,
      serverCredentials: {},
    });

    expect(resolved.source).toBe("none");
  });

  it("ignores a half-filled user record rather than merging it with the server's", async () => {
    // Merging would pair one app's client id with another app's secret —
    // an authorization that fails in a way nobody could diagnose.
    await storeA.save("spotify", { clientId: "only-an-id" });

    const resolved = await resolveCredentials(USER_A, "spotify", { db, serverCredentials });

    expect(resolved.source).toBe("server");
    expect(resolved.credentials).toEqual(serverCredentials.spotify);
  });

  it("falls back rather than failing when stored credentials cannot be decrypted", async () => {
    // A rotated encryption key must not lock someone out of a provider
    // the deployment can serve perfectly well.
    await storeA.save("spotify", SPOTIFY_APP);
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");

    const resolved = await resolveCredentials(USER_A, "spotify", { db, serverCredentials });

    expect(resolved.source).toBe("server");
  });
});

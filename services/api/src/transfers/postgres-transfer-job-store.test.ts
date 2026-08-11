import type { TransferJob, TransferReport } from "@ekusupo/core";
import { UPF_FORMAT_NAME, UPF_FORMAT_VERSION } from "@ekusupo/upf";
import type { UpfDocument } from "@ekusupo/upf";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "../db/test-database.js";
import type { Database } from "../db/client.js";
import { usersTable } from "../db/schema.js";
import { PostgresTransferJobStore } from "./postgres-transfer-job-store.js";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

function makeJob(overrides: Partial<TransferJob> = {}): TransferJob {
  return {
    id: "transfer-1",
    status: "pending",
    sourceProvider: "spotify",
    destinationProvider: "spotify",
    sourcePlaylistId: "playlist-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dryRun: true,
    ...overrides,
  };
}

let db: Database;
let closeDb: () => Promise<void>;
let storeA: PostgresTransferJobStore;
let storeB: PostgresTransferJobStore;

afterEach(async () => {
  await closeDb();
});

beforeEach(async () => {
  // In-memory pglite — a real, fresh Postgres instance per test. See ADR-0024.
  ({ db, close: closeDb } = await createTestDatabase());
  await db.insert(usersTable).values([
    { id: USER_A, email: "a@example.com", passwordHash: "x", createdAt: new Date() },
    { id: USER_B, email: "b@example.com", passwordHash: "x", createdAt: new Date() },
  ]);
  storeA = new PostgresTransferJobStore(db, USER_A);
  storeB = new PostgresTransferJobStore(db, USER_B);
});

describe("PostgresTransferJobStore", () => {
  it("creates and reads back a job for the same user", async () => {
    await storeA.create(makeJob());
    await expect(storeA.get("transfer-1")).resolves.toMatchObject({
      id: "transfer-1",
      status: "pending",
      sourcePlaylistId: "playlist-1",
    });
  });

  it("does not let one user read another user's job by id", async () => {
    await storeA.create(makeJob());
    await expect(storeB.get("transfer-1")).resolves.toBeUndefined();
  });

  it("applies a status/updatedAt patch via update, scoped to the owning user", async () => {
    await storeA.create(makeJob());
    await storeA.update("transfer-1", { status: "running", updatedAt: "2026-01-01T00:05:00.000Z" });

    const job = await storeA.get("transfer-1");
    expect(job?.status).toBe("running");
    expect(job?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("a same-id update from the wrong user's store is a silent no-op, not a cross-user write", async () => {
    await storeA.create(makeJob());
    await storeB.update("transfer-1", { status: "cancelled" });

    await expect(storeA.get("transfer-1")).resolves.toMatchObject({ status: "pending" });
  });

  it("saveReport attaches the final report, retrievable via findByIdForUser", async () => {
    await storeA.create(makeJob());
    const report: TransferReport = {
      sourceProvider: "spotify",
      destinationProvider: "spotify",
      itemType: "playlist",
      totalItems: 3,
      matchedItems: 0,
      createdItems: 0,
      skippedItems: 3,
      failedItems: 0,
      lowConfidenceMatches: [],
      unavailableItems: [],
      providerLimitationsEncountered: [],
      userActionsRequired: [],
    };
    await storeA.saveReport("transfer-1", report);

    const found = await storeA.findByIdForUser("transfer-1");
    expect(found?.report).toEqual(report);
  });

  it("listForUser returns only that user's jobs, newest first", async () => {
    await storeA.create(makeJob({ id: "transfer-1", createdAt: "2026-01-01T00:00:00.000Z" }));
    await storeA.create(makeJob({ id: "transfer-2", createdAt: "2026-01-02T00:00:00.000Z" }));
    await storeB.create(makeJob({ id: "transfer-3", createdAt: "2026-01-03T00:00:00.000Z" }));

    const jobs = await storeA.listForUser();
    expect(jobs.map((job) => job.id)).toEqual(["transfer-2", "transfer-1"]);
  });

  it("deletes a user's transfer jobs when the user is deleted (cascade)", async () => {
    await storeA.create(makeJob());
    await db.delete(usersTable).where(eq(usersTable.id, USER_A));

    await expect(storeA.get("transfer-1")).resolves.toBeUndefined();
  });

  describe("UPF exports", () => {
    const document: UpfDocument = {
      format: UPF_FORMAT_NAME,
      version: UPF_FORMAT_VERSION,
      createdAt: "2026-01-01T00:00:00.000Z",
      playlists: [{ id: "p1", title: "Backup", items: [] }],
    };

    it("stores and reads back an exported document", async () => {
      await storeA.create(makeJob());
      await storeA.saveUpfDocument("transfer-1", document);

      await expect(storeA.findUpfDocument("transfer-1")).resolves.toEqual(document);
    });

    it("does not let one user read another user's export", async () => {
      await storeA.create(makeJob());
      await storeA.saveUpfDocument("transfer-1", document);

      await expect(storeB.findUpfDocument("transfer-1")).resolves.toBeUndefined();
    });

    it("reports whether an export exists without carrying the document in a list", async () => {
      await storeA.create(makeJob({ id: "transfer-1" }));
      await storeA.create(makeJob({ id: "transfer-2" }));
      await storeA.saveUpfDocument("transfer-2", document);

      const jobs = await storeA.listForUser();
      const byId = Object.fromEntries(jobs.map((job) => [job.id, job]));
      expect(byId["transfer-1"]?.hasUpfDocument).toBe(false);
      expect(byId["transfer-2"]?.hasUpfDocument).toBe(true);
      // The flag exists precisely so the document itself stays out of a
      // list response — a hundred jobs must not mean a hundred libraries.
      expect(byId["transfer-2"]).not.toHaveProperty("upfDocument");
    });

    it("disposes of an export with the user that owns it (cascade)", async () => {
      await storeA.create(makeJob());
      await storeA.saveUpfDocument("transfer-1", document);
      await db.delete(usersTable).where(eq(usersTable.id, USER_A));

      await expect(storeA.findUpfDocument("transfer-1")).resolves.toBeUndefined();
    });
  });
});

describe("deleteForUser", () => {
  it("removes a finished job", async () => {
    await storeA.create(makeJob({ status: "completed" }));

    await expect(storeA.deleteForUser("transfer-1")).resolves.toBe(true);
    await expect(storeA.findByIdForUser("transfer-1")).resolves.toBeUndefined();
  });

  it("refuses a job that is still pending or running, and leaves it alone", async () => {
    // The runner writes progress to this row between tracks. Deleting it
    // mid-flight would turn every later write into a silent no-op
    // against a row that isn't there.
    for (const status of ["pending", "running"] as const) {
      await storeA.create(makeJob({ id: `job-${status}`, status }));

      await expect(storeA.deleteForUser(`job-${status}`)).resolves.toBe(false);
      await expect(storeA.findByIdForUser(`job-${status}`)).resolves.toBeDefined();
    }
  });

  it("deletes a cancelled job, so cancel-then-delete works", async () => {
    await storeA.create(makeJob({ status: "running" }));
    await storeA.cancel("transfer-1");

    await expect(storeA.deleteForUser("transfer-1")).resolves.toBe(true);
  });

  it("won't delete another user's job", async () => {
    await storeA.create(makeJob({ status: "completed" }));

    await expect(storeB.deleteForUser("transfer-1")).resolves.toBe(false);
    await expect(storeA.findByIdForUser("transfer-1")).resolves.toBeDefined();
  });

  it("reports false for a job that never existed", async () => {
    await expect(storeA.deleteForUser("nope")).resolves.toBe(false);
  });
});

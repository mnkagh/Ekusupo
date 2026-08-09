import { and, desc, eq } from "drizzle-orm";
import type { TransferJob, TransferJobStore, TransferReport } from "@ekusupo/core";

import type { Database } from "../db/client.js";
import { transferJobsTable } from "../db/schema.js";

export interface StoredTransferJob extends TransferJob {
  report: TransferReport | null;
}

function toJob(row: typeof transferJobsTable.$inferSelect): StoredTransferJob {
  return {
    id: row.id,
    status: row.status as TransferJob["status"],
    sourceProvider: row.sourceProvider,
    destinationProvider: row.destinationProvider,
    sourcePlaylistId: row.sourcePlaylistId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dryRun: row.dryRun,
    report: row.report ?? null,
  };
}

/**
 * Implements `@ekusupo/core`'s `TransferJobStore` unchanged (ADR-0027) —
 * `runDryRunTransfer` only ever calls `create`/`get`/`update`, none of
 * which take a `userId`, so this store closes over one at construction
 * instead. That's a deliberate, minimal adaptation rather than a change
 * to the core package's interface: it's constructed fresh per request
 * (mirroring `runDryRunTransfer`'s own default of `new
 * InMemoryTransferJobStore()` per run), and every query is additionally
 * scoped by `userId` so one user's job id can never read or overwrite
 * another's row.
 *
 * `saveReport`/`listForUser`/`findByIdForUser` are extra methods outside
 * `TransferJobStore` — the interface has no notion of a final report or
 * of listing, since the in-memory version never needed either.
 */
export class PostgresTransferJobStore implements TransferJobStore {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  async create(job: TransferJob): Promise<void> {
    await this.db.insert(transferJobsTable).values({
      id: job.id,
      userId: this.userId,
      status: job.status,
      sourceProvider: job.sourceProvider,
      destinationProvider: job.destinationProvider,
      sourcePlaylistId: job.sourcePlaylistId,
      dryRun: job.dryRun,
      createdAt: new Date(job.createdAt),
      updatedAt: new Date(job.updatedAt),
    });
  }

  async get(id: string): Promise<TransferJob | undefined> {
    return this.findByIdForUser(id);
  }

  async update(id: string, patch: Partial<TransferJob>): Promise<void> {
    const updates: Partial<typeof transferJobsTable.$inferInsert> = {};
    if (patch.status) updates.status = patch.status;
    if (patch.updatedAt) updates.updatedAt = new Date(patch.updatedAt);
    if (Object.keys(updates).length === 0) return;

    await this.db
      .update(transferJobsTable)
      .set(updates)
      .where(and(eq(transferJobsTable.id, id), eq(transferJobsTable.userId, this.userId)));
  }

  async saveReport(id: string, report: TransferReport): Promise<void> {
    await this.db
      .update(transferJobsTable)
      .set({ report })
      .where(and(eq(transferJobsTable.id, id), eq(transferJobsTable.userId, this.userId)));
  }

  async listForUser(): Promise<StoredTransferJob[]> {
    const rows = await this.db
      .select()
      .from(transferJobsTable)
      .where(eq(transferJobsTable.userId, this.userId))
      .orderBy(desc(transferJobsTable.createdAt));
    return rows.map(toJob);
  }

  async findByIdForUser(id: string): Promise<StoredTransferJob | undefined> {
    const [row] = await this.db
      .select()
      .from(transferJobsTable)
      .where(and(eq(transferJobsTable.id, id), eq(transferJobsTable.userId, this.userId)));
    return row ? toJob(row) : undefined;
  }
}

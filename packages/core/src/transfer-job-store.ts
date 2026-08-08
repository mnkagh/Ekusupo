import type { TransferJob } from "./transfer-job.js";

/**
 * Injectable so `runTransfer` doesn't depend on a real database — no
 * `services/api`/`services/worker` exist yet to back one. See
 * docs/transfer-engine.md. Cancellation checks read through this store;
 * a future durable implementation could also support resume without this
 * interface changing.
 */
export interface TransferJobStore {
  create(job: TransferJob): Promise<void>;
  get(id: string): Promise<TransferJob | undefined>;
  update(id: string, patch: Partial<TransferJob>): Promise<void>;
}

export class InMemoryTransferJobStore implements TransferJobStore {
  private readonly jobs = new Map<string, TransferJob>();

  async create(job: TransferJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async get(id: string): Promise<TransferJob | undefined> {
    return this.jobs.get(id);
  }

  async update(id: string, patch: Partial<TransferJob>): Promise<void> {
    const existing = this.jobs.get(id);
    if (!existing) return;
    this.jobs.set(id, { ...existing, ...patch });
  }
}

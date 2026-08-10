import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { createUpfFileProvider } from "@ekusupo/provider-upf-file";
import type { UpfDocument } from "@ekusupo/upf";

/**
 * A UPF file connector backed by a throwaway file, usable as either end
 * of a transfer:
 *
 * - **Seeded** — an uploaded document is written first, so the connector
 *   reads it as a source. This is how UPF import works.
 * - **Empty** — the connector writes into it, and `read()` returns what
 *   the transfer produced. This is how UPF export works.
 *
 * A real file rather than an in-memory twin because
 * `@ekusupo/provider-upf-file` is a real connector with a file-backed
 * contract; a second in-memory implementation of the same behaviour is a
 * second thing to keep correct (CLAUDE.md §3.3). The durable copy of an
 * export lives in Postgres next to the job (ADR-0032), so nothing here
 * needs a stable path, a per-user directory, or a sweeper.
 *
 * The path is generated, never derived from anything a caller sent, so
 * there is no traversal surface to defend.
 */
export interface UpfScratchFile {
  provider: MusicProvider;
  session: AuthSession;
  /** What is in the file now — `undefined` if nothing was ever written. */
  read(): Promise<UpfDocument | undefined>;
  /** Always call, in a `finally`. */
  dispose(): Promise<void>;
}

/** The UPF file connector needs no credentials; there is no account behind a file. */
const FILE_SESSION: AuthSession = { method: "none", raw: {} };

export async function createUpfScratchFile(seed?: UpfDocument): Promise<UpfScratchFile> {
  const directory = await mkdtemp(join(tmpdir(), "ekusupo-upf-"));
  const filePath = join(directory, "library.upf.json");

  if (seed) {
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, JSON.stringify(seed), "utf-8");
  }

  return {
    provider: createUpfFileProvider({ filePath }),
    session: FILE_SESSION,
    async read() {
      try {
        return JSON.parse(await readFile(filePath, "utf-8")) as UpfDocument;
      } catch {
        // A transfer that failed before its first write leaves no file.
        // Not an error here — the caller has the failed job and report,
        // which say why.
        return undefined;
      }
    },
    async dispose() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

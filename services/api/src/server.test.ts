import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDbFromClient, createPgliteClient } from "./db/client.js";
import { buildServer } from "./server.js";

/**
 * Records every embedded Postgres instance `buildServer` opens for
 * itself, so a test can assert it was closed again. There is no other
 * way to reach it: a server that creates its own database deliberately
 * doesn't expose it.
 */
const { createdClients } = vi.hoisted(() => ({ createdClients: [] as PGlite[] }));

vi.mock("./db/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db/client.js")>();
  return {
    ...actual,
    createPgliteClient: (dataDir?: string) => {
      const client = actual.createPgliteClient(dataDir);
      createdClients.push(client);
      return client;
    },
  };
});

afterEach(() => {
  createdClients.length = 0;
});

describe("buildServer", () => {
  it("responds to GET /health without binding a real port", async () => {
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("closes the database it opened for itself", async () => {
    // Each instance is a whole WASM Postgres heap. Leaving them open is
    // what made the pglite setup time out at random once a suite run had
    // accumulated enough of them.
    const app = await buildServer();
    const [owned] = createdClients;
    if (!owned) throw new Error("buildServer opened no database of its own");
    expect(owned.closed).toBe(false);

    await app.close();

    expect(owned.closed).toBe(true);
  });

  it("leaves a caller-supplied database open, because the caller owns it", async () => {
    // index.ts holds one database for the whole process and shuts it
    // down itself. A server that closed a database it was handed would
    // take the process's storage down with it.
    const client = createPgliteClient();
    const app = await buildServer({ db: createDbFromClient(client) });

    await app.close();

    expect(client.closed).toBe(false);
    await client.close();
  });
});

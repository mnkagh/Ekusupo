import { describe, expect, it, vi } from "vitest";

import { installShutdownHandlers, shutdown } from "./shutdown.js";

function deps(overrides: Partial<Parameters<typeof shutdown>[0]> = {}) {
  return {
    closeServer: vi.fn(async () => {}),
    closeDatabase: vi.fn(async () => {}),
    exit: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

describe("shutdown", () => {
  it("closes the server before the database", async () => {
    // Order matters: closing the database first would fail every request
    // still being drained.
    const order: string[] = [];
    const d = deps({
      closeServer: vi.fn(async () => void order.push("server")),
      closeDatabase: vi.fn(async () => void order.push("database")),
    });

    await shutdown(d);

    expect(order).toEqual(["server", "database"]);
    expect(d.exit).toHaveBeenCalledWith(0);
  });

  it("exits non-zero when closing fails, rather than hanging", async () => {
    const d = deps({
      closeServer: vi.fn(async () => {
        throw new Error("still draining");
      }),
    });

    await shutdown(d);

    expect(d.exit).toHaveBeenCalledWith(1);
    expect(d.logError).toHaveBeenCalled();
  });

  it("still exits non-zero when the database refuses to close", async () => {
    const d = deps({
      closeDatabase: vi.fn(async () => {
        throw new Error("busy");
      }),
    });

    await shutdown(d);

    expect(d.closeServer).toHaveBeenCalled();
    expect(d.exit).toHaveBeenCalledWith(1);
  });
});

describe("installShutdownHandlers", () => {
  /** Captures the handlers instead of registering them on the real process. */
  function captureSignals() {
    const handlers = new Map<string, () => void>();
    const on = ((signal: string, handler: () => void) => {
      handlers.set(signal, handler);
    }) as unknown as typeof process.on;
    return { handlers, on };
  }

  it("registers every termination signal a container might send", () => {
    const { handlers, on } = captureSignals();

    installShutdownHandlers({ ...deps(), on });

    // `docker stop` sends SIGTERM; Ctrl-C sends SIGINT.
    expect([...handlers.keys()]).toEqual(["SIGTERM", "SIGINT"]);
  });

  it("shuts down when the signal arrives", async () => {
    const { handlers, on } = captureSignals();
    const d = deps();

    installShutdownHandlers({ ...d, on });
    handlers.get("SIGTERM")?.();
    await vi.waitFor(() => expect(d.exit).toHaveBeenCalledWith(0));

    expect(d.closeServer).toHaveBeenCalledOnce();
    expect(d.closeDatabase).toHaveBeenCalledOnce();
  });

  it("ignores a second signal while the first is still draining", async () => {
    // A second Ctrl-C must not start tearing down the same resources
    // again underneath the teardown already running.
    const { handlers, on } = captureSignals();
    const d = deps();

    installShutdownHandlers({ ...d, on });
    handlers.get("SIGINT")?.();
    handlers.get("SIGINT")?.();
    handlers.get("SIGTERM")?.();
    await vi.waitFor(() => expect(d.exit).toHaveBeenCalledWith(0));

    expect(d.closeServer).toHaveBeenCalledOnce();
    expect(d.closeDatabase).toHaveBeenCalledOnce();
  });
});

export interface ShutdownDeps {
  /** Stops accepting connections and drains what is in flight. */
  closeServer: () => Promise<void>;
  /** Closes the database the process owns. */
  closeDatabase: () => Promise<void>;
  /** Injectable so a test does not end its own process. */
  exit?: (code: number) => void;
  log?: (message: string) => void;
  logError?: (message: string, error: unknown) => void;
}

/**
 * Shuts the process down in the right order: stop taking new work,
 * finish what is in flight, then close the database.
 *
 * Extracted from `index.ts` so it can be tested. It cannot be tested by
 * actually signalling the process on Windows — there are no real POSIX
 * signals there, so `SIGTERM` is not deliverable and a `taskkill /F` is
 * the equivalent of `SIGKILL`, which by definition runs no handler. The
 * behaviour still matters, because the containers in `infra/` run on
 * Linux and `docker stop` sends a real SIGTERM.
 */
export function shutdown(deps: ShutdownDeps): Promise<void> {
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const logError = deps.logError ?? ((message, error) => console.error(message, error));

  return (async () => {
    try {
      await deps.closeServer();
      await deps.closeDatabase();
      exit(0);
    } catch (error) {
      logError("[Ekusupo API] shutdown failed", error);
      exit(1);
    }
  })();
}

/**
 * Wires the termination signals to one `shutdown`, ignoring repeats — a
 * second Ctrl-C while the first is still draining must not start a
 * second teardown of the same resources.
 */
export function installShutdownHandlers(
  deps: ShutdownDeps & { signals?: NodeJS.Signals[]; on?: typeof process.on },
): void {
  const signals = deps.signals ?? (["SIGTERM", "SIGINT"] as NodeJS.Signals[]);
  const on = deps.on ?? process.on.bind(process);
  const log = deps.log ?? ((message: string) => console.log(message));

  let shuttingDown = false;
  for (const signal of signals) {
    on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      log(`[Ekusupo API] ${signal} received — shutting down`);
      void shutdown(deps);
    });
  }
}

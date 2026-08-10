/**
 * A fixed-window counter, keyed by whatever the caller decides — in
 * practice the client IP plus the route.
 *
 * Fixed window, not a sliding one: it admits a known burst at the window
 * boundary (up to 2× the limit across two adjacent windows), which is
 * acceptable for slowing credential guessing and is the reason this is
 * forty lines instead of a dependency. It is *not* adequate as a
 * general-purpose API quota, and is not used as one.
 *
 * In-memory, so it resets on restart and is per-process. That matches the
 * deployment this repository actually has (one process, embedded
 * Postgres — ADR-0024). Running several instances behind a load balancer
 * would need a shared store; that is a driver change, and the interface
 * here does not assume otherwise.
 */
export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets. Sent as `Retry-After`. */
  retryAfterSeconds: number;
  remaining: number;
}

export interface RateLimiterOptions {
  /** Attempts permitted per window. */
  limit: number;
  windowMs: number;
  /** Injectable so tests do not have to wait out real time. */
  now?: () => number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ limit, windowMs, now = Date.now }: RateLimiterOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): RateLimitDecision {
    const now = this.now();
    this.evictExpired(now);

    const existing = this.windows.get(key);
    const window =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + this.windowMs };

    window.count += 1;
    this.windows.set(key, window);

    const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
    return {
      allowed: window.count <= this.limit,
      retryAfterSeconds,
      remaining: Math.max(0, this.limit - window.count),
    };
  }

  /**
   * Called on a successful sign-in so a legitimate user is not punished
   * for their own earlier typos — the limit exists to slow guessing, and
   * a correct password is proof this was not that.
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Swept on each check rather than on an interval: a `setInterval` here
   * would keep the Node process alive on its own and would have to be
   * torn down by every test that builds a server. The map only grows
   * while requests arrive, so sweeping when they do is sufficient.
   */
  private evictExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

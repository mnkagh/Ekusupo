import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limiter.js";

/** A clock the test drives, so nothing has to wait out a real window. */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows exactly the limit, then refuses", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("counts each key separately", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("a").allowed).toBe(true);
    // One caller exhausting their budget must not lock out everyone else.
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("lets the caller back in once the window passes", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    clock.advance(59_999);
    expect(limiter.check("a").allowed).toBe(false);

    clock.advance(2);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reports how long to wait, and never says zero seconds", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });

    limiter.check("a");
    expect(limiter.check("a").retryAfterSeconds).toBe(60);

    // A `Retry-After: 0` would invite an immediate retry that is still
    // refused, so the floor is one second.
    clock.advance(59_950);
    expect(limiter.check("a").retryAfterSeconds).toBe(1);
  });

  it("reports the remaining budget without going negative", () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });

    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
    expect(limiter.check("a").remaining).toBe(0);
  });

  it("reset clears a caller's budget", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });

    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);

    // A correct password proves this was not credential guessing.
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("forgets keys whose window has passed, rather than growing forever", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 5, windowMs: 60_000, now: clock.now });

    for (let index = 0; index < 100; index += 1) limiter.check(`key-${index}`);

    clock.advance(60_001);
    limiter.check("anything");

    // Reached through the only observable consequence: an expired key is
    // indistinguishable from one that was never seen.
    const windows = (limiter as unknown as { windows: Map<string, unknown> }).windows;
    expect(windows.size).toBe(1);
  });
});

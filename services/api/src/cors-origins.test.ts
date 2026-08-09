import { describe, expect, it } from "vitest";

import { corsOriginsFor } from "./cors-origins.js";

describe("corsOriginsFor", () => {
  it("allows both loopback spellings so either address works in the browser", () => {
    expect(corsOriginsFor("http://localhost:5173")).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
    expect(corsOriginsFor("http://127.0.0.1:5173")).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
  });

  it("never emits a trailing slash, which would never match a browser's Origin header", () => {
    for (const origin of corsOriginsFor("http://localhost:5173")) {
      expect(origin.endsWith("/")).toBe(false);
    }
  });

  it("keeps the port and scheme when swapping the hostname", () => {
    expect(corsOriginsFor("https://localhost:4000")).toEqual([
      "https://localhost:4000",
      "https://127.0.0.1:4000",
    ]);
  });

  it("does not widen a deployed origin", () => {
    expect(corsOriginsFor("https://app.example.com")).toBe("https://app.example.com");
  });

  it("passes through anything that isn't a parseable URL", () => {
    expect(corsOriginsFor("not a url")).toBe("not a url");
  });
});

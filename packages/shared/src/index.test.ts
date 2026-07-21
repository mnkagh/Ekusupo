import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("packages/shared placeholder", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@ekusupo/shared");
  });
});

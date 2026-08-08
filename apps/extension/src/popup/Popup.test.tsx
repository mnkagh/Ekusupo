// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Popup } from "./Popup.js";

// This project doesn't set vitest's `test.globals: true`, so RTL's
// auto-cleanup (which detects a global `afterEach`) never registers —
// every React component test file needs this explicitly.
afterEach(cleanup);

describe("Popup", () => {
  it("renders the Ekusupo heading", () => {
    render(<Popup />);
    expect(screen.getByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });
});

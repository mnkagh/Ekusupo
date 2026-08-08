// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App.js";

// This project doesn't set vitest's `test.globals: true`, so RTL's
// auto-cleanup (which detects a global `afterEach`) never registers —
// same note as apps/extension/src/popup/Popup.test.tsx.
afterEach(cleanup);

describe("App", () => {
  it("renders the Ekusupo heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Popup } from "./Popup.js";

describe("Popup", () => {
  it("renders the Ekusupo heading", () => {
    render(<Popup />);
    expect(screen.getByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });
});

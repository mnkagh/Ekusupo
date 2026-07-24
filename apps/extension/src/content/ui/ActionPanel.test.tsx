// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DetectedResource } from "../../shared/messages.js";
import { ActionPanel } from "./ActionPanel.js";

// See apps/extension/src/popup/Popup.test.tsx for why this is explicit.
afterEach(cleanup);

const resource: DetectedResource = {
  provider: "spotify",
  resourceType: "playlist",
  resourceId: "37i9dQZF1DXcBWIGoYBM5M",
};

describe("ActionPanel", () => {
  it("renders the detected resource and all three actions", () => {
    render(
      <ActionPanel
        resource={resource}
        onTransfer={vi.fn()}
        onPreview={vi.fn()}
        onCopyUpf={vi.fn()}
      />,
    );

    expect(screen.getByText(/spotify playlist/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy UPF" })).toBeDefined();
  });

  it("calls onTransfer when Transfer is clicked, and no other callback", () => {
    const onTransfer = vi.fn();
    const onPreview = vi.fn();
    const onCopyUpf = vi.fn();
    render(
      <ActionPanel
        resource={resource}
        onTransfer={onTransfer}
        onPreview={onPreview}
        onCopyUpf={onCopyUpf}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCopyUpf).not.toHaveBeenCalled();
  });

  it("calls onPreview when Preview is clicked", () => {
    const onPreview = vi.fn();
    render(
      <ActionPanel
        resource={resource}
        onTransfer={vi.fn()}
        onPreview={onPreview}
        onCopyUpf={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("calls onCopyUpf when Copy UPF is clicked", () => {
    const onCopyUpf = vi.fn();
    render(
      <ActionPanel
        resource={resource}
        onTransfer={vi.fn()}
        onPreview={vi.fn()}
        onCopyUpf={onCopyUpf}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy UPF" }));

    expect(onCopyUpf).toHaveBeenCalledTimes(1);
  });
});

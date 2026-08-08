// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DetectedResource, TransferPanelState } from "../../shared/messages.js";
import { ActionPanel } from "./ActionPanel.js";

// See apps/extension/src/popup/Popup.test.tsx for why this is explicit.
afterEach(cleanup);

const resource: DetectedResource = {
  provider: "spotify",
  resourceType: "playlist",
  resourceId: "37i9dQZF1DXcBWIGoYBM5M",
};

const idle: TransferPanelState = { kind: "idle" };

function renderPanel(
  transferState: TransferPanelState = idle,
  overrides: Partial<{
    onTransfer: () => void;
    onPreview: () => void;
    onCopyUpf: () => void;
  }> = {},
) {
  return render(
    <ActionPanel
      resource={resource}
      transferState={transferState}
      onTransfer={overrides.onTransfer ?? vi.fn()}
      onPreview={overrides.onPreview ?? vi.fn()}
      onCopyUpf={overrides.onCopyUpf ?? vi.fn()}
    />,
  );
}

describe("ActionPanel", () => {
  it("renders the detected resource and all three actions", () => {
    renderPanel();

    expect(screen.getByText(/spotify playlist/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy UPF" })).toBeDefined();
  });

  it("shows no status text while idle", () => {
    renderPanel();
    expect(screen.queryByText(/Failed|Done|validating|matching/i)).toBeNull();
  });

  it("calls onTransfer when Transfer is clicked, and no other callback", () => {
    const onTransfer = vi.fn();
    const onPreview = vi.fn();
    const onCopyUpf = vi.fn();
    renderPanel(idle, { onTransfer, onPreview, onCopyUpf });

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCopyUpf).not.toHaveBeenCalled();
  });

  it("calls onPreview when Preview is clicked", () => {
    const onPreview = vi.fn();
    renderPanel(idle, { onPreview });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("calls onCopyUpf when Copy UPF is clicked", () => {
    const onCopyUpf = vi.fn();
    renderPanel(idle, { onCopyUpf });

    fireEvent.click(screen.getByRole("button", { name: "Copy UPF" }));

    expect(onCopyUpf).toHaveBeenCalledTimes(1);
  });

  it("disables Transfer and shows the step while running", () => {
    renderPanel({ kind: "running", step: "matching", processed: 2, total: 5 });

    const transferButton = screen.getByRole("button", { name: "Transferring…" });
    expect(transferButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("matching (2/5)")).toBeDefined();
  });

  it("does not call onTransfer if clicked while disabled during a run", () => {
    const onTransfer = vi.fn();
    renderPanel({ kind: "running", step: "matching" }, { onTransfer });

    fireEvent.click(screen.getByRole("button", { name: "Transferring…" }));

    expect(onTransfer).not.toHaveBeenCalled();
  });

  it("shows a summary and re-enables Transfer once completed", () => {
    renderPanel({
      kind: "completed",
      summary: { totalItems: 3, matchedItems: 1, createdItems: 0, skippedItems: 2, failedItems: 0 },
    });

    expect(screen.getByRole("button", { name: "Transfer" })).toBeDefined();
    expect(screen.getByText(/Done — 1\/3 matched, 2 skipped, 0 failed/)).toBeDefined();
  });

  it("shows the failure reason and re-enables Transfer on failure", () => {
    renderPanel({ kind: "failed", reason: "spotify isn't connected yet" });

    expect(screen.getByRole("button", { name: "Transfer" })).toBeDefined();
    expect(screen.getByText("Failed: spotify isn't connected yet")).toBeDefined();
  });
});

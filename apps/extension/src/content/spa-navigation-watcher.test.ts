// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { watchLocationChanges } from "./spa-navigation-watcher.js";

const unwatchers: (() => void)[] = [];

afterEach(() => {
  while (unwatchers.length > 0) unwatchers.pop()?.();
  history.replaceState({}, "", "/");
});

function watch(onChange: (url: string) => void) {
  const unwatch = watchLocationChanges(onChange);
  unwatchers.push(unwatch);
  return unwatch;
}

describe("watchLocationChanges", () => {
  it("notifies on pushState with the new URL", () => {
    const onChange = vi.fn();
    watch(onChange);

    history.pushState({}, "", "/pushed");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("/pushed"));
  });

  it("notifies on replaceState with the new URL", () => {
    const onChange = vi.fn();
    watch(onChange);

    history.replaceState({}, "", "/replaced");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("/replaced"));
  });

  it("does not notify when the URL doesn't actually change", () => {
    const onChange = vi.fn();
    const currentUrl = window.location.href;
    watch(onChange);

    history.pushState({}, "", currentUrl);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies on popstate (browser back/forward)", async () => {
    history.pushState({}, "", "/first");
    history.pushState({}, "", "/second");

    const changed = new Promise<string>((resolve) => {
      watch(resolve);
    });

    history.back();

    await expect(changed).resolves.toContain("/first");
  });

  it("cleanup restores the original history methods and stops notifying", () => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const onChange = vi.fn();

    const unwatch = watch(onChange);
    expect(history.pushState).not.toBe(originalPushState);

    unwatch();
    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);

    history.pushState({}, "", "/after-cleanup");
    expect(onChange).not.toHaveBeenCalled();
  });
});

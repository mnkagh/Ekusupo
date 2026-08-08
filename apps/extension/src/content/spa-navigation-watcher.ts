/**
 * Observes URL changes on a pushState-based single-page app (Spotify's
 * web player among them). `popstate` alone only fires on back/forward
 * navigation — it does not fire for `pushState`/`replaceState` calls the
 * app makes for in-app navigation, so those are patched directly. See
 * ADR-0009 for why this approach was chosen over polling or a
 * MutationObserver.
 */
export function watchLocationChanges(onChange: (url: string) => void): () => void {
  let lastUrl = window.location.href;

  const notifyIfChanged = (): void => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      onChange(lastUrl);
    }
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function patchedPushState(...args: Parameters<History["pushState"]>) {
    originalPushState.apply(history, args);
    notifyIfChanged();
  };
  history.replaceState = function patchedReplaceState(
    ...args: Parameters<History["replaceState"]>
  ) {
    originalReplaceState.apply(history, args);
    notifyIfChanged();
  };

  window.addEventListener("popstate", notifyIfChanged);

  return function unwatch() {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", notifyIfChanged);
  };
}

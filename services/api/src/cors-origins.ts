/**
 * Browsers treat `http://localhost:5173` and `http://127.0.0.1:5173` as
 * different origins, so a CORS allow-list containing one rejects the
 * other. That bites constantly in local development: Vite prints
 * `localhost`, while Spotify's dashboard requires the `127.0.0.1`
 * literal in redirect URIs, so the two ends of the app naturally drift
 * onto different spellings of the same machine.
 *
 * For a loopback `WEB_APP_URL` both spellings are therefore allowed, and
 * the dashboard works whichever one is typed. This is deliberately
 * limited to loopback: any other host is used exactly as configured, so
 * a deployed origin never gains an extra alias.
 */
export function corsOriginsFor(webAppUrl: string): string | string[] {
  let url: URL;
  try {
    url = new URL(webAppUrl);
  } catch {
    // Not a URL we can reason about — pass it through untouched rather
    // than silently widening what is allowed.
    return webAppUrl;
  }

  const alternateHostname =
    url.hostname === "localhost" ? "127.0.0.1" : url.hostname === "127.0.0.1" ? "localhost" : null;
  if (!alternateHostname) return webAppUrl;

  const alternate = new URL(webAppUrl);
  alternate.hostname = alternateHostname;
  return [stripTrailingSlash(url.toString()), stripTrailingSlash(alternate.toString())];
}

/** `new URL(...).toString()` adds a trailing slash, which never matches a browser's `Origin`. */
function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

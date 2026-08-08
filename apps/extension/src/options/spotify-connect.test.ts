import { describe, expect, it, vi } from "vitest";

import { connectSpotify } from "./spotify-connect.js";

describe("connectSpotify", () => {
  it("runs the PKCE flow and asks background to exchange the resulting code", async () => {
    const authenticate = vi.fn(async () => ({ connected: true }));
    const launchWebAuthFlow = vi.fn(async (details: { url: string }) => {
      // Confirms the authorize URL was actually built with a challenge, a
      // client id, and the redirect Chrome reported.
      expect(details.url).toContain("client_id=my-client-id");
      expect(details.url).toContain("code_challenge=");
      expect(details.url).toContain("redirect_uri=https%3A%2F%2Fabc.chromiumapp.org%2F");
      return "https://abc.chromiumapp.org/?code=the-auth-code&state=xyz";
    });

    const connected = await connectSpotify("my-client-id", {
      launchWebAuthFlow,
      getRedirectURL: () => "https://abc.chromiumapp.org/",
      authenticate:
        authenticate as unknown as typeof import("../shared/message-bus.js").sendToBackground,
    });

    expect(connected).toBe(true);
    expect(authenticate).toHaveBeenCalledWith("AuthenticateProvider", {
      provider: "spotify",
      code: "the-auth-code",
      redirectUri: "https://abc.chromiumapp.org/",
      codeVerifier: expect.any(String),
      clientId: "my-client-id",
    });
  });

  it("returns false without calling background when the user cancels the auth flow", async () => {
    const authenticate = vi.fn();

    const connected = await connectSpotify("my-client-id", {
      launchWebAuthFlow: async () => undefined,
      getRedirectURL: () => "https://abc.chromiumapp.org/",
      authenticate:
        authenticate as unknown as typeof import("../shared/message-bus.js").sendToBackground,
    });

    expect(connected).toBe(false);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns false when the redirect has no code (e.g. the user denied access)", async () => {
    const authenticate = vi.fn();

    const connected = await connectSpotify("my-client-id", {
      launchWebAuthFlow: async () => "https://abc.chromiumapp.org/?error=access_denied",
      getRedirectURL: () => "https://abc.chromiumapp.org/",
      authenticate:
        authenticate as unknown as typeof import("../shared/message-bus.js").sendToBackground,
    });

    expect(connected).toBe(false);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns false when background couldn't complete the exchange", async () => {
    const authenticate = vi.fn(async () => ({ connected: false }));

    const connected = await connectSpotify("my-client-id", {
      launchWebAuthFlow: async () => "https://abc.chromiumapp.org/?code=the-auth-code",
      getRedirectURL: () => "https://abc.chromiumapp.org/",
      authenticate:
        authenticate as unknown as typeof import("../shared/message-bus.js").sendToBackground,
    });

    expect(connected).toBe(false);
  });
});

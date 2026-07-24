import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageError } from "./errors.js";
import { onMessage, sendToBackground } from "./message-bus.js";

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

/**
 * A minimal hand-rolled fake of the chrome.runtime/chrome.tabs messaging
 * surface — same style as this repo's other fake dependencies (fake
 * MusicProvider in packages/core, fake fetch in the Spotify provider)
 * rather than a chrome-mocking test dependency. Routes sendMessage calls
 * directly to registered onMessage listeners within the same process,
 * mirroring how Chrome actually delivers messages between contexts.
 */
function installFakeChrome() {
  const listeners: Listener[] = [];

  function dispatch(message: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let anyListenerClaimed = false;
      for (const listener of listeners) {
        const claimed = listener(message, {} as chrome.runtime.MessageSender, resolve);
        if (claimed === true) anyListenerClaimed = true;
      }
      if (!anyListenerClaimed) {
        reject(new Error("Could not establish connection. Receiving end does not exist."));
      }
    });
  }

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
      sendMessage: (message: unknown) => dispatch(message),
    },
    tabs: {
      sendMessage: (_tabId: number, message: unknown) => dispatch(message),
    },
  });
}

beforeEach(() => {
  installFakeChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("message bus", () => {
  it("round-trips a request through onMessage to sendToBackground", async () => {
    onMessage("DetectCurrentPage", async () => ({ resource: null }));

    const response = await sendToBackground("DetectCurrentPage", undefined);

    expect(response).toEqual({ resource: null });
  });

  it("throws a no_handler MessageError when nothing is registered", async () => {
    await expect(sendToBackground("DetectCurrentPage", undefined)).rejects.toMatchObject({
      code: "no_handler",
    });
    await expect(sendToBackground("DetectCurrentPage", undefined)).rejects.toBeInstanceOf(
      MessageError,
    );
  });

  it("throws a handler_error MessageError when the handler throws", async () => {
    onMessage("DetectCurrentPage", () => {
      throw new Error("boom");
    });

    await expect(sendToBackground("DetectCurrentPage", undefined)).rejects.toMatchObject({
      code: "handler_error",
      message: "boom",
    });
  });

  it("lets a non-matching listener defer to the one that matches", async () => {
    const startTransferHandler = vi.fn(async () => ({ jobId: "job-1" }));
    const detectHandler = vi.fn(async () => ({ resource: null }));
    onMessage("StartTransfer", startTransferHandler);
    onMessage("DetectCurrentPage", detectHandler);

    const response = await sendToBackground("DetectCurrentPage", undefined);

    expect(response).toEqual({ resource: null });
    expect(detectHandler).toHaveBeenCalledTimes(1);
    expect(startTransferHandler).not.toHaveBeenCalled();
  });
});

import { MessageError } from "./errors.js";
import type { ExtensionMessage, MessageMap, MessageResponse, MessageType } from "./messages.js";

/**
 * Sent back by onMessage's catch clause instead of a real response, so a
 * handler that threw is distinguishable from "no handler responded at
 * all" on the sender's side — chrome.runtime message payloads are plain
 * data, so this is a plain sentinel object, not a real Error instance.
 */
interface HandlerErrorEnvelope {
  __ekusupoError: true;
  message: string;
}

function isHandlerErrorEnvelope(value: unknown): value is HandlerErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __ekusupoError?: unknown }).__ekusupoError === true
  );
}

/**
 * No custom request-ID correlation: chrome.runtime.sendMessage /
 * chrome.tabs.sendMessage already return a Promise scoped to that call's
 * own response in Manifest V3. See ADR-0008.
 */
async function dispatch<T extends MessageType>(
  send: () => Promise<unknown>,
  type: T,
): Promise<MessageResponse<T>> {
  let response: unknown;
  try {
    response = await send();
  } catch (error) {
    throw new MessageError("no_handler", `No handler responded to "${type}"`, { cause: error });
  }

  if (isHandlerErrorEnvelope(response)) {
    throw new MessageError("handler_error", response.message);
  }
  if (response === undefined) {
    throw new MessageError("no_handler", `No handler responded to "${type}"`);
  }
  return response as MessageResponse<T>;
}

/** Popup and content both talk to background this way. */
export function sendToBackground<T extends MessageType>(
  type: T,
  payload: MessageMap[T]["payload"],
): Promise<MessageResponse<T>> {
  const message: ExtensionMessage<T> = { type, payload };
  return dispatch(() => chrome.runtime.sendMessage(message), type);
}

/** Background talks to a specific tab's content script this way. */
export function sendToTab<T extends MessageType>(
  tabId: number,
  type: T,
  payload: MessageMap[T]["payload"],
): Promise<MessageResponse<T>> {
  const message: ExtensionMessage<T> = { type, payload };
  return dispatch(() => chrome.tabs.sendMessage(tabId, message), type);
}

type MessageHandler<T extends MessageType> = (
  payload: MessageMap[T]["payload"],
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse<T>> | MessageResponse<T>;

/**
 * Registers a typed handler for exactly one message type. Multiple calls
 * (including for different types) each register an independent
 * chrome.runtime.onMessage listener; a listener not addressed to it
 * returns undefined so Chrome tries the next one.
 */
export function onMessage<T extends MessageType>(type: T, handler: MessageHandler<T>): void {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse): boolean | undefined => {
      if (message.type !== type) return undefined;

      const respondWithError = (error: unknown) => {
        const envelope: HandlerErrorEnvelope = {
          __ekusupoError: true,
          message: error instanceof Error ? error.message : "Unknown handler error",
        };
        sendResponse(envelope);
      };

      // Handlers may throw synchronously (before ever returning a promise
      // for Promise.resolve to wrap) or reject asynchronously — both need
      // to reach respondWithError, hence the try/catch around the call
      // itself as well as the .catch() on its result.
      try {
        Promise.resolve(handler(message.payload as MessageMap[T]["payload"], sender))
          .then(sendResponse)
          .catch(respondWithError);
      } catch (error) {
        respondWithError(error);
      }

      return true;
    },
  );
}

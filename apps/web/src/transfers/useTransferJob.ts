import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/errors.js";
import { isTerminal, transfersClient } from "../api/transfers-client.js";
import type { TransferJob } from "../api/transfers-client.js";

/**
 * Fast enough that a short transfer feels immediate, slow enough that a
 * long one is not a request every animation frame. There is no push
 * channel — adding SSE or a WebSocket for a progress number would be a
 * second transport to keep working for no visible gain.
 */
const POLL_INTERVAL_MS = 700;

/**
 * One failed poll is a network blip, not a transfer failure: the job
 * keeps running server-side whatever this tab sees. Monitoring gives up
 * only after a sustained failure — and immediately on a 404, which will
 * never recover because the job is gone.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 8;

export type JobState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; job: TransferJob }
  | { status: "finished"; job: TransferJob }
  | { status: "error"; message: string };

export interface UseTransferJob {
  state: JobState;
  /** Hands a started job to the hook, which watches it to completion. */
  watch: (job: TransferJob) => void;
  starting: () => void;
  fail: (message: string) => void;
  reset: () => void;
  cancel: () => void;
}

/**
 * Watches one background transfer to completion (ADR-0033).
 *
 * The loop lives in an effect keyed on the watched job's id, rather than
 * in a self-rescheduling callback. That is what makes the two failure
 * modes impossible by construction rather than by care: React tears the
 * effect down on unmount and whenever the id changes, so a poll cannot
 * outlive the screen, and a late response for an abandoned job cannot
 * overwrite a newer one.
 */
export function useTransferJob(onSettled?: () => void): UseTransferJob {
  const [state, setState] = useState<JobState>({ status: "idle" });

  // Read only from inside the loop, never during render — so a caller
  // passing a fresh closure each render does not restart polling.
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  const watchedId = state.status === "running" ? state.job.id : null;

  useEffect(() => {
    if (!watchedId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async (): Promise<void> => {
      try {
        const { transfer } = await transfersClient.getTransfer(watchedId);
        if (stopped) return;

        failures = 0;

        if (isTerminal(transfer.status)) {
          setState({ status: "finished", job: transfer });
          settled.current?.();
          return;
        }

        setState({ status: "running", job: transfer });
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      } catch (error: unknown) {
        if (stopped) return;

        // Gone for good — this user has no such transfer, and no number
        // of retries changes that.
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "error", message: error.message });
          return;
        }

        failures += 1;
        if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          setState({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "Lost contact with the transfer. Check the history list in a moment.",
          });
          return;
        }

        // Back off a little more each miss, then keep watching — the
        // transfer is almost certainly still fine.
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS * failures);
      }
    };

    // Immediately, not after an interval: the job handed over by the
    // start request has no progress on it yet, so the first refresh is
    // the one that puts something on screen.
    void tick();

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [watchedId]);

  const watch = useCallback((job: TransferJob) => {
    if (isTerminal(job.status)) {
      setState({ status: "finished", job });
      settled.current?.();
      return;
    }
    setState({ status: "running", job });
  }, []);

  const cancel = useCallback(() => {
    if (!watchedId) return;
    // Polling deliberately continues: cancellation is cooperative, so the
    // job is only really cancelled once the server says it is.
    void transfersClient.cancelTransfer(watchedId).catch(() => undefined);
  }, [watchedId]);

  return {
    state,
    watch,
    cancel,
    starting: useCallback(() => setState({ status: "starting" }), []),
    fail: useCallback((message: string) => setState({ status: "error", message }), []),
    reset: useCallback(() => setState({ status: "idle" }), []),
  };
}

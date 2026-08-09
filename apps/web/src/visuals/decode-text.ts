/** Glyphs the letters resolve out of. Katakana + technical symbols read as machine, not as gibberish. */
export const SCRAMBLE = "アカサタナハマヤラワ0123456789/\\|<>[]{}#*+=";

export interface DecodeOptions {
  /** When the first letter locks, in ms from the start. */
  firstSettleMs?: number;
  /** Gap between one letter locking and the next. */
  perLetterMs?: number;
  /** Adds `is-locking` to each letter at the moment it resolves. */
  markLocking?: boolean;
  /** Called once every letter has settled. */
  onSettled?: () => void;
}

/**
 * Resolves a run of letters out of scrambled glyphs, left to right.
 *
 * Shared by the splash screen and the landing wordmark so the effect is
 * defined once — the two ran identical loops before, and the moment one
 * was tuned the other silently drifted out of step with it.
 *
 * Each element's target character comes from its own `data-char`, not
 * from its text content, because the text is being overwritten on every
 * frame while the animation runs.
 *
 * Returns a cleanup that cancels the frame loop and restores every
 * letter to its final character, so unmounting mid-decode can never
 * leave a stray glyph behind.
 */
export function runDecode(letters: HTMLElement[], options: DecodeOptions = {}): () => void {
  const { firstSettleMs = 500, perLetterMs = 190, markLocking = false, onSettled } = options;

  const startedAt = performance.now();
  const settleAt = letters.map((_, index) => firstSettleMs + index * perLetterMs);
  let frame = 0;

  const restore = () => {
    letters.forEach((letter) => {
      const target = letter.dataset.char ?? "";
      if (letter.textContent !== target) letter.textContent = target;
    });
  };

  const step = () => {
    const elapsed = performance.now() - startedAt;
    let remaining = false;

    letters.forEach((letter, index) => {
      const target = letter.dataset.char ?? "";
      if (elapsed >= (settleAt[index] ?? 0)) {
        if (letter.textContent !== target) {
          letter.textContent = target;
          if (markLocking) letter.classList.add("is-locking");
        }
        return;
      }
      remaining = true;
      // Re-roll roughly every 70ms rather than every frame — at 60fps a
      // per-frame scramble is a blur rather than readable characters.
      if (Math.floor(elapsed / 70) % 2 === 0) {
        letter.textContent = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] ?? target;
      }
    });

    if (remaining) {
      frame = requestAnimationFrame(step);
    } else {
      onSettled?.();
    }
  };

  frame = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(frame);
    restore();
  };
}

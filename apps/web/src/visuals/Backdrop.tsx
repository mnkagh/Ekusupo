import { Logo } from "../brand/Logo.js";
import { PaperPlane } from "../brand/PaperPlane.js";

export interface BackdropProps {
  /** `dense` is the signed-in workspace: the mark sits back further so it never competes with the panels. */
  variant?: "calm" | "dense";
}

/**
 * The permanent backdrop: the brand mark, set enormous and glowing
 * behind every screen.
 *
 * The mark rather than the name spelled out. Giant background type is
 * something every third landing page does, and at that size the word was
 * competing with the actual headline for the same job. A logo reads as a
 * watermark instead of as a second title, works at any aspect ratio
 * without reflowing, and carries no text for a selection or a screen
 * reader to trip over.
 *
 * Entirely decorative: `aria-hidden`, `pointer-events: none`, and
 * unselectable.
 */
export function Backdrop({ variant = "calm" }: BackdropProps) {
  return (
    <div className={`backdrop backdrop--${variant}`} aria-hidden="true">
      <div className="backdrop__mark">
        <Logo />
      </div>

      {/*
        A paper plane circling the mark — the thing being exported, in
        flight. Its own layer rather than a child of the mark, so the
        mark's slow drift does not drag the orbit off-centre.
      */}
      <div className="backdrop__orbit">
        <PaperPlane className="backdrop__plane" />
      </div>

      <div className="backdrop__scrim" />
    </div>
  );
}

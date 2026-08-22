import { useId } from "react";

import { prefersReducedMotion } from "../visuals/media.js";

export interface LogoProps {
  /** Rendered size in px. The mark is drawn on a 64×64 grid and scales cleanly. */
  size?: number;
  /**
   * Accessible name. Omit for a decorative instance sitting beside text
   * that already says "Ekusupo" — the mark is then hidden rather than
   * announced twice.
   */
  title?: string;
  className?: string;
  /**
   * Whether the name orbits the plane as a ring of text.
   *
   * Off for the small instances — the rail icon, a button glyph — where
   * the ring would shrink to an unreadable smear rather than a texture.
   * On by default: the backdrop watermark and the favicons are drawn
   * large enough for it to read as a ring rather than noise, and the
   * plane alone is a plainer mark than the one this product is built
   * around.
   */
  orbitLabel?: boolean;
}

/**
 * The Ekusupo mark: **a paper plane, with the name circling it.**
 *
 * A paper plane is the universal shorthand for "sent" — folded, thrown,
 * gone — which is what a transfer actually is: a playlist leaving one
 * place and arriving, intact, at another. It replaces an earlier mark (a
 * library with an arrow escaping its corner) that explained the idea in
 * two steps; a plane explains it in one glance.
 *
 * The name trails it rather than sitting beside it, on a wavy smoke
 * loop of the kind a skywriter leaves — the mark that used to *have*
 * an animated part (an arrow launching and circling back) now *is* one:
 * on the backdrop instance the trail itself sways, while the plane
 * stays still.
 *
 * Stroked with round caps and joins rather than filled: it keeps one
 * consistent weight at 15px in a button and at 400px behind the page,
 * where a filled mark would need two separate drawings. The stroke and
 * the ring's text both carry the same pink → white → yellow signal ramp
 * as the rest of the interface, so the mark is not a separate brand
 * asset with its own palette.
 */
export function Logo({ size = 40, title, className, orbitLabel = true }: LogoProps) {
  // Two instances on one page must not share a gradient id — the second
  // would silently repaint the first. Same reasoning for the ring path:
  // `<textPath>` resolves its `href` against the whole document, not the
  // local `<svg>`, so a shared id would make every ring trace whichever
  // circle was defined last.
  const gradientId = useId();
  const textGradientId = useId();
  const ringId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--spectrum-1)" />
          <stop offset="50%" stopColor="var(--spectrum-2)" />
          <stop offset="100%" stopColor="var(--spectrum-3)" />
        </linearGradient>
        {/*
         * The letters' own gradient, and the one place the word is
         * allowed to move: not its position — its light. The highlight
         * window slides diagonally across the text and back (ping-pong,
         * so it never snaps on restart), reading as sunlight crossing
         * smoke. Gated off entirely for reduced-motion users; a static
         * ramp fills the word either way.
         */}
        {orbitLabel && (
          <linearGradient id={textGradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            {!prefersReducedMotion() && (
              <>
                <animate
                  attributeName="x1"
                  values="-120%;220%;-120%"
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                />
                <animate
                  attributeName="y1"
                  values="220%;-120%;220%"
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                />
                <animate
                  attributeName="x2"
                  values="-20%;320%;-20%"
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                />
                <animate
                  attributeName="y2"
                  values="320%;-20%;320%"
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                />
              </>
            )}
            <stop offset="0%" stopColor="var(--spectrum-1)" />
            <stop offset="50%" stopColor="var(--spectrum-2)" />
            <stop offset="100%" stopColor="var(--spectrum-3)" />
          </linearGradient>
        )}
        {orbitLabel && (
          /* A smoke trail, not a ring: a smooth wave that loops the
              plane once, swinging between radius 14 and 24 — tight over
              the body, wider past the wingtips. Built from quadratic
              segments whose control points sit on the mean circle at
              the mid-angles, so the wave has no cusps and the letters
              flow like contrail rather than bending on a hoop. It ends
              a hair short of its start (31.99) because <textPath> needs
              an open path with distinct endpoints. */
          <path
            id={ringId}
            d="M 32,8 Q 36.9,13.6 39,19.9 Q 45.4,18.6 52.8,20 Q 50.4,27.1 46,32 Q 50.4,36.9 52.8,44 Q 45.4,45.4 39,44.1 Q 36.9,50.4 32,56 Q 27.1,50.4 25,44.1 Q 18.6,45.4 11.2,44 Q 13.6,36.9 18,32 Q 13.6,27.1 11.2,20 Q 18.6,18.6 25,19.9 Q 27.1,13.6 31.99,8"
          />
        )}
      </defs>

      {/*
       * The plane. Folded, not flying level — the long top wing and
       * the short lower fin are what read as "paper" rather than
       * "arrow"; a symmetric dart would just be the old arrowhead
       * again. The crease from nose to keel is the one internal line
       * every paper plane has, so its absence would have been the more
       * noticeable choice.
       *
       * The four corners are placed so the shape's bounding box is
       * centred on the grid's own centre (32,32) — an off-centre
       * watermark reads as a layout bug at 400px. The stroke is a
       * measured 4/64: heavy enough to survive 15px, light enough that
       * the large watermark reads as drawn rather than extruded.
       */}
      <g
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M56 9 L8 25 L27 34 L21 55 Z" />
        <path d="M56 9 L27 34" />
      </g>

      {/* The trail, and the name on it. The word itself never moves —
          letters together, sitting the top of the loop like a signature.
          The trail path is also rendered as a hairline *behind* the text;
          where it is shown (the large backdrop watermark only — CSS
          hides it everywhere else) its dashes drift along the wave, so
          the smoke around the plane visibly trails while everything
          else stays still. */}
      {orbitLabel && (
        <g className="logo__orbit">
          <use href={`#${ringId}`} className="logo__trail" />
          <text
            className="logo__orbit-text"
            fill={orbitLabel ? `url(#${textGradientId})` : `url(#${gradientId})`}
          >
            <textPath href={`#${ringId}`} startOffset="0%">
              EKUSUPO
            </textPath>
          </text>
        </g>
      )}
    </svg>
  );
}

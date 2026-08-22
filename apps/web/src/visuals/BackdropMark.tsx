import { useId } from "react";

import { prefersReducedMotion } from "./media.js";

const WORD = "EKUSUPO";

/**
 * The backdrop's mark: **headphones, with the name crawling the band.**
 *
 * The plane (`brand/Logo.tsx`) remains the interface-size mark; this
 * composition exists only at watermark scale behind the page.
 *
 * EKUSUPO is set on a textPath that follows the band's own arc, lifted
 * just clear of its stroke, and SMIL carries `startOffset` along that
 * arc forever — the word enters past one cup, crawls over the crown,
 * and slips out past the other, the way a snake would coil over the
 * band. The two ends of the loop deliberately overshoot the path so
 * the word exits fully before re-entering: no snap, no overlap.
 *
 * Skipped for reduced-motion users, who see the word resting at the
 * crown instead.
 */
export function BackdropMark() {
  const gradientId = useId();
  const wordGradientId = useId();
  const bandId = useId();
  const reduced = prefersReducedMotion();

  return (
    <div className="backdrop-mark">
      <svg
        viewBox="0 0 64 64"
        className="backdrop-mark__phones"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--spectrum-1)" />
            <stop offset="50%" stopColor="var(--spectrum-2)" />
            <stop offset="100%" stopColor="var(--spectrum-3)" />
          </linearGradient>

          {/*
           * The letters' light. Fixed in *user space* rather than tied
           * to the text's bounding box — so as the word crawls, the
           * highlight stays put and the colours scroll THROUGH it,
           * which reads as light falling on the band rather than as
           * the word carrying its own lighting rig.
           */}
          <linearGradient
            id={wordGradientId}
            gradientUnits="userSpaceOnUse"
            x1="-10"
            y1="0"
            x2="74"
            y2="64"
          >
            {!reduced && (
              <>
                <animate
                  attributeName="x1"
                  values="-90;90;-90"
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                />
                <animate
                  attributeName="x2"
                  values="40;170;40"
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

          {/* The crawl line: the band's own arc, radius lifted one
              half-stroke clear so the letters ride ON the band rather
              than buried in it. */}
          <path id={bandId} d="M 11.5,32 A 20.5,20.5 0 0 1 52.5,32" fill="none" />
        </defs>

        <g
          stroke={`url(#${gradientId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M 14 36 V 32 A 18 18 0 0 1 50 32 V 36" />
          <rect x="9" y="34" width="10" height="16" rx="5" />
          <rect x="45" y="34" width="10" height="16" rx="5" />
        </g>

        <text className="backdrop-mark__word" fill={`url(#${wordGradientId})`}>
          <textPath href={`#${bandId}`} startOffset={reduced ? "24%" : "0%"}>
            {WORD}
            {!reduced && (
              <animate
                attributeName="startOffset"
                values="-38%;104%"
                dur="13s"
                repeatCount="indefinite"
              />
            )}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

import { useId } from "react";

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
}

/**
 * The Ekusupo mark: **a library, and music leaving it.**
 *
 * The universal export glyph — a container with an arrow escaping its
 * top-right corner — with the container holding three equaliser bars
 * instead of a document. So it reads as "export" instantly, because that
 * is the shape everyone already knows, and reads as "export *music*" a
 * half-second later.
 *
 * The corner is genuinely open: the container's top edge stops short and
 * its right edge starts low, leaving a gap for the arrow to pass
 * through. Drawing the arrow over a closed box would make it sit on top
 * of the library rather than leave it — the gap is the difference
 * between a picture of export and a picture of a box with a sticker.
 *
 * Stroked with round caps and joins rather than filled: it keeps one
 * consistent weight at 15px in a button and at 400px behind the page,
 * where a filled mark would need two separate drawings. The stroke
 * carries the same teal → violet → amber ramp as the rest of the
 * interface, so the mark is not a separate brand asset with its own
 * palette.
 */
export function Logo({ size = 40, title, className }: LogoProps) {
  // Two instances on one page must not share a gradient id — the second
  // would silently repaint the first.
  const gradientId = useId();

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
      </defs>

      <g
        stroke={`url(#${gradientId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* The library. Open at the top-right, where the music leaves. */}
        <path d="M40 14 H20 a6 6 0 0 0 -6 6 V44 a6 6 0 0 0 6 6 H44 a6 6 0 0 0 6 -6 V28" />

        {/* What is inside it: three bars at different heights, standing
            on a common baseline. Uneven on purpose — level bars read as a
            barcode, not as sound. */}
        <path d="M23 41 V32" />
        <path d="M32 41 V25" />
        <path d="M41 41 V35" />

        {/* Out through the corner. */}
        <path d="M43 21 L57 7" />
        <path d="M46 7 H57 V18" />
      </g>
    </svg>
  );
}

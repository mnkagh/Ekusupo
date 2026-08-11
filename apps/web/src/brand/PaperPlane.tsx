import { useId } from "react";

export interface PaperPlaneProps {
  size?: number;
  className?: string;
}

/**
 * A paper plane, drawn in the same stroked style as the mark so the two
 * read as one family rather than as a logo with a sticker next to it.
 *
 * The fold line is the whole reason this is a *paper* plane and not a
 * triangle: without it the silhouette is just a dart. It is a separate
 * path rather than part of the outline so both keep an even weight where
 * they meet.
 *
 * Drawn nose-right, which is what lets the orbit place it by rotation
 * alone — see `.backdrop__orbit`.
 */
export function PaperPlane({ size = 40, className }: PaperPlaneProps) {
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--spectrum-1)" />
          <stop offset="100%" stopColor="var(--spectrum-3)" />
        </linearGradient>
      </defs>

      <g
        stroke={`url(#${gradientId})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M22 2 L15 22 L11 13 L2 9 Z" />
        <path d="M22 2 L11 13" />
      </g>
    </svg>
  );
}

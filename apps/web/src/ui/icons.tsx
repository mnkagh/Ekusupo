export interface IconProps {
  size?: number;
  className?: string;
}

/**
 * The conventional settings cog.
 *
 * Deliberately the shape everyone else uses rather than something drawn
 * to match the brand. An icon's whole job is to be recognised before it
 * is read, and a control that opens settings is the wrong place to be
 * original — the brand mark sat here first and looked like a logo that
 * happened to be clickable.
 *
 * Drawn the way the brand mark is drawn, though: stroked outlines of one
 * weight with round caps and joins, no fills. Same silhouette everyone
 * recognises, same hand as the rest of the interface. It was filled bars
 * and a heavy ring before, which read as belonging to a different set.
 *
 * Eight teeth as four crossing spokes plus a ring, rather than one
 * traced path, so it stays crisp at 15px with no small-size variant.
 * `currentColor` throughout, so it takes the colour of the button it
 * sits in, including on hover.
 */
export function SettingsIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Each spoke crosses the centre, so four of them read as eight
            evenly spaced teeth. Stopping short of the ring keeps the
            join clean instead of thickening where they meet. */}
        {[0, 45, 90, 135].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 12 12)`}>
            <path d="M12 2.5V6" />
            <path d="M12 18v3.5" />
          </g>
        ))}

        <circle cx="12" cy="12" r="6" />
      </g>
    </svg>
  );
}

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
 * Built from eight teeth and a ring rather than one traced path, so it
 * stays crisp at 15px and needs no separate small-size variant.
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
      {/* Four bars across the centre give eight teeth, evenly spaced. */}
      <g fill="currentColor">
        {[0, 45, 90, 135].map((angle) => (
          <rect
            key={angle}
            x="10.7"
            y="2"
            width="2.6"
            height="20"
            rx="1.3"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
      </g>

      {/* The body, as a thick ring — a filled disc with a second disc
          punched out would need to know the background colour. */}
      <circle cx="12" cy="12" r="5.7" fill="none" stroke="currentColor" strokeWidth="3.4" />
    </svg>
  );
}

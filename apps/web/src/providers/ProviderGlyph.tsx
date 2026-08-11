import type { ProviderDescriptor } from "./provider-catalog.js";

/**
 * Provider marks, drawn as inline SVG in each service's own colours so
 * a row is identifiable before its name is read.
 *
 * Simplified renderings rather than copies of the official trademark
 * files: enough of each mark's geometry and palette to read correctly at
 * size, without shipping a brand's asset.
 *
 * Inline rather than image files so each mark can animate its own parts
 * — arcs pulsing outward, a play triangle beating — which a static asset
 * cannot do.
 *
 * Decorative: every entry names its provider in text above the mark.
 */
export function ProviderGlyph({ glyph }: { glyph: ProviderDescriptor["glyph"] }) {
  return (
    <svg
      className="provider-glyph"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Spotify — a disc with three signal arcs that pulse outward. */}
      {glyph === "wave" && (
        <g>
          <circle cx="24" cy="24" r="24" fill="#1DB954" className="provider-glyph__disc" />
          <g stroke="#000" strokeWidth="3.2" strokeLinecap="round" className="provider-glyph__arcs">
            <path d="M14 19c7-2.5 14-2 20 1" />
            <path d="M15.5 25.5c6-2 11.5-1.5 16.5 1" />
            <path d="M17 31.5c4.5-1.5 9-1 13 1" />
          </g>
        </g>
      )}

      {/* YouTube Music — red disc, white ring and beating triangle. */}
      {glyph === "play" && (
        <g>
          <circle cx="24" cy="24" r="24" fill="#FF0033" className="provider-glyph__ring" />
          <circle cx="24" cy="24" r="15.5" fill="none" stroke="#fff" strokeWidth="2.4" />
          <path className="provider-glyph__play" d="M20 17.5 32 24l-12 6.5z" fill="#fff" />
        </g>
      )}

      {/* UPF file — a plain document; there is no brand to borrow. */}
      {glyph === "file" && (
        <g>
          <rect x="7" y="3" width="34" height="42" rx="6" fill="#F4EFE6" />
          <path d="M30 3v9a3 3 0 0 0 3 3h8" fill="#C9C0D6" className="provider-glyph__fold" />
          <g stroke="#0A0812" strokeWidth="2.4" strokeLinecap="round">
            <path d="M15 25h18" />
            <path d="M15 32h18" />
            <path d="M15 39h11" />
          </g>
        </g>
      )}
    </svg>
  );
}

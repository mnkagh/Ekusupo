import { useId } from "react";

import type { ProviderDescriptor } from "./provider-catalog.js";

/**
 * Provider marks, drawn in the same language as the Ekusupo logo:
 * stroked outlines of a single weight, round caps and joins, no fills,
 * and a gradient running through the stroke.
 *
 * They used to be filled brand badges — a solid green Spotify disc, a
 * solid red YouTube one. Those read as three unrelated stickers sitting
 * in a row, each borrowing someone else's visual identity, and none of
 * them belonging to this interface. Drawing them the way the logo is
 * drawn makes the set look designed rather than collected.
 *
 * Each still carries its own accent, so a tile is identifiable before
 * its name is read — `--accent-1`/`--accent-2` are set per provider on
 * the tile, and the gradient here picks them up. The geometry is a
 * simplified rendering, not a copy of any official trademark file.
 *
 * Inline rather than image files so parts can animate — arcs pulsing
 * outward, a play triangle beating — which a static asset cannot do.
 *
 * Decorative: every entry names its provider in text above the mark.
 */
export function ProviderGlyph({ glyph }: { glyph: ProviderDescriptor["glyph"] }) {
  // Several glyphs render on one page; sharing a gradient id would mean
  // the first definition silently painting all of them.
  const gradientId = useId();
  const stroke = `url(#${gradientId})`;

  return (
    <svg
      className="provider-glyph"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-1, var(--spectrum-1))" />
          <stop offset="100%" stopColor="var(--accent-2, var(--spectrum-3))" />
        </linearGradient>
      </defs>

      <g stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/*
          Every mark carries the same three bars the logo does — uneven
          heights on a common baseline. That motif is what makes the set
          read as one family; the shape around it is what tells them
          apart. Before this each glyph was a different idea entirely
          (arcs, a triangle, ruled lines) and they only had a stroke
          weight in common.
        */}

        {/* Spotify — the disc, as an outline. */}
        {glyph === "wave" && (
          <g>
            <circle cx="24" cy="24" r="19" className="provider-glyph__disc" />
            <g className="provider-glyph__bars">
              <path d="M17 29v-6" />
              <path d="M24 29v-11" />
              <path d="M31 29v-8" />
            </g>
          </g>
        )}

        {/* YouTube Music — the video frame. */}
        {glyph === "play" && (
          <g>
            <rect x="5" y="10" width="38" height="28" rx="8" className="provider-glyph__ring" />
            <g className="provider-glyph__bars">
              <path d="M17 29v-6" />
              <path d="M24 29v-11" />
              <path d="M31 29v-8" />
            </g>
          </g>
        )}

        {/* UPF file — a document with a folded corner; no brand to borrow. */}
        {glyph === "file" && (
          <g>
            <path d="M28 5H14a5 5 0 0 0-5 5v28a5 5 0 0 0 5 5h20a5 5 0 0 0 5-5V16z" />
            <path className="provider-glyph__fold" d="M28 5v6a5 5 0 0 0 5 5h6" />
            <g className="provider-glyph__bars">
              <path d="M17 34v-5" />
              <path d="M24 34v-10" />
              <path d="M31 34v-7" />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}

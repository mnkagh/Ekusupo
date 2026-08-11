import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates the app icons as real PNGs.
 *
 * Written by hand rather than pulled from a design file because the
 * repository has no binary assets and no image toolchain, and a PWA
 * cannot be installed without them — iOS in particular ignores SVG
 * icons entirely, so "just ship an SVG" is not an option.
 *
 * PNG is a simple enough container to emit directly: signature, IHDR,
 * a zlib-deflated IDAT of filtered scanlines, IEND. Each chunk carries
 * a CRC32 of its type and data.
 */

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public");

// --- CRC32, as the PNG spec defines it ------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type; 0 (None) keeps this
  // simple and compresses well enough for flat artwork.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark --------------------------------------------------------

/** The three palette stops, matching apps/web tokens. */
const TEAL = [52, 224, 208];
const VIOLET = [139, 108, 245];
const AMBER = [255, 178, 107];
const INK = [10, 8, 18];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Samples the teal → violet → amber ramp. */
function spectrum(t) {
  return t < 0.5 ? mix(TEAL, VIOLET, t * 2) : mix(VIOLET, AMBER, (t - 0.5) * 2);
}

/** Distance from a point to a line segment — round caps come for free. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Approximates a quarter-turn corner as a short run of segments. */
function arc(cx, cy, radius, fromDegrees, toDegrees, steps = 5) {
  const segments = [];
  for (let i = 0; i < steps; i++) {
    const a1 = ((fromDegrees + ((toDegrees - fromDegrees) * i) / steps) * Math.PI) / 180;
    const a2 = ((fromDegrees + ((toDegrees - fromDegrees) * (i + 1)) / steps) * Math.PI) / 180;
    segments.push([
      cx + radius * Math.cos(a1),
      cy + radius * Math.sin(a1),
      cx + radius * Math.cos(a2),
      cy + radius * Math.sin(a2),
    ]);
  }
  return segments;
}

/**
 * The Ekusupo mark, on the same 64×64 grid as `apps/web/src/brand/Logo.tsx`
 * — a library holding three equaliser bars, with an arrow leaving through
 * its open top-right corner.
 *
 * Every stroke is a line segment, and a pixel belongs to the mark when it
 * is within half a stroke width of the nearest one. That is the whole
 * rasteriser: there is no SVG engine here, and this repository ships no
 * image toolchain, so the mark is expressed as geometry the loop below
 * can measure against directly.
 *
 * Kept deliberately in step with the SVG. If the logo changes shape, these
 * coordinates change with it — a favicon quietly showing a previous
 * version of the brand is exactly what this replaced.
 */
const MARK_SEGMENTS = [
  // The library: top edge, then anticlockwise, open at the top right.
  [40, 14, 20, 14],
  ...arc(20, 20, 6, -90, -180),
  [14, 20, 14, 44],
  ...arc(20, 44, 6, 180, 90),
  [20, 50, 44, 50],
  ...arc(44, 44, 6, 90, 0),
  [50, 44, 50, 28],

  // What is inside it: three bars on a common baseline, uneven so they
  // read as sound rather than as a barcode.
  [23, 41, 23, 32],
  [32, 41, 32, 25],
  [41, 41, 41, 35],

  // Out through the corner: shaft, then the arrowhead's two edges.
  [43, 21, 57, 7],
  [46, 7, 57, 7],
  [57, 7, 57, 18],
];

function drawIcon(size, safeArea) {
  const rgba = Buffer.alloc(size * size * 4);

  // Maps the 64-unit grid onto the canvas, inset by the safe area so a
  // maskable icon survives the launcher cropping it to a circle.
  const scale = (size * safeArea) / 64;
  const offsetX = (size - 64 * scale) / 2;
  const offsetY = (size - 64 * scale) / 2;
  const halfStroke = (5 / 2) * scale;

  // Pre-scale once rather than per pixel.
  const segments = MARK_SEGMENTS.map(([ax, ay, bx, by]) => [
    offsetX + ax * scale,
    offsetY + ay * scale,
    offsetX + bx * scale,
    offsetY + by * scale,
  ]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      let nearest = Infinity;
      for (const [ax, ay, bx, by] of segments) {
        const distance = distanceToSegment(px, py, ax, ay, bx, by);
        if (distance < nearest) nearest = distance;
      }

      // One pixel of feathering at the edge. Without it every curve and
      // diagonal in the mark is visibly stair-stepped at 192px.
      const coverage = Math.max(0, Math.min(1, halfStroke + 0.5 - nearest));

      // The ramp runs left to right across the mark, matching the SVG's
      // gradient rather than being re-invented here.
      const [sr, sg, sb] = spectrum(Math.max(0, Math.min(1, (px - offsetX) / (64 * scale))));

      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(INK[0] + (sr - INK[0]) * coverage);
      rgba[offset + 1] = Math.round(INK[1] + (sg - INK[1]) * coverage);
      rgba[offset + 2] = Math.round(INK[2] + (sb - INK[2]) * coverage);
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  // Standard icons use most of the canvas.
  { name: "icon-192.png", size: 192, safeArea: 0.92 },
  { name: "icon-512.png", size: 512, safeArea: 0.92 },
  // Maskable icons are cropped by the launcher, so the art is inset.
  { name: "icon-maskable-512.png", size: 512, safeArea: 0.62 },
  // iOS home screen.
  { name: "apple-touch-icon.png", size: 180, safeArea: 0.86 },
];

for (const target of targets) {
  const png = drawIcon(target.size, target.safeArea);
  writeFileSync(join(OUT_DIR, target.name), png);
  const digest = createHash("sha256").update(png).digest("hex").slice(0, 8);
  console.log(
    `${target.name.padEnd(26)} ${String(png.length).padStart(7)} bytes  sha256:${digest}`,
  );
}

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

/**
 * Two interlocking rings on an ink field — the same mark the backdrop
 * renders in 3D, flattened. `safeArea` insets the artwork so a maskable
 * icon survives Android cropping it to a circle.
 */
function drawIcon(size, safeArea) {
  const rgba = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const usable = (size / 2) * safeArea;
  const ringRadius = usable * 0.62;
  const ringWidth = Math.max(2, usable * 0.13);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre;
      const dy = y - centre;

      let r = INK[0];
      let g = INK[1];
      let b = INK[2];

      // Horizontal ring, then a vertical ellipse crossing it — the same
      // silhouette as the 3D core seen face-on.
      const distanceOuter = Math.hypot(dx, dy);
      const distanceInner = Math.hypot(dx / 0.45, dy);

      const onOuter = Math.abs(distanceOuter - ringRadius) < ringWidth / 2;
      const onInner = Math.abs(distanceInner - ringRadius) < ringWidth / 2;

      if (onOuter || onInner) {
        // Hue follows the angle, so the ring runs through the palette.
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const [sr, sg, sb] = spectrum(angle);
        r = sr;
        g = sg;
        b = sb;
      }

      const offset = (y * size + x) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
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

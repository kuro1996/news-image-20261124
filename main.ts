// news-image-20261124 — "The World in One Day"
// Tuesday, 24 November 2026 — 35 verified stories, one 1024x1024 newspaper page.
// Written from scratch from the brief. Node 22 standard library only.
// No network, no system clock, no external packages, no embedded assets:
// every glyph and shape is drawn procedurally and the PNG encoder is hand-written.
// Output is deterministic: two runs produce byte-identical files.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// 5x7 bitmap font (glyphs designed here, one row per number, bit 4 = leftmost)
// ---------------------------------------------------------------------------
type Glyph = number[];
const FONT: Record<string, Glyph> = {
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x10, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  g: [0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ";": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  '"': [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
  "-": [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00],
  "\u2013": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "\u2014": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "\u00b7": [0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  "*": [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "@": [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  _: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "\u2019": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  "\u201c": [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
  "\u201d": [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
};

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const PAPER: RGB = [247, 242, 231];
const INK: RGB = [18, 18, 18];
const RED: RGB = [176, 30, 36];
const NAVY: RGB = [27, 58, 107];
const GREEN: RGB = [27, 110, 60];
const GRAY: RGB = [112, 107, 96];
const LIGHT: RGB = [232, 226, 212];
const MAPFILL: RGB = [214, 221, 231];
const MAPLINE: RGB = [120, 134, 158];
const OCEAN: RGB = [238, 242, 247];
const GOLD: RGB = [150, 110, 40];

type RGB = [number, number, number];
const img = new Uint8Array(W * H * 3);
const warnings: string[] = [];

function px(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
      i += 3;
    }
  }
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, t, h, c);
}
function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t);
  hline(x, y + h - t, w, c, t);
  vline(x, y, h, c, t);
  vline(x + w - t, y, h, c, t);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (dx * s) / steps;
    const y = y0 + (dy * s) / steps;
    if (t <= 1) px(x, y, c);
    else fillRect(x - (t - 1) / 2, y - (t - 1) / 2, t, t, c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB, filled = true): void {
  const r2 = r * r;
  const x0 = Math.ceil(cx - r);
  const x1 = Math.floor(cx + r);
  const y0 = Math.ceil(cy - r);
  const y1 = Math.floor(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (filled ? d2 <= r2 : d2 <= r2 && d2 >= (r - 1) * (r - 1)) px(x, y, c);
    }
  }
}
function circleOutline(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    px(cx + r * Math.cos(rad), cy + r * Math.sin(rad), c);
  }
}
// Scanline polygon fill. pts: flat [x0,y0,x1,y1,...]
function poly(pts: number[], c: RGB): void {
  const n = pts.length / 2;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, pts[i * 2 + 1]);
    maxY = Math.max(maxY, pts[i * 2 + 1]);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = pts[i * 2];
      const y0 = pts[i * 2 + 1];
      const x1 = pts[j * 2];
      const y1 = pts[j * 2 + 1];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(Math.round(xs[k]), y, Math.max(1, Math.round(xs[k + 1] - xs[k])), c);
    }
  }
}
function polyOutline(pts: number[], c: RGB): void {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    line(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], c);
  }
}

// ---------------------------------------------------------------------------
// Text (bitmap font, arbitrary scale, optional bold)
// ---------------------------------------------------------------------------
function glyphOf(ch: string): Glyph {
  return FONT[ch] ?? FONT["?"];
}
function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const ch of s) w += 6 * scale;
  return w - scale; // no trailing advance after last glyph
}
function drawGlyph(x: number, y: number, scale: number, g: Glyph, c: RGB, bold: boolean): void {
  const dx = bold ? Math.max(1, Math.round(scale * 0.22)) : 0;
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (1 << (4 - col))) {
        fillRect(x + col * scale, y + r * scale, Math.ceil(scale), Math.ceil(scale), c);
        if (dx) fillRect(x + col * scale + dx, y + r * scale, Math.ceil(scale), Math.ceil(scale), c);
      }
    }
  }
}
function drawText(
  x: number,
  y: number,
  scale: number,
  s: string,
  c: RGB,
  bold = false,
  align: "left" | "center" | "right" = "left",
): number {
  let sx = x;
  const w = textWidth(s, scale);
  if (align === "center") sx = x - w / 2;
  if (align === "right") sx = x - w;
  let cx = sx;
  for (const ch of s) {
    drawGlyph(Math.round(cx), Math.round(y), scale, glyphOf(ch), c, bold);
    cx += 6 * scale;
  }
  return w;
}
// Greedy word wrap; returns lines that fit maxWidth. Long words are hard-split.
function wrapText(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      if (textWidth(word, scale) > maxWidth) {
        // hard-split one overlong word
        let part = "";
        for (const ch of word) {
          if (textWidth(part + ch, scale) > maxWidth && part) {
            lines.push(part);
            part = ch;
          } else {
            part += ch;
          }
        }
        cur = part;
      } else {
        cur = word;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Draw wrapped text; returns the y just below the last line. Warns on overflow.
function drawWrapped(
  x: number,
  y: number,
  scale: number,
  s: string,
  c: RGB,
  maxWidth: number,
  lineH: number,
  bold = false,
  maxY = H,
): number {
  const lines = wrapText(s, scale, maxWidth);
  let yy = y;
  for (const ln of lines) {
    if (yy + 7 * scale > maxY) warnings.push(`TEXT OVERFLOW y=${Math.round(yy)}: "${ln}"`);
    drawText(x, yy, scale, ln, c, bold);
    yy += lineH;
  }
  return yy;
}

// ---------------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, filter 0, zlib level 9) — fully deterministic
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Data — the 35 verified stories of Tuesday 24 November 2026 (fixed data)
// ---------------------------------------------------------------------------
type Badge = "CONFIRMED" | "OFFICIAL" | "REPORTED";
const BADGE_COLOR: Record<Badge, RGB> = { CONFIRMED: GREEN, OFFICIAL: NAVY, REPORTED: RED };

interface Hero {
  n: number;
  region: string;
  title: string;
  summary: string;
  badge: Badge;
  source: string;
  time: string;
}
const HEROES: Hero[] = [
  {
    n: 1, region: "NORTH AMERICA", title: "HUAWEI GUILTY ON 10 OF 12 COUNTS",
    summary: "Jury convicts the tech giant of trade-secret theft and bank fraud; acquits it of racketeering.",
    badge: "CONFIRMED", source: "REUTERS", time: "20:41 UTC",
  },
  {
    n: 2, region: "MIDDLE EAST", title: "FOUR TANKERS HIT BY MINES IN HORMUZ",
    summary: "Iran says four tankers struck mines in the strait; its IRGC says it also attacked a container ship.",
    badge: "REPORTED", source: "IRGC", time: "19:00 UTC",
  },
  {
    n: 3, region: "NORTH AMERICA", title: "DEMOCRATS CLINCH 259 HOUSE SEATS",
    summary: "Biggest House majority since 1990; Broderick's win in Tennessee seals it.",
    badge: "CONFIRMED", source: "AP", time: "18:54 UTC",
  },
];

interface Mid {
  n: number;
  region: string;
  title: string;
  summary: string;
  badge: Badge;
  source: string;
  time: string;
}
const MIDS: Mid[] = [
  { n: 4, region: "SOUTH AMERICA", title: "Gunmen hold 25 hostage in Cartagena", summary: "Five older women freed; troops deployed.", badge: "OFFICIAL", source: "AP", time: "17:35 UTC" },
  { n: 5, region: "MIDDLE EAST", title: "Houthis 60 km from Aden and ready to attack", summary: "Army: defence line built north of city.", badge: "OFFICIAL", source: "YEMEN ARMY", time: "16:51 UTC" },
  { n: 6, region: "MIDDLE EAST", title: "Drone hits Riyadh PIF tower; 11 wounded", summary: "Second strike on tower in under a week.", badge: "OFFICIAL", source: "SAUDI GOVT", time: "14:27 UTC" },
  { n: 7, region: "MIDDLE EAST", title: "Turkish military helicopter crash kills five", summary: "AS-532 down after take-off from Eskisehir.", badge: "OFFICIAL", source: "TURKISH MOD", time: "16:30 UTC" },
  { n: 8, region: "MIDDLE EAST", title: "Israel kills Hamas security chief in Gaza", summary: "Nahel killed despite the ceasefire.", badge: "REPORTED", source: "GAZA OFFICIALS", time: "11:40 UTC" },
  { n: 9, region: "MIDDLE EAST", title: "Iraq takes control of Kurdish oilfields", summary: "Kurdish PM calls the move unacceptable.", badge: "OFFICIAL", source: "BAGHDAD", time: "11:19 UTC" },
  { n: 10, region: "SOUTH AMERICA", title: "Car bomb outside Colombian offices injures 23", summary: "Blast on eve of FARC deal anniversary.", badge: "REPORTED", source: "AP", time: "11:45 UTC" },
  { n: 11, region: "ASIA", title: "Hanoi restaurant blast kills at least six", summary: "Suspected gas leak; a dozen hurt.", badge: "REPORTED", source: "AP", time: "01:00 UTC" },
  { n: 12, region: "SPACE", title: "China names Shenzhou-24 crew; Pakistani to fly", summary: "Ali to be first foreigner aboard Tiangong.", badge: "OFFICIAL", source: "XINHUA", time: "24 NOV" },
  { n: 13, region: "NORTH AMERICA", title: "US consumer confidence at near two-year high", summary: "Index 103.3, highest since Jan 2025.", badge: "OFFICIAL", source: "CONF. BOARD", time: "24 NOV" },
];

const MORE: string[] = [
  "Haftar visits Turkey for first time",
  "UK sanctions Houthis, four officials",
  "Saudi strike kills 26 in Yemen's Lahj",
  "Gaza meningitis alert: 272 cases",
  "DR Congo plane missing; rebels claim hit",
  "Malaysia to return migrants to Myanmar",
  "Suspected jets trigger Ulleungdo alert",
  "Hasina plans return to Bangladesh Dec 16",
  "China probes Politburo member Chen Jining",
  "Zelensky: Kyiv to turn to new Congress if no deal",
  "Trump: no time frame for Ukraine peace",
  "CIA open-source system breached",
  "Pentagon rebukes Canada on defence, F-35",
  "Lukashenko offers to fly with Zelensky to Moscow",
  "Zelensky urges four-party talks soon",
  "Kremlin: Europe adds no value at talks yet",
  "Mexico inflation hits six-month high",
  "Dow closes above 50,000 for first time",
  "Sanofi to buy Insmed for $41 billion",
  "Nepal quake, magnitude 5.3",
  "Anthropic falls below $83 IPO price",
  "Senegal regains Africa Cup title",
];

const TIMELINE: [string, string][] = [
  ["01:00", "HANOI"],
  ["08:06", "SANOFI"],
  ["11:40", "GAZA STRIKE"],
  ["14:27", "RIYADH TOWER"],
  ["16:30", "TURKISH CRASH"],
  ["17:35", "CARTAGENA"],
  ["18:54", "DEMOCRATS"],
  ["20:41", "HUAWEI VERDICT"],
];

const STATS: [string, string, string][] = [
  ["259", "DEMOCRATS'", "HOUSE SEATS"],
  ["50,000", "DOW CLOSES ABOVE", "FIRST TIME"],
  ["25", "HOSTAGES HELD", "IN CARTAGENA"],
  ["4", "TANKERS HIT BY", "MINES IN HORMUZ"],
  ["11", "WOUNDED IN RIYADH", "TOWER HIT"],
  ["272", "MENINGITIS CASES", "IN GAZA IN OCTOBER"],
];

const REGIONS: [string, number, RGB][] = [
  ["MIDDLE EAST", 9, RED],
  ["NORTH AMERICA", 9, NAVY],
  ["ASIA", 6, GREEN],
  ["EUROPE", 6, GOLD],
  ["AFRICA", 2, [96, 96, 96]],
  ["SOUTH AMERICA", 2, [0, 120, 120]],
  ["SPACE", 1, [110, 60, 140]],
];

const MX = 22; // page margin
const RX = 1002; // right edge of content

// ---------------------------------------------------------------------------
// Masthead — lowered from the top edge so clear paper shows above it
// ---------------------------------------------------------------------------
function drawMasthead(): void {
  // Title: big and bold, centred, top edge at y=34 (was nearly touching before)
  drawText(512, 34, 6.5, "THE WORLD IN ONE DAY", INK, true, "center");
  drawText(512, 90, 4, "TUESDAY, 24 NOVEMBER 2026", RED, true, "center");
  drawText(512, 124, 2.2, "35 STORIES \u00b7 7 REGIONS \u00b7 EVERY ONE DATED", INK, true, "center");
  hline(MX, 146, RX - MX, INK, 3);
  hline(MX, 151, RX - MX, INK, 1);
}

// ---------------------------------------------------------------------------
// Timeline strip
// ---------------------------------------------------------------------------
function drawTimeline(): void {
  drawText(MX, 160, 1.8, "THE DAY IN UTC \u2014 WHEN THE NEWS BROKE", INK, true);
  const yLine = 190;
  hline(MX, yLine, RX - MX, INK, 2);
  const step = (RX - MX) / TIMELINE.length;
  TIMELINE.forEach(([t, label], i) => {
    const cx = MX + (i + 0.5) * step;
    drawText(cx, 172, 1.6, t, RED, true, "center");
    circle(cx, yLine + 1, 4, RED);
    circle(cx, yLine + 1, 2, PAPER);
    drawText(cx, 198, 1.4, label, INK, true, "center");
  });
}

// ---------------------------------------------------------------------------
// Six big-number stats
// ---------------------------------------------------------------------------
function drawStats(): void {
  const y0 = 216;
  const h = 56;
  const bw = 160;
  const gap = 4;
  STATS.forEach(([num, l1, l2], i) => {
    const x = MX + i * (bw + gap);
    rect(x, y0, bw, h, INK, 1);
    hline(x, y0, bw, RED, 3);
    drawText(x + bw / 2, y0 + 6, 3.2, num, NAVY, true, "center");
    drawText(x + bw / 2, y0 + 31, 1.4, l1, INK, true, "center");
    drawText(x + bw / 2, y0 + 43, 1.4, l2, INK, true, "center");
  });
}

// ---------------------------------------------------------------------------
// Region bar + legend (7 regions only — no Oceania, no World)
// ---------------------------------------------------------------------------
function drawRegions(): void {
  const y0 = 282;
  drawText(MX, y0, 1.6, "STORIES BY REGION \u00b7 TOTAL 35", INK, true);
  drawText(
    RX, y0 + 1, 1.3,
    "MIDDLE EAST 9 \u00b7 NORTH AMERICA 9 \u00b7 ASIA 6 \u00b7 EUROPE 6 \u00b7 AFRICA 2 \u00b7 SOUTH AMERICA 2 \u00b7 SPACE 1",
    GRAY, true, "right",
  );
  let x = MX;
  const yBar = 298;
  for (const [, count, c] of REGIONS) {
    const w = ((RX - MX) * count) / 35;
    fillRect(x, yBar, w, 12, c);
    x += w;
  }
  rect(MX, yBar, RX - MX, 12, INK, 1);
}

// ---------------------------------------------------------------------------
// Hero illustrations (flat procedural shapes, drawn inside each panel)
// ---------------------------------------------------------------------------
function drawCourthouse(x: number, y: number): void {
  fillRect(x + 6, y + 2, 308, 54, [233, 238, 244]);
  // scales of justice, right side
  vline(x + 276, y + 8, 40, INK, 2);
  hline(x + 252, y + 12, 48, INK, 2);
  circle(x + 276, y + 12, 3, INK);
  line(x + 254, y + 13, x + 246, y + 30, INK);
  line(x + 254, y + 13, x + 262, y + 30, INK);
  poly([x + 242, y + 30, x + 266, y + 30, x + 254, y + 38], GOLD);
  line(x + 298, y + 13, x + 290, y + 30, INK);
  line(x + 298, y + 13, x + 306, y + 30, INK);
  poly([x + 286, y + 30, x + 310, y + 30, x + 298, y + 38], GOLD);
  // courthouse, left/centre
  poly([x + 100, y + 16, x + 220, y + 16, x + 160, y + 2], NAVY);
  fillRect(x + 106, y + 16, 108, 26, [200, 196, 184]);
  rect(x + 106, y + 16, 108, 26, INK, 1);
  for (const cx of [114, 138, 174, 198]) fillRect(x + cx, y + 20, 6, 22, NAVY);
  fillRect(x + 152, y + 30, 16, 12, INK);
  fillRect(x + 100, y + 42, 120, 4, NAVY);
  fillRect(x + 94, y + 46, 132, 4, INK);
}

function drawTanker(x: number, y: number): void {
  fillRect(x + 6, y + 2, 308, 54, [233, 238, 244]);
  // sea
  fillRect(x + 6, y + 44, 308, 12, [186, 208, 226]);
  hline(x + 20, y + 48, 60, NAVY, 1);
  hline(x + 120, y + 51, 80, NAVY, 1);
  hline(x + 240, y + 48, 60, NAVY, 1);
  // containers + bridge
  fillRect(x + 62, y + 14, 44, 12, GOLD);
  fillRect(x + 110, y + 14, 44, 12, GREEN);
  fillRect(x + 158, y + 14, 44, 12, [196, 192, 180]);
  fillRect(x + 240, y + 4, 30, 22, INK);
  fillRect(x + 244, y + 8, 8, 6, PAPER);
  fillRect(x + 256, y + 8, 8, 6, PAPER);
  // hull
  poly([x + 40, y + 26, x + 272, y + 26, x + 260, y + 44, x + 52, y + 44], RED);
  fillRect(x + 40, y + 26, 232, 3, [120, 20, 24]);
  // naval mine, floating right
  const mx = x + 292;
  const my = y + 16;
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    line(mx + 7 * Math.cos(rad), my + 7 * Math.sin(rad), mx + 11 * Math.cos(rad), my + 11 * Math.sin(rad), INK, 2);
  }
  circle(mx, my, 7, INK);
  circle(mx, my, 3, PAPER);
}

function drawCapitol(x: number, y: number): void {
  fillRect(x + 6, y + 2, 308, 54, [233, 238, 244]);
  // dome (arc polygon)
  const cx = x + 120;
  const cy = y + 40;
  const pts: number[] = [];
  for (let a = 180; a <= 360; a += 12) {
    const rad = (a * Math.PI) / 180;
    pts.push(cx + 36 * Math.cos(rad), cy + 36 * Math.sin(rad));
  }
  pts.push(cx + 36, cy, cx - 36, cy);
  poly(pts, NAVY);
  fillRect(cx - 40, cy, 80, 4, NAVY);
  fillRect(cx - 46, cy + 4, 92, 4, INK);
  for (const cc of [86, 102, 118, 134, 150]) fillRect(x + cc, cy + 8, 5, 6, INK);
  // flag on the dome
  vline(cx, y + 2, 10, INK, 2);
  poly([cx, y + 2, cx + 14, y + 5, cx, y + 8], RED);
  // ballot box, right side
  fillRect(x + 226, y + 22, 72, 32, [200, 196, 184]);
  rect(x + 226, y + 22, 72, 32, INK, 1);
  fillRect(x + 236, y + 26, 52, 3, INK);
  fillRect(x + 250, y + 8, 24, 16, PAPER);
  rect(x + 250, y + 8, 24, 16, INK, 1);
  line(x + 254, y + 17, x + 259, y + 21, RED, 2);
  line(x + 259, y + 21, x + 269, y + 11, RED, 2);
}

// ---------------------------------------------------------------------------
// Three hero panels
// ---------------------------------------------------------------------------
function drawHeroes(): void {
  const y0 = 316;
  const y1 = 512;
  HEROES.forEach((h, i) => {
    const x = MX + i * 330;
    rect(x, y0, 320, y1 - y0, INK, 1);
    if (i === 0) drawCourthouse(x, y0);
    if (i === 1) drawTanker(x, y0);
    if (i === 2) drawCapitol(x, y0);
    drawText(x + 12, y0 + 64, 2.4, String(h.n), RED, true);
    drawText(x + 34, y0 + 66, 1.6, h.region, NAVY, true);
    drawWrapped(x + 12, y0 + 84, 2.6, h.title, INK, 296, 19, true, y0 + 124);
    drawWrapped(x + 12, y0 + 126, 1.6, h.summary, INK, 296, 12.5, false, y0 + 178);
    hline(x + 12, y0 + 180, 296, GRAY, 1);
    drawText(x + 12, y0 + 185, 1.5, `${h.badge} \u00b7 ${h.source}`, BADGE_COLOR[h.badge], true);
    drawText(x + 308, y0 + 185, 1.5, h.time, INK, true, "right");
  });
}

// ---------------------------------------------------------------------------
// Ten medium stories (4-13), two columns
// ---------------------------------------------------------------------------
function drawBadgeChip(xRight: number, y: number, badge: Badge): void {
  const s = 1.2;
  const w = textWidth(badge, s) + 10;
  fillRect(xRight - w, y, w, 12, BADGE_COLOR[badge]);
  drawText(xRight - w / 2, y + 2, s, badge, PAPER, true, "center");
}

function drawMedium(): void {
  drawText(MX, 520, 1.8, "MORE OF THE DAY \u2014 SOURCED AND TIMED", INK, true);
  hline(MX, 533, RX - MX, INK, 1);
  const cols = [
    { x: MX, w: 478, items: MIDS.slice(0, 5) },
    { x: 512, w: 490, items: MIDS.slice(5) },
  ];
  for (const col of cols) {
    let y = 542;
    for (const m of col.items) {
      circle(col.x + 10, y + 7, 10, NAVY);
      drawText(col.x + 10, y + 1, 1.4, String(m.n), PAPER, true, "center");
      const tx = col.x + 26;
      const tw = col.w - 26;
      const titleLines = wrapText(m.title, 1.65, tw);
      let yy = y;
      for (const ln of titleLines) {
        drawText(tx, yy, 1.65, ln, INK, true);
        yy += 14;
      }
      yy += 2;
      drawText(tx, yy, 1.5, m.summary, INK);
      yy += 13;
      drawText(tx, yy, 1.35, `${m.badge} \u00b7 ${m.source} \u00b7 ${m.time}`, GRAY, true);
      drawBadgeChip(col.x + col.w, yy - 1, m.badge);
      yy += 10;
      y = yy + 4;
      if (y > 772) warnings.push(`MEDIUM OVERFLOW after story ${m.n}: y=${Math.round(y)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// "22 MORE STORIES" (14-35) + world map with 13 numbered pins
// ---------------------------------------------------------------------------
function drawMore(): void {
  drawText(MX, 778, 1.8, "22 MORE STORIES", INK, true);
  drawText(RX, 779, 1.4, "WHERE THE TOP STORIES HAPPENED \u2014 PINS 1\u201313", INK, true, "right");
  hline(MX, 791, RX - MX, INK, 1);
  const cols = [
    { x: MX, w: 326, items: MORE.slice(0, 11), first: 14 },
    { x: 356, w: 328, items: MORE.slice(11), first: 25 },
  ];
  for (const col of cols) {
    let y = 800;
    col.items.forEach((title, k) => {
      const n = col.first + k;
      const full = `${n}. ${title}`;
      const lines = wrapText(full, 1.2, col.w);
      let yy = y;
      lines.forEach((ln, li) => {
        if (li === 0) {
          const numW = textWidth(`${n}. `, 1.2);
          drawText(col.x, yy, 1.2, `${n}.`, RED, true);
          drawText(col.x + numW, yy, 1.2, ln.slice(`${n}. `.length), INK);
        } else {
          drawText(col.x, yy, 1.2, ln, INK);
        }
        yy += 10;
      });
      y = yy + 2;
      if (y > 952) warnings.push(`MORE OVERFLOW after story ${n}: y=${Math.round(y)}`);
    });
  }
}

// World map: equirectangular, lon -180..180, lat 90..-55, continents as polygons.
const MAP = { x0: 696, y0: 796, w: 306, h: 154 };
function mapXY(lon: number, lat: number): [number, number] {
  return [MAP.x0 + ((lon + 180) / 360) * MAP.w, MAP.y0 + ((90 - lat) / 145) * MAP.h];
}
const CONTINENTS: [number, number][][] = [
  [[-168, 66], [-145, 70], [-125, 71], [-110, 68], [-95, 70], [-85, 66], [-80, 62], [-76, 58], [-70, 45], [-75, 35], [-81, 25], [-87, 21], [-90, 14], [-83, 9], [-79, 9], [-85, 12], [-92, 15], [-97, 16], [-105, 20], [-112, 24], [-117, 33], [-122, 37], [-124, 48], [-130, 56], [-145, 60], [-158, 58], [-165, 60]],
  [[-79, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-70, -18], [-70, -24], [-70, -31], [-72, -38], [-73, -44], [-70, -52], [-66, -55], [-68, -50], [-62, -41], [-57, -38], [-52, -32], [-48, -28], [-41, -23], [-39, -17], [-35, -8], [-35, -5], [-40, -3], [-44, -2], [-50, 0], [-53, 4], [-58, 6], [-62, 9], [-68, 11], [-72, 12], [-76, 10]],
  [[-10, 36], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-2, 50], [2, 51], [5, 53], [8, 55], [8, 57], [10, 59], [13, 56], [18, 56], [21, 55], [24, 59], [21, 61], [18, 63], [13, 66], [18, 70], [25, 71], [30, 70], [32, 68], [40, 68], [42, 66], [40, 60], [32, 60], [28, 58], [24, 58], [26, 55], [21, 54], [18, 54], [12, 54], [8, 54], [4, 52], [0, 50], [-5, 44], [-9, 37]],
  [[-17, 15], [-17, 21], [-15, 27], [-10, 31], [-5, 35], [0, 36], [10, 37], [11, 34], [20, 32], [25, 32], [32, 31], [35, 28], [34, 27], [37, 22], [39, 21], [43, 12], [48, 11], [51, 10], [51, 12], [46, 5], [42, 0], [40, -5], [40, -10], [37, -15], [35, -20], [32, -26], [28, -33], [20, -35], [17, -32], [15, -27], [12, -18], [13, -12], [9, -1], [9, 4], [4, 6], [-2, 5], [-8, 5], [-13, 8], [-17, 12]],
  [[42, 66], [50, 68], [60, 69], [68, 73], [75, 73], [90, 75], [105, 77], [120, 73], [135, 72], [150, 70], [162, 66], [170, 67], [178, 65], [170, 60], [162, 56], [158, 52], [156, 51], [150, 59], [142, 50], [140, 45], [135, 43], [130, 42], [127, 40], [126, 38], [122, 38], [120, 32], [122, 28], [120, 25], [110, 21], [108, 18], [105, 10], [103, 8], [100, 8], [98, 12], [95, 16], [92, 21], [90, 22], [88, 22], [85, 20], [80, 15], [77, 8], [75, 10], [72, 20], [68, 23], [66, 25], [62, 25], [58, 26], [56, 26], [54, 26], [52, 28], [50, 29], [48, 30], [44, 29], [43, 27], [40, 30], [39, 32], [36, 36], [36, 42], [40, 44], [42, 46], [40, 50], [42, 55], [40, 60]],
  [[113, -22], [114, -30], [115, -34], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [151, -24], [146, -19], [142, -15], [142, -11], [137, -12], [135, -12], [132, -11], [130, -13], [126, -14], [122, -17], [118, -20]],
];
// [story, lon, lat, disc dx, disc dy] — discs offset so crowded pins stay readable
const PINS: [number, number, number, number, number][] = [
  [1, -74, 41, -17, -13],
  [2, 56, 26, 19, -11],
  [3, -77, 39, 17, 13],
  [4, -75, 10, -19, 6],
  [5, 45, 13, 17, 15],
  [6, 47, 25, 22, 4],
  [7, 30, 40, -19, -13],
  [8, 34, 31, -21, 11],
  [9, 44, 36, 5, -19],
  [10, -73, 4, 17, 14],
  [11, 106, 21, 15, -9],
  [12, 100, 40, -15, -15],
  [13, -74, 41, -17, 15],
];

function drawMap(): void {
  fillRect(MAP.x0, MAP.y0, MAP.w, MAP.h, OCEAN);
  rect(MAP.x0, MAP.y0, MAP.w, MAP.h, INK, 1);
  for (const cont of CONTINENTS) {
    const pts: number[] = [];
    for (const [lon, lat] of cont) {
      const [x, y] = mapXY(lon, lat);
      pts.push(x, y);
    }
    poly(pts, MAPFILL);
    polyOutline(pts, MAPLINE);
  }
  for (const [n, lon, lat, dx, dy] of PINS) {
    const [tx, ty] = mapXY(lon, lat);
    const cx = tx + dx;
    const cy = ty + dy;
    line(tx, ty, cx, cy, INK, 1);
    circle(tx, ty, 2, RED);
    circle(cx, cy, 7, RED);
    circleOutline(cx, cy, 7, INK);
    drawText(cx, cy - 4, 1, String(n), PAPER, true, "center");
  }
}

// ---------------------------------------------------------------------------
// Footer: DATE CHECK box + sources
// ---------------------------------------------------------------------------
function drawFooter(): void {
  rect(MX, 958, RX - MX, 26, INK, 2);
  drawText(
    512, 966, 1.6,
    "DATE CHECK \u2014 Every story above happened, or was first reported, on Tuesday 24 November 2026.",
    INK, true, "center",
  );
  drawWrapped(
    MX, 990, 1.3,
    "SOURCES: REUTERS \u00b7 AP \u00b7 BBC \u00b7 AL JAZEERA \u00b7 XINHUA \u00b7 BLOOMBERG \u00b7 NEW YORK TIMES \u00b7 NEW YORK POST \u00b7 WALL STREET JOURNAL \u00b7 CONFERENCE BOARD \u00b7 CHINA MANNED SPACE AGENCY",
    GRAY, 980, 11, true, 1012,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const total = HEROES.length + MIDS.length + MORE.length;
  if (total !== 35) throw new Error(`expected 35 stories, got ${total}`);
  if (MIDS.length !== 10 || MORE.length !== 22) throw new Error("section counts wrong");
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawTimeline();
  drawStats();
  drawRegions();
  drawHeroes();
  drawMedium();
  drawMore();
  drawMap();
  drawFooter();
  const png = encodePng();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? ".";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} (${png.length} bytes) sha256=${sha}`);
  console.log(`stories: ${total} (heroes ${HEROES.length}, medium ${MIDS.length}, more ${MORE.length})`);
  if (warnings.length) {
    for (const w of warnings) console.error(`WARNING: ${w}`);
  } else {
    console.log("layout: no overflow warnings");
  }
}
main();

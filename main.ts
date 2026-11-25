// news-image-20261124 — "The World in One Day"
// Sums up Tuesday 24 November 2026 in one 1024x1024 newspaper front page.
// Node 22, standard library only, no network. Deterministic: two runs
// write byte-identical PNG files.
// Drawn procedurally: a hand-built vector stroke font, flat vector scenes,
// a simplified world map, and a zlib PNG encoder written here from scratch.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// PNG encoder (CRC32 + zlib deflate, color type 2, 8-bit RGB, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
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
// Canvas: supersampled raster (SS=2), box-downsampled to 1024x1024
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const SS = 2;
const SW = W * SS;
const SH = H * SS;

const buf = new Uint8Array(SW * SH * 3);

function setPx(sx: number, sy: number, r: number, g: number, b: number, a: number): void {
  if (sx < 0 || sy < 0 || sx >= SW || sy >= SH) return;
  const i = (sy * SW + sx) * 3;
  if (a >= 1) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
  } else if (a > 0) {
    buf[i] = Math.round(buf[i] * (1 - a) + r * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  }
}

function fillRect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(SW, Math.round((x + w) * SS));
  const y1 = Math.min(SH, Math.round((y + h) * SS));
  for (let sy = y0; sy < y1; sy++) {
    for (let sx = x0; sx < x1; sx++) {
      const i = (sy * SW + sx) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
}

function strokeRect(x: number, y: number, w: number, h: number, c: number[], t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function fillCircle(cx: number, cy: number, r: number, c: number[]): void {
  const x0 = Math.max(0, Math.floor((cx - r) * SS));
  const y0 = Math.max(0, Math.floor((cy - r) * SS));
  const x1 = Math.min(SW, Math.ceil((cx + r) * SS));
  const y1 = Math.min(SH, Math.ceil((cy + r) * SS));
  const ccx = cx * SS;
  const ccy = cy * SS;
  const rr = r * SS;
  for (let sy = y0; sy < y1; sy++) {
    for (let sx = x0; sx < x1; sx++) {
      const dx = sx + 0.5 - ccx;
      const dy = sy + 0.5 - ccy;
      if (dx * dx + dy * dy <= rr * rr) setPx(sx, sy, c[0], c[1], c[2], 1);
    }
  }
}

function strokeCircle(cx: number, cy: number, r: number, c: number[], t: number): void {
  const x0 = Math.max(0, Math.floor((cx - r - t) * SS));
  const y0 = Math.max(0, Math.floor((cy - r - t) * SS));
  const x1 = Math.min(SW, Math.ceil((cx + r + t) * SS));
  const y1 = Math.min(SH, Math.ceil((cy + r + t) * SS));
  const ccx = cx * SS;
  const ccy = cy * SS;
  for (let sy = y0; sy < y1; sy++) {
    for (let sx = x0; sx < x1; sx++) {
      const dx = sx + 0.5 - ccx;
      const dy = sy + 0.5 - ccy;
      const d = Math.sqrt(dx * dx + dy * dy) / SS;
      if (Math.abs(d - r) <= t / 2) setPx(sx, sy, c[0], c[1], c[2], 1);
    }
  }
}

// Thick anti-aliased line in logical coords.
function line(x0: number, y0: number, x1: number, y1: number, w: number, c: number[]): void {
  const ax = x0 * SS, ay = y0 * SS, bx = x1 * SS, by = y1 * SS;
  const hw = (w * SS) / 2;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1));
  const maxX = Math.min(SW - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1));
  const maxY = Math.min(SH - 1, Math.ceil(Math.max(ay, by) + hw + 1));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      const px = sx + 0.5;
      const py = sy + 0.5;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
      const a = Math.max(0, Math.min(1, hw + 0.6 - d));
      if (a > 0) setPx(sx, sy, c[0], c[1], c[2], a);
    }
  }
}

function polyline(pts: number[][], w: number, c: number[]): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
}

function fillPolygon(pts: number[][], c: number[]): void {
  const sp = pts.map((p) => [p[0] * SS, p[1] * SS]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of sp) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(SH - 1, Math.ceil(maxY));
  for (let sy = y0; sy <= y1; sy++) {
    const y = sy + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i];
      const b = sp[(i + 1) % sp.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xA = Math.max(0, Math.floor(xs[k]));
      const xB = Math.min(SW - 1, Math.ceil(xs[k + 1]));
      for (let sx = xA; sx <= xB; sx++) setPx(sx, sy, c[0], c[1], c[2], 1);
    }
  }
}

function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * SW + x * SS + dx) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      const n = SS * SS;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vector stroke font. Grid: caps 0..10 tall (baseline 10), descenders to 13.
// Each glyph: strokes separated by ";", points "x,y" separated by spaces.
// Written from scratch for this entry.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string> = {
  A: "0,10 3,0 6,10;1.5,6.5 4.5,6.5",
  B: "0,10 0,0 4,0 6,2 6,3.5 4,5 0,5;4,5 6,6.5 6,8 4,10 0,10",
  C: "6,2 4,0 2,0 0,2 0,8 2,10 4,10 6,8",
  D: "0,10 0,0 4,0 6,2 6,8 4,10 0,10",
  E: "6,0 0,0 0,10 6,10;0,5 4,5",
  F: "0,10 0,0 6,0;0,5 4,5",
  G: "6,2 4,0 2,0 0,2 0,8 2,10 4,10 6,8 6,5 3,5",
  H: "0,0 0,10;6,0 6,10;0,5 6,5",
  I: "3,0 3,10;1,0 5,0;1,10 5,10",
  J: "5,0 5,8 3,10 1,10 0,8",
  K: "0,0 0,10;6,0 0,5 6,10",
  L: "0,0 0,10 6,10",
  M: "0,10 0,0 3,6 6,0 6,10",
  N: "0,10 0,0 6,10 6,0",
  O: "2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0",
  P: "0,10 0,0 4,0 6,2 6,4 4,5 0,5",
  Q: "2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0;4,7 6.5,10.5",
  R: "0,10 0,0 4,0 6,2 6,4 4,5 0,5;3,5 6,10",
  S: "6,2 4,0 2,0 0,2 0,4 6,6 6,8 4,10 2,10 0,8",
  T: "0,0 6,0;3,0 3,10",
  U: "0,0 0,8 2,10 4,10 6,8 6,0",
  V: "0,0 3,10 6,0",
  W: "0,0 1.5,10 3,5 4.5,10 6,0",
  X: "0,0 6,10;6,0 0,10",
  Y: "0,0 3,5 6,0;3,5 3,10",
  Z: "0,0 6,0 0,10 6,10",
  a: "6,3 6,10;5,3 3,3 1,4 1,8 2,10 4,10 6,9",
  b: "1,0 1,10;1,6 3,4 5,4 6,6 6,8 5,10 3,10 1,9",
  c: "6,5 5,3 3,3 1,4 1,8 2,10 4,10 6,9",
  d: "5,0 5,10;0,5 0,9 1,10 3,10 5,9 5,5 4,4 2,4 0,5",
  e: "0,7 6,7;6,7 6,5 5,3 3,3 1,4 0,6 0,8 2,10 4,10 6,8",
  f: "4,0 2,1 2,10;2,4 5,4;1,0 4,0",
  g: "6,3 6,10 5,13 3,13 1,12 0,10;0,4 0,8 1,10 3,10 5,9 6,7 6,4 5,3 3,3 1,4",
  h: "1,0 1,10;1,6 3,4 5,4 6,6 6,10",
  i: "3,3 3,10;3,0.5 3,1.5",
  j: "4,0.5 4,1.5;4,3 4,11 3,13 1,13",
  k: "1,0 1,10;5,3 1,6 6,10",
  l: "3,0 3,10",
  m: "1,10 1,3 2,3 3,5 3,10;3,5 4,3 6,3 6,10",
  n: "1,10 1,3 3,3 5,3 6,5 6,10",
  o: "2,3 4,3 6,5 6,8 4,10 2,10 0,8 0,5 2,3",
  p: "1,3 1,13;1,6 3,4 5,4 6,6 6,8 5,10 3,10 1,9",
  q: "5,3 5,13;5,6 3,4 1,4 0,6 0,8 1,10 3,10 5,9",
  r: "1,10 1,3 3,3 5,4 6,6",
  s: "6,4 4,3 2,3 0,4 0,6 6,8 6,9 4,10 2,10 0,9",
  t: "3,0 3,10;1,4 5,4;2,10 4,10",
  u: "1,3 1,8 2,10 4,10 6,8 6,3",
  v: "0,3 3,10 6,3",
  w: "0,3 1.5,10 3,6 4.5,10 6,3",
  x: "0,3 6,10;6,3 0,10",
  y: "0,3 3,9 6,3;3,9 3,13 2,13 1,12",
  z: "0,3 6,3 0,10 6,10",
  "0": "2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0",
  "1": "3,0 3,10;1,2 3,0;1,10 5,10",
  "2": "0,2 1,0 4,0 6,2 6,4 0,10 6,10",
  "3": "0,1 2,0 4,0 6,2 5,4 6,5 6,8 4,10 2,10 0,9",
  "4": "4,0 4,10;0,7 6,7;0,7 4,0",
  "5": "6,0 0,0 0,4 4,4 6,6 6,8 4,10 0,10",
  "6": "6,1 4,0 2,0 0,2 0,8 2,10 4,10 6,8 6,6 4,5 2,5 0,6",
  "7": "0,0 6,0 3,10",
  "8": "2,0 4,0 6,2 6,4 4,5 2,5 0,4 0,2 2,0;2,5 4,5 6,6 6,8 4,10 2,10 0,8 0,6 2,5",
  "9": "0,4 0,2 2,0 4,0 6,2 6,8 4,10 2,10 0,9 0,8 2,6 4,6 6,5",
  ".": "3,9.6 3,10.3",
  ",": "3,9.5 2.5,12",
  ":": "3,3 3,3.7;3,8 3,8.7",
  ";": "3,3 3,3.7;3,8.5 2.5,12",
  "'": "3,0 2.5,2",
  "-": "1,6.5 5,6.5",
  "–": "0,6.5 6,6.5",
  "—": "0,6.5 6,6.5",
  "(": "5,0 3,2 3,8 5,10",
  ")": "1,0 3,2 3,8 1,10",
  "/": "5,0 1,10",
  "+": "3,1.5 3,8.5;1,5 5,5",
  "%": "0,0 6,10;1,1.5 3,1.5 3,3.5 1,3.5 1,1.5;3,6.5 5,6.5 5,8.5 3,8.5 3,6.5",
  "!": "3,0 3,7;3,9 3,10",
  "?": "1,2 2,0 4,0 6,2 6,4 3,6 3,8;3,9.5 3,10",
  '"': "2,0 2,2;4,0 4,2",
  "=": "1,3.5 5,3.5;1,7 5,7",
  "•": "2,4 4,4 4,6 2,6 2,4",
  "·": "2.8,5 3.2,5",
  "°": "2,1 4,1 5,2 5,4 4,5 2,5 1,4 1,2 2,1",
  $: "6,2 4,0 2,0 0,2 0,4 6,6 6,8 4,10 2,10 0,8;3,-1 3,11",
  "×": "1,3 5,7;5,3 1,7",
};

const NARROW = new Set(["i", "l", "j", ".", ",", ":", ";", "'", "!", "-", "·", "|", " "]);
const WIDE = new Set(["m", "w", "M", "W"]);

function charUnits(ch: string): number {
  if (ch === " ") return 4;
  if (NARROW.has(ch)) return 4.2;
  if (WIDE.has(ch)) return 8.6;
  return 7.2;
}

function textWidth(s: string, size: number, track = 0): number {
  const u = size / 10;
  let w = 0;
  for (const ch of s) w += charUnits(ch) * u + track;
  return w - track;
}

function drawChar(x: number, baseline: number, ch: string, size: number, c: number[], bold: boolean): void {
  const g = GLYPHS[ch];
  if (!g) return;
  const u = size / 10;
  const w = bold ? size * 0.17 : size * 0.13;
  for (const stroke of g.split(";")) {
    const pts: number[][] = [];
    for (const p of stroke.trim().split(/\s+/)) {
      const [gx, gy] = p.split(",").map(Number);
      pts.push([x + gx * u, baseline - size + gy * u]);
    }
    polyline(pts, w, c);
  }
}

interface TextOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
  track?: number;
}

function drawText(x: number, baseline: number, s: string, size: number, c: number[], opts: TextOpts = {}): void {
  const track = opts.track ?? 0;
  let cx = x;
  const w = textWidth(s, size, track);
  if (opts.align === "center") cx = x - w / 2;
  if (opts.align === "right") cx = x - w;
  for (const ch of s) {
    drawChar(cx, baseline, ch, size, c, !!opts.bold);
    cx += charUnits(ch) * (size / 10) + track;
  }
}

function wrapText(s: string, maxW: number, size: number, track = 0): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (textWidth(trial, size, track) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(x: number, yTop: number, s: string, size: number, maxW: number, c: number[], bold = false, lh = 1.32): number {
  const lines = wrapText(s, maxW, size);
  let y = yTop;
  for (const ln of lines) {
    drawText(x, y + size, ln, size, c, { bold });
    y += size * lh;
  }
  return y;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const INK = [22, 22, 22];
const PAPER = [247, 243, 232];
const PAPER2 = [238, 232, 216];
const RED = [176, 42, 32];
const NAVY = [29, 58, 95];
const TEAL = [15, 118, 110];
const GOLD = [192, 122, 18];
const SLATE = [100, 116, 139];
const LIGHT_BLUE = [220, 232, 240];
const MAP_LAND = [178, 196, 210];
const MAP_LINE = [90, 110, 130];
const GREEN = [46, 125, 79];
const PURPLE = [122, 79, 163];
const WHITE = [255, 255, 255];

const REGION_COLORS: Record<string, number[]> = {
  "MIDDLE EAST": RED,
  ASIA: [29, 111, 184],
  "NORTH AMERICA": NAVY,
  EUROPE: GREEN,
  AFRICA: GOLD,
  "SOUTH AMERICA": PURPLE,
  OCEANIA: TEAL,
  SPACE: [51, 65, 85],
  WORLD: SLATE,
};

// ---------------------------------------------------------------------------
// The day's news — 35 stories, every one first reported Tuesday 24 Nov 2026.
// Sources: Reuters, AP, BBC, Al Jazeera, Xinhua, Conference Board, CMSA.
// ---------------------------------------------------------------------------

interface Story {
  n: number;
  region: string;
  headline: string;
  summary: string;
  badge: string;
  source: string;
  time: string;
}

const PANELS: Story[] = [
  {
    n: 1, region: "NORTH AMERICA",
    headline: "HUAWEI GUILTY ON 10 OF 12 COUNTS",
    summary: "Jury convicts the tech giant of trade-secret theft and bank fraud; acquits it of racketeering.",
    badge: "CONFIRMED", source: "Reuters", time: "20:41 UTC",
  },
  {
    n: 2, region: "MIDDLE EAST",
    headline: "FOUR TANKERS HIT BY MINES IN HORMUZ",
    summary: "Iran says four tankers struck mines in the strait; its IRGC says it also attacked a container ship.",
    badge: "REPORTED", source: "IRGC / JMIC", time: "00:00 UTC",
  },
  {
    n: 3, region: "EUROPE",
    headline: "UKRAINE HITS RUSSIAN SHIPS FAR FROM HOME",
    summary: "Drones hit the cargo ship Sparta II in the Gulf of Finland and a corvette off Libya.",
    badge: "CONFIRMED", source: "Kyiv / Reuters", time: "08:14 UTC",
  },
];

const MEDIUM: Story[] = [
  { n: 4, region: "SOUTH AMERICA", headline: "Gunmen hold 25 hostage in Cartagena", summary: "Five older women freed; troops deployed.", badge: "OFFICIAL", source: "AP", time: "17:35 UTC" },
  { n: 5, region: "MIDDLE EAST", headline: "Houthis 60 km from Aden and ready to attack", summary: "Army: defence line built north of city.", badge: "OFFICIAL", source: "Yemen army", time: "16:51 UTC" },
  { n: 6, region: "MIDDLE EAST", headline: "Drone hits Riyadh PIF tower; 11 wounded", summary: "Second strike on tower in under a week.", badge: "OFFICIAL", source: "Saudi govt", time: "14:27 UTC" },
  { n: 7, region: "MIDDLE EAST", headline: "Turkish military helicopter crash kills five", summary: "AS-532 down after take-off from Eskisehir", badge: "OFFICIAL", source: "Turkish MoD", time: "19:52 UTC" },
  { n: 8, region: "MIDDLE EAST", headline: "Israel kills Hamas security chief in Gaza", summary: "Nahel killed despite the ceasefire.", badge: "REPORTED", source: "Gaza officials", time: "11:40 UTC" },
  { n: 9, region: "MIDDLE EAST", headline: "Iraq takes control of Kurdish oilfields", summary: "Kurdish PM calls the move unacceptable.", badge: "OFFICIAL", source: "Baghdad", time: "11:19 UTC" },
  { n: 10, region: "SOUTH AMERICA", headline: "Car bomb outside Colombian offices injures 23", summary: "Blast on eve of FARC deal anniversary.", badge: "REPORTED", source: "AP", time: "11:45 UTC" },
  { n: 11, region: "ASIA", headline: "Hanoi restaurant blast kills at least six", summary: "Suspected gas leak; a dozen hurt.", badge: "REPORTED", source: "AP", time: "08:16 UTC" },
  { n: 12, region: "SPACE", headline: "China names Shenzhou-24 crew; Pakistani to fly", summary: "Ali to be first foreigner aboard Tiangong.", badge: "OFFICIAL", source: "Xinhua", time: "24 Nov" },
  { n: 13, region: "NORTH AMERICA", headline: "US consumer confidence at near two-year high", summary: "Index 103.3, highest since Jan 2025.", badge: "OFFICIAL", source: "Conf. Board", time: "24 Nov" },
];

const MORE: { n: number; region: string; text: string }[] = [
  { n: 14, region: "MIDDLE EAST", text: "Haftar visits Turkey for first time" },
  { n: 15, region: "EUROPE", text: "UK sanctions Houthis, four officials" },
  { n: 16, region: "MIDDLE EAST", text: "Saudi strikes leave 25 dead in Yemen" },
  { n: 17, region: "MIDDLE EAST", text: "Gaza meningitis alert: 272 cases" },
  { n: 18, region: "AFRICA", text: "DR Congo plane missing; rebels claim hit" },
  { n: 19, region: "ASIA", text: "Malaysia to return migrants to Myanmar" },
  { n: 20, region: "ASIA", text: "S. Korea shelters island after jets near" },
  { n: 21, region: "ASIA", text: "Hasina plans return to Bangladesh Dec 16" },
  { n: 22, region: "ASIA", text: "China: death sentence for spying official" },
  { n: 23, region: "EUROPE", text: "NATO vows defence against space threat" },
  { n: 24, region: "NORTH AMERICA", text: "El Chapo Isidro captured in Sinaloa" },
  { n: 25, region: "NORTH AMERICA", text: "Bukele names 3 soldiers killed in Haiti" },
  { n: 26, region: "NORTH AMERICA", text: "Pentagon rebukes Canada on defence, F-35" },
  { n: 27, region: "NORTH AMERICA", text: "US blacklists Megaspeed in Nvidia scandal" },
  { n: 28, region: "EUROPE", text: "Zelensky urges four-party talks soon" },
  { n: 29, region: "WORLD", text: "14 nations affirm ICJ Myanmar ruling" },
  { n: 30, region: "NORTH AMERICA", text: "Mexico inflation hits six-month high" },
  { n: 31, region: "NORTH AMERICA", text: "US plans tariffs on China, EU" },
  { n: 32, region: "ASIA", text: "N. Korea orders Swiss office closed" },
  { n: 33, region: "ASIA", text: "Nepal quake, magnitude 5.6" },
  { n: 34, region: "OCEANIA", text: "Solomon Islands backs Australia pact" },
  { n: 35, region: "AFRICA", text: "Senegal regains Africa Cup title" },
];

const STATS = [
  { big: "4", cap: "TANKERS HIT BY MINES IN HORMUZ" },
  { big: "25", cap: "HOSTAGES HELD IN CARTAGENA" },
  { big: "10/12", cap: "COUNTS: HUAWEI FOUND GUILTY" },
  { big: "60 km", cap: "KM FROM ADEN: HOUTHI ADVANCE" },
  { big: "11", cap: "WOUNDED IN RIYADH TOWER HIT" },
  { big: "6", cap: "KILLED IN HANOI BLAST" },
];

const TIMELINE = [
  { t: "00:00", label: "HORMUZ" },
  { t: "02:09", label: "EL CHAPO" },
  { t: "08:14", label: "UKRAINE SHIPS" },
  { t: "11:40", label: "GAZA STRIKE" },
  { t: "14:27", label: "RIYADH TOWER" },
  { t: "17:35", label: "CARTAGENA" },
  { t: "19:52", label: "TURKISH CRASH" },
  { t: "20:41", label: "HUAWEI VERDICT" },
];

// ---------------------------------------------------------------------------
// Panel illustrations (flat vector scenes)
// ---------------------------------------------------------------------------

function drawScales(cx: number, cy: number, s: number, c: number[]): void {
  // Scales of justice: post, beam, two pans.
  line(cx, cy - 34 * s, cx, cy + 30 * s, 3.2 * s, c);
  line(cx - 26 * s, cy - 26 * s, cx + 26 * s, cy - 26 * s, 3.2 * s, c);
  fillCircle(cx, cy - 34 * s, 3 * s, c);
  for (const side of [-1, 1]) {
    const px = cx + side * 26 * s;
    line(px, cy - 26 * s, px - 9 * s, cy - 8 * s, 2 * s, c);
    line(px, cy - 26 * s, px + 9 * s, cy - 8 * s, 2 * s, c);
    fillPolygon([[px - 11 * s, cy - 8 * s], [px + 11 * s, cy - 8 * s], [px, cy + 2 * s]], c);
  }
  line(cx - 18 * s, cy + 30 * s, cx + 18 * s, cy + 30 * s, 3.2 * s, c);
}

function drawCourthouse(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [214, 226, 238]);
  const cx = x + w / 2;
  // Pediment + columns + steps.
  fillPolygon([[cx - 62, y + 22], [cx + 62, y + 22], [cx, y + 4]], NAVY);
  fillRect(cx - 62, y + 22, 124, 4, NAVY);
  for (const dx of [-48, -16, 16, 48]) fillRect(cx + dx - 4, y + 26, 8, 36, NAVY);
  fillRect(cx - 62, y + 62, 124, 4, NAVY);
  fillRect(cx - 70, y + 66, 140, 4, [120, 130, 145]);
  // Scales above the roofline, small, in gold.
  drawScales(cx, y + 40, 0.42, GOLD);
}

function drawTanker(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [186, 214, 228]);
  const cy = y + h - 26;
  // Waves.
  for (let i = 0; i < 3; i++) {
    const wy = cy + 6 + i * 8;
    const pts: number[][] = [];
    for (let px = x + 6; px <= x + w - 6; px += 12) {
      pts.push([px, wy + (i % 2 === 0 ? 2 : -2)]);
    }
    polyline(pts, 2.2, [90, 130, 160]);
  }
  // Hull + containers + bridge.
  fillPolygon([[x + 52, cy - 22], [x + 262, cy - 22], [x + 250, cy], [x + 64, cy]], [120, 40, 32]);
  fillRect(x + 88, cy - 40, 26, 18, [29, 58, 95]);
  fillRect(x + 118, cy - 40, 26, 18, [192, 122, 18]);
  fillRect(x + 148, cy - 40, 26, 18, [46, 125, 79]);
  fillRect(x + 178, cy - 40, 26, 18, [122, 79, 163]);
  fillRect(x + 232, cy - 48, 22, 26, [240, 240, 235]);
  fillRect(x + 236, cy - 56, 14, 8, [240, 240, 235]);
  // Mines: spiked circles.
  for (const [mx, my] of [[x + 34, y + 22], [x + 286, y + 18], [x + 268, y + 52]] as number[][]) {
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      line(mx, my, mx + Math.cos(ang) * 11, my + Math.sin(ang) * 11, 2, INK);
    }
    fillCircle(mx, my, 7, INK);
  }
  // Flame on one mine.
  fillPolygon([[x + 30, y + 14], [x + 38, y + 14], [x + 34, y + 2]], [220, 90, 20]);
}

function drawWarship(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [226, 222, 210]);
  const cy = y + h - 24;
  for (let i = 0; i < 3; i++) {
    const wy = cy + 6 + i * 8;
    const pts: number[][] = [];
    for (let px = x + 6; px <= x + w - 6; px += 12) {
      pts.push([px, wy + (i % 2 === 0 ? 2 : -2)]);
    }
    polyline(pts, 2.2, [120, 130, 120]);
  }
  // Hull, superstructure, mast, radar.
  fillPolygon([[x + 48, cy - 16], [x + 268, cy - 16], [x + 252, cy], [x + 62, cy]], [70, 80, 90]);
  fillRect(x + 120, cy - 34, 70, 18, [90, 100, 110]);
  line(x + 150, cy - 34, x + 150, cy - 52, 3, [70, 80, 90]);
  line(x + 150, cy - 52, x + 172, cy - 46, 2.4, [70, 80, 90]);
  fillCircle(x + 150, cy - 54, 4, [70, 80, 90]);
  // Drone above, with dashed strike lines.
  const dx = x + 238;
  const dy = y + 26;
  fillCircle(dx, dy, 5, INK);
  for (const [ox, oy] of [[-10, -6], [10, -6], [-10, 6], [10, 6]] as number[][]) {
    line(dx + ox, dy + oy, dx + ox - 5, dy + oy - 3, 1.6, INK);
    line(dx + ox, dy + oy, dx + ox + 5, dy + oy - 3, 1.6, INK);
  }
  for (let i = 0; i < 4; i++) {
    const t0 = 0.15 + i * 0.2;
    const t1 = t0 + 0.1;
    line(dx - (dx - (x + 210)) * t0, dy + (cy - 30 - dy) * t0, dx - (dx - (x + 210)) * t1, dy + (cy - 30 - dy) * t1, 2, RED);
  }
  fillPolygon([[x + 204, cy - 34], [x + 216, cy - 34], [x + 210, cy - 22]], RED);
}

const PANEL_ART = [drawCourthouse, drawTanker, drawWarship];

// ---------------------------------------------------------------------------
// World map (simplified equirectangular continents) with numbered pins
// ---------------------------------------------------------------------------

const CONTINENTS: number[][][] = [
  // North America
  [[-168, 66], [-140, 70], [-125, 72], [-110, 73], [-95, 80], [-85, 76], [-75, 72], [-60, 60], [-55, 47], [-65, 45], [-75, 35], [-80, 25], [-90, 20], [-97, 16], [-105, 20], [-115, 30], [-125, 40], [-125, 50], [-140, 60], [-165, 60]],
  // Greenland
  [[-58, 64], [-45, 60], [-40, 70], [-55, 76], [-65, 74]],
  // South America
  [[-80, 10], [-75, 5], [-60, 5], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -38], [-65, -45], [-70, -55], [-73, -40], [-72, -20], [-80, -5]],
  // Europe
  [[-10, 36], [-9, 43], [0, 46], [-2, 50], [5, 53], [8, 57], [18, 56], [21, 55], [24, 60], [30, 60], [30, 70], [40, 68], [45, 60], [40, 50], [30, 45], [23, 40], [19, 42], [12, 44], [3, 42], [-2, 37]],
  // Africa
  [[-17, 15], [-10, 30], [0, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [48, 0], [40, -10], [35, -20], [32, -28], [20, -35], [15, -30], [12, -18], [9, 4], [-8, 5]],
  // Asia
  [[40, 68], [60, 70], [90, 75], [110, 76], [130, 72], [160, 70], [178, 66], [162, 60], [158, 52], [142, 50], [140, 40], [130, 35], [122, 30], [115, 22], [108, 12], [105, 8], [100, 8], [97, 16], [92, 20], [88, 22], [80, 15], [76, 8], [72, 20], [66, 25], [60, 25], [55, 26], [50, 29], [48, 30], [43, 35], [40, 40]],
  // Australia
  [[113, -22], [114, -30], [120, -34], [130, -32], [140, -38], [150, -37], [153, -27], [146, -19], [142, -11], [135, -12], [130, -13], [122, -14]],
  // Indonesia
  [[95, 5], [105, -5], [115, -8], [125, -8], [135, -5], [140, -8], [140, -2], [125, 2], [110, 4], [100, 5]],
];

// Pin positions: [story number, lon, lat, dx, dy] (dx/dy nudge pins apart).
const PINS: [number, number, number, number, number][] = [
  [1, -74, 41, -9, -8],
  [2, 56, 26, 0, -15],
  [3, 24, 60, 0, 0],
  [4, -75, 10, 0, 0],
  [5, 45, 13, -18, 12],
  [6, 47, 25, 18, -12],
  [7, 30, 40, -15, -11],
  [8, 34, 31, -10, 16],
  [9, 44, 36, 18, 14],
  [10, -73, 4, 0, 0],
  [11, 106, 21, 0, 0],
  [12, 100, 40, 0, -11],
  [13, -77, 39, 11, 11],
];

function drawMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT_BLUE);
  strokeRect(x, y, w, h, NAVY, 1.5);
  const lonToX = (lon: number) => x + ((lon + 170) / 360) * w;
  const latToY = (lat: number) => y + ((75 - lat) / 130) * h;
  for (const cont of CONTINENTS) {
    fillPolygon(cont.map(([lo, la]) => [lonToX(lo), latToY(la)]), MAP_LAND);
    for (let i = 0; i < cont.length; i++) {
      const a = cont[i];
      const b = cont[(i + 1) % cont.length];
      line(lonToX(a[0]), latToY(a[1]), lonToX(b[0]), latToY(b[1]), 1, MAP_LINE);
    }
  }
  for (const [n, lo, la, dx, dy] of PINS) {
    const tx = lonToX(lo);
    const ty = latToY(la);
    const px = tx + dx;
    const py = ty + dy;
    if (dx !== 0 || dy !== 0) line(tx, ty, px, py, 1.2, RED);
    fillCircle(tx, ty, 2.2, RED);
    fillCircle(px, py, 7, RED);
    strokeCircle(px, py, 7, WHITE, 1.4);
    drawText(px, py + 3, String(n), 8, WHITE, { bold: true, align: "center" });
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const M = 22;
const CW = W - 2 * M;

function badgeChip(x: number, y: number, label: string): number {
  const w = textWidth(label, 9, 0.5) + 10;
  const col = label === "CONFIRMED" ? GREEN : label === "OFFICIAL" ? NAVY : RED;
  fillRect(x, y, w, 13, col);
  drawText(x + 5, y + 10, label, 9, WHITE, { bold: true, track: 0.5 });
  return w;
}

function draw(): void {
  fillRect(0, 0, W, H, PAPER);

  // ---- Masthead ----
  fillRect(M, 14, CW, 3, INK);
  fillRect(M, 19, CW, 1, INK);
  drawText(W / 2, 54, "THE WORLD IN ONE DAY", 36, INK, { bold: true, align: "center", track: 1.2 });
  drawText(W / 2, 96, "TUESDAY, 24 NOVEMBER 2026", 38, RED, { bold: true, align: "center", track: 0.8 });
  fillRect(M, 106, CW, 2, INK);
  drawText(W / 2, 124, "35 STORIES  ·  9 REGIONS  ·  EVERY ONE DATED", 13, INK, { bold: true, align: "center", track: 0.6 });

  // ---- Timeline strip ----
  drawText(W / 2, 144, "THE DAY IN UTC — WHEN THE NEWS BROKE", 11, NAVY, { bold: true, align: "center" });
  const lineY = 162;
  line(M + 8, lineY, M + CW - 8, lineY, 2, INK);
  const slot = (CW - 16) / TIMELINE.length;
  TIMELINE.forEach((ev, i) => {
    const cx = M + 8 + slot * (i + 0.5);
    fillCircle(cx, lineY, 4, RED);
    drawText(cx, lineY + 13, ev.t, 11, INK, { bold: true, align: "center" });
    drawText(cx, lineY + 27, ev.label, 8.5, SLATE, { bold: true, align: "center" });
  });

  // ---- Six big-number stats ----
  const stY = 196;
  const stH = 56;
  const stW = (CW - 5 * 8) / 6;
  STATS.forEach((s, i) => {
    const x = M + i * (stW + 8);
    fillRect(x, stY, stW, stH, PAPER2);
    strokeRect(x, stY, stW, stH, INK, 1.2);
    fillRect(x, stY, stW, 3, RED);
    drawText(x + stW / 2, stY + 27, s.big, 24, RED, { bold: true, align: "center" });
    const capLines = wrapText(s.cap, stW - 12, 8.5);
    let cy = stY + 35;
    for (const ln of capLines.slice(0, 2)) {
      drawText(x + stW / 2, cy + 8, ln, 8.5, INK, { bold: true, align: "center" });
      cy += 10;
    }
  });

  // ---- Region bar + legend ----
  const rgY = 262;
  drawText(M, rgY + 10, "WHERE THE NEWS HAPPENED", 11, NAVY, { bold: true });
  drawText(M + CW, rgY + 10, "STORIES BY REGION — TOTAL 35", 11, NAVY, { bold: true, align: "right" });
  const allStories: Story[] = [...PANELS, ...MEDIUM];
  const counts = new Map<string, number>();
  for (const s of allStories) counts.set(s.region, (counts.get(s.region) ?? 0) + 1);
  for (const m of MORE) counts.set(m.region, (counts.get(m.region) ?? 0) + 1);
  const order = ["MIDDLE EAST", "ASIA", "NORTH AMERICA", "EUROPE", "AFRICA", "SOUTH AMERICA", "OCEANIA", "SPACE", "WORLD"];
  let rx = M;
  const barY = rgY + 16;
  const barH = 18;
  for (const r of order) {
    const n = counts.get(r) ?? 0;
    const w = (n / 35) * CW;
    fillRect(rx, barY, w, barH, REGION_COLORS[r]);
    rx += w;
  }
  strokeRect(M, barY, CW, barH, INK, 1.2);
  let lx = M;
  const legY = barY + barH + 14;
  for (const r of order) {
    const n = counts.get(r) ?? 0;
    fillRect(lx, legY - 8, 8, 8, REGION_COLORS[r]);
    lx += 11;
    const lab = `${r} ${n}`;
    drawText(lx, legY, lab, 9, INK, { bold: true });
    lx += textWidth(lab, 9) + 14;
  }

  // ---- Three lead panels ----
  const pY = 334;
  const pH = 204;
  const pW = (CW - 2 * 10) / 3;
  drawText(M, pY - 6, "THE THREE STORIES THAT LED THE DAY", 12, RED, { bold: true });
  drawText(M + CW, pY - 6, "1–3  ·  FULL STORIES BELOW", 11, SLATE, { bold: true, align: "right" });
  PANELS.forEach((s, i) => {
    const x = M + i * (pW + 10);
    const y = pY;
    fillRect(x, y, pW, pH, WHITE);
    strokeRect(x, y, pW, pH, INK, 1.4);
    PANEL_ART[i](x + 6, y + 6, pW - 12, 72);
    const tx = x + 12;
    let cy = y + 72 + 12;
    fillRect(tx, cy - 8, 26, 12, RED);
    drawText(tx + 13, cy + 1, String(s.n), 10, WHITE, { bold: true, align: "center" });
    drawText(tx + 34, cy + 1, s.region, 10, RED, { bold: true });
    cy += 12;
    cy = drawPara(tx, cy, s.headline, 17, pW - 24, INK, true, 1.18);
    cy += 2;
    cy = drawPara(tx, cy, s.summary, 11, pW - 24, [60, 60, 60], false, 1.28);
    const fy = y + pH - 12;
    fillRect(x, fy - 12, pW, 1, SLATE);
    drawText(tx, fy + 1, `${s.badge}  ·  ${s.source}`, 9.5, NAVY, { bold: true });
    drawText(x + pW - 12, fy + 1, s.time, 9.5, SLATE, { bold: true, align: "right" });
  });

  // ---- Ten medium stories ----
  const mY = 558;
  drawText(M, mY - 6, "TEN MORE — NUMBERED, SOURCED, DATED", 12, RED, { bold: true });
  drawText(M + CW, mY - 6, "4–13", 11, SLATE, { bold: true, align: "right" });
  const colW = (CW - 20) / 2;
  const rowH = 52;
  MEDIUM.forEach((s, i) => {
    const col = Math.floor(i / 5);
    const row = i % 5;
    const x = M + col * (colW + 20);
    const y = mY + row * rowH;
    fillCircle(x + 11, y + 11, 11, NAVY);
    drawText(x + 11, y + 15, String(s.n), 12, WHITE, { bold: true, align: "center" });
    const tx = x + 28;
    drawText(tx, y + 14, s.headline, 13.5, INK, { bold: true });
    const chipW = textWidth(s.badge, 9, 0.5) + 10;
    const chipX = x + colW - chipW;
    drawText(tx, y + 32, s.summary, 9.5, [60, 60, 60]);
    drawText(chipX - 8, y + 32, s.source, 9.5, SLATE, { bold: true, align: "right" });
    badgeChip(chipX, y + 21, s.badge);
    if (row < 4) fillRect(x, y + rowH - 5, colW, 1, [200, 192, 172]);
  });

  // ---- 22 more + map ----
  const bY = 834;
  drawText(M, bY - 6, "22 MORE STORIES", 12, RED, { bold: true });
  drawText(M + CW, bY - 6, "14–35  ·  ALL FIRST REPORTED 24 NOVEMBER 2026", 11, SLATE, { bold: true, align: "right" });
  const mapW = 330;
  const listW = CW - mapW - 14;
  const listColW = (listW - 12) / 2;
  const listX0 = M;
  const listY0 = bY;
  MORE.forEach((m, i) => {
    const col = Math.floor(i / 11);
    const row = i % 11;
    const x = listX0 + col * (listColW + 12);
    const y = listY0 + row * 12;
    drawText(x, y + 10, `${m.n}.`, 9.5, RED, { bold: true });
    drawText(x + 20, y + 10, m.text, 9.5, INK);
  });
  const mapX = M + listW + 14;
  const mapY = bY;
  drawMap(mapX, mapY, mapW, 112);
  drawText(mapX, mapY + 126, "WHERE IT HAPPENED — PINS 1–13", 9.5, NAVY, { bold: true });

  // ---- Footer: DATE CHECK box ----
  const fY = 976;
  fillRect(M, fY, CW, 40, [255, 248, 220]);
  strokeRect(M, fY, CW, 40, RED, 1.6);
  drawText(M + 12, fY + 16, "DATE CHECK —", 11, RED, { bold: true });
  drawText(M + 12 + textWidth("DATE CHECK — ", 11, 0) + 4, fY + 16, "Every story above happened, or was first reported, on Tuesday 24 November 2026.", 11, INK, { bold: true });
  drawText(W / 2, fY + 32, "SOURCES: REUTERS · AP · BBC · AL JAZEERA · XINHUA · CONFERENCE BOARD · CHINA MANNED SPACE AGENCY", 9, SLATE, { align: "center", bold: true });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  draw();
  const rgb = downsample();
  const png = encodePNG(W, H, rgb);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} ${png.length} bytes ${W}x${H} sha256=${sha}`);
}

main();

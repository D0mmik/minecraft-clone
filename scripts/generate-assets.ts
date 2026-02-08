#!/usr/bin/env bun
/**
 * Generates favicon.png, apple-touch-icon.png, and og-image.png
 * Run: bun scripts/generate-assets.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// --- PNG encoder ---

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u32(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const crcBuf = new Uint8Array(t.length + data.length);
  crcBuf.set(t); crcBuf.set(data, t.length);
  const len = u32(data.length);
  const crc = u32(crc32(crcBuf));
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(len); out.set(t, 4); out.set(data, 8); out.set(crc, 8 + data.length);
  return out;
}

type RGB = [number, number, number];

function makePNG(w: number, h: number, pixel: (x: number, y: number) => RGB): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const rowLen = 1 + w * 3;
  const raw = new Uint8Array(h * rowLen);
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const off = y * rowLen + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const compressed = deflateSync(Buffer.from(raw));
  const c1 = pngChunk('IHDR', ihdr);
  const c2 = pngChunk('IDAT', new Uint8Array(compressed));
  const c3 = pngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(c1, off); off += c1.length;
  out.set(c2, off); off += c2.length;
  out.set(c3, off);
  return out;
}

// --- Helpers ---

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed) & 0x7fffffff;
  h = ((h >> 13) ^ h) * 1274126177;
  return ((h >> 16) ^ h) & 0xFF;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function darken(c: RGB, f: number): RGB {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}

// --- Colors ---
const GRASS_DARK: RGB = [58, 96, 36];
const GRASS: RGB = [74, 122, 47];
const GRASS_LIGHT: RGB = [107, 155, 61];
const DIRT: RGB = [134, 96, 67];
const DIRT_DARK: RGB = [114, 84, 52];
const DIRT_LIGHT: RGB = [150, 112, 80];
const WOOD: RGB = [107, 83, 55];
const LEAF: RGB = [50, 110, 40];
const LEAF_LIGHT: RGB = [65, 135, 50];
const SKY_TOP: RGB = [135, 206, 235];
const SKY_BOT: RGB = [100, 165, 210];
const STONE: RGB = [128, 128, 128];

function grassPixel(bx: number, by: number): RGB {
  const h = hash(bx, by, 10);
  if (h < 60) return GRASS_DARK;
  if (h < 180) return GRASS;
  return GRASS_LIGHT;
}

function dirtPixel(bx: number, by: number): RGB {
  const h = hash(bx, by, 20);
  if (h < 60) return DIRT_DARK;
  if (h < 200) return DIRT;
  return DIRT_LIGHT;
}

function stonePixel(bx: number, by: number): RGB {
  const h = hash(bx, by, 30);
  const base = 115 + (h % 25);
  return [base, base, base];
}

// --- Generate files ---

mkdirSync('client/public', { recursive: true });

// === 1. Favicon 32x32 ===
const favicon = makePNG(32, 32, (x, y) => {
  if (y < 10) {
    const h = hash(x, y, 1);
    if (h < 60) return GRASS_DARK;
    if (h < 180) return GRASS;
    return GRASS_LIGHT;
  }
  if (y < 13) {
    return hash(x, y, 2) < 128 ? GRASS_DARK : DIRT;
  }
  const h = hash(x, y, 3);
  if (h < 60) return DIRT_DARK;
  if (h < 200) return DIRT;
  return DIRT_LIGHT;
});
writeFileSync('client/public/favicon.png', favicon);
console.log('  favicon.png (32x32)');

// === 2. Apple touch icon 180x180 ===
const icon = makePNG(180, 180, (x, y) => {
  const bx = Math.floor(x / 6);
  const by = Math.floor(y / 6);
  if (by < 10) {
    const h = hash(bx, by, 1);
    if (h < 60) return GRASS_DARK;
    if (h < 180) return GRASS;
    return GRASS_LIGHT;
  }
  if (by < 13) {
    return hash(bx, by, 2) < 128 ? GRASS_DARK : DIRT;
  }
  const h = hash(bx, by, 3);
  if (h < 60) return DIRT_DARK;
  if (h < 200) return DIRT;
  return DIRT_LIGHT;
});
writeFileSync('client/public/apple-touch-icon.png', icon);
console.log('  apple-touch-icon.png (180x180)');

// === 3. OG Image 1200x630 ===
const BS = 20; // block size in pixels

// Terrain height function — rolling hills
function terrainY(px: number): number {
  return 350 + Math.sin(px * 0.006) * 40 + Math.sin(px * 0.018) * 15;
}

// Tree positions (x pixel, terrain snaps to grid)
const trees = [120, 320, 540, 780, 1000];

const ogImage = makePNG(1200, 630, (x, y) => {
  const bx = Math.floor(x / BS);
  const by = Math.floor(y / BS);
  const surfaceY = terrainY(x);

  // --- Trees (drawn over sky and ground) ---
  for (const tx of trees) {
    const treeSurface = terrainY(tx + BS / 2);
    const trunkLeft = tx;
    const trunkRight = tx + BS;
    const trunkTop = treeSurface - 5 * BS;
    // Leaves: 3 blocks wide, 3 blocks tall above trunk
    const leafLeft = tx - BS;
    const leafRight = tx + 2 * BS;
    const leafTop = trunkTop - 2 * BS;
    const leafBot = trunkTop + BS;

    // Leaves
    if (x >= leafLeft && x < leafRight && y >= leafTop && y < leafBot) {
      // Skip corners for rounder shape
      const lbx = Math.floor((x - leafLeft) / BS);
      const lby = Math.floor((y - leafTop) / BS);
      if (lby === 0 && (lbx === 0 || lbx === 2)) continue;
      const h = hash(Math.floor(x / BS), Math.floor(y / BS), 50);
      return h < 120 ? LEAF : LEAF_LIGHT;
    }
    // Trunk
    if (x >= trunkLeft && x < trunkRight && y >= trunkTop && y < treeSurface) {
      return WOOD;
    }
  }

  // --- Ground ---
  if (y >= surfaceY) {
    // Block grid edge darkening
    const edgeX = (x % BS) === 0;
    const edgeY = (y % BS) === 0;
    const edgeDarken = (edgeX || edgeY) ? 0.88 : 1.0;

    if (y < surfaceY + BS) {
      return darken(grassPixel(bx, by), edgeDarken);
    }
    if (y < surfaceY + 5 * BS) {
      return darken(dirtPixel(bx, by), edgeDarken);
    }
    return darken(stonePixel(bx, by), edgeDarken);
  }

  // --- Sky ---
  // Sun
  const sdx = x - 1000, sdy = y - 100;
  if (sdx * sdx + sdy * sdy < 2500) return [255, 236, 145];
  // Sun glow
  if (sdx * sdx + sdy * sdy < 5000) {
    const t = Math.sqrt(sdx * sdx + sdy * sdy) / 70;
    return lerp([255, 240, 170], SKY_TOP, t);
  }

  // Clouds
  const clouds: [number, number, number, number][] = [[250, 80, 90, 28], [600, 130, 70, 22], [900, 60, 50, 18]];
  for (const [cx, cy, rx, ry] of clouds) {
    const cdx = (x - cx) / rx, cdy = (y - cy) / ry;
    if (cdx * cdx + cdy * cdy < 1) return [240, 245, 255];
  }

  // Sky gradient
  const t = y / 360;
  return lerp(SKY_TOP, SKY_BOT, Math.min(t, 1));
});
writeFileSync('client/public/og-image.png', ogImage);
console.log('  og-image.png (1200x630)');

console.log('Done!');

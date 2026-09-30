#!/usr/bin/env node
/**
 * Generates every app icon and splash screen from code — no image tools or
 * native dependencies needed. The artwork mirrors public/icon.svg and is
 * rasterised with signed-distance anti-aliasing, then encoded as PNG.
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs: PWA icons (public/icons), Android launcher icons + splash
 * (android/app/src/main/res), iOS AppIcon + splash (ios/App/App/Assets.xcassets).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');

// ------------------------------------------------------------------ artwork (512-unit space)

/** The snake path from icon.svg, flattened into points. */
function snakePath() {
  const pts = [];
  const line = (x0, y0, x1, y1) => {
    for (let i = 0; i <= 20; i++) pts.push([x0 + ((x1 - x0) * i) / 20, y0 + ((y1 - y0) * i) / 20]);
  };
  const arc = (cx, cy, r, side) => {
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI;
      pts.push([cx + side * r * Math.sin(t), cy + r * Math.cos(t)]);
    }
  };
  line(136, 380, 300, 380);
  arc(300, 328, 52, 1); // U-turn on the right, bottom → top
  line(300, 276, 212, 276);
  arc(212, 224, 52, -1); // U-turn on the left
  line(212, 172, 340, 172);
  return pts;
}
const PATH = snakePath();
const STROKE = 29; // half width

function distToPath(x, y) {
  let best = Infinity;
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1];
    const [bx, by] = PATH[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BG_IN = hex('#241a4a');
const BG_OUT = hex('#07060f');
const BLUE = hex('#1aa7ff');
const MINT = hex('#2bffc6');
const RED = hex('#ff4f7b');
const WHITE = [255, 255, 255];

/**
 * Colour of the artwork at unit coords (u, v) as [r, g, b, a] (a in 0..1).
 * `aa` = size of one pixel in units (for anti-aliasing).
 */
function artwork(u, v, aa, withBackground) {
  let color = [0, 0, 0];
  let alpha = 0;
  const over = (c, a) => {
    if (a <= 0) return;
    const outA = a + alpha * (1 - a);
    color = color.map((ch, i) => (c[i] * a + ch * alpha * (1 - a)) / (outA || 1));
    alpha = outA;
  };
  const cover = (d) => Math.max(0, Math.min(1, 0.5 - d / aa)); // d = signed distance

  if (withBackground) {
    const r = Math.hypot(u - 256, v - 205) / 384;
    over(mix(BG_IN, BG_OUT, Math.min(1, r)), 1);
  }

  // Glow + body.
  const d = distToPath(u, v);
  const gradT = Math.max(0, Math.min(1, (u + (512 - v)) / 700));
  const body = mix(BLUE, MINT, gradT);
  if (d > STROKE) over(body, 0.55 * Math.exp(-((d - STROKE) ** 2) / (2 * 14 ** 2)));
  over(body, cover(d - STROKE));

  // Head, eyes, apple.
  over(MINT, cover(Math.hypot(u - 352, v - 172) - 36));
  over(WHITE, cover(Math.hypot(u - 362, v - 160) - 9));
  over(WHITE, cover(Math.hypot(u - 362, v - 184) - 9));
  const da = Math.hypot(u - 418, v - 172) - 22;
  if (da > 0) over(RED, 0.5 * Math.exp(-(da ** 2) / (2 * 12 ** 2)));
  over(RED, cover(da));
  return [...color, alpha];
}

/**
 * Renders a W×H RGBA image.
 * - `art`: square area {x, y, size} (px) where the 512-unit artwork is drawn
 * - `shape`: 'square' | 'rounded' | 'circle' | 'none' mask for the artwork background
 * - `fill`: optional solid background for the whole image
 */
function render(W, H, { art, shape = 'square', fill = null }) {
  const px = new Uint8Array(W * H * 4);
  const scale = 512 / art.size;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - art.x) * scale;
      const v = (y + 0.5 - art.y) * scale;
      let c = fill ? [...fill, 1] : [0, 0, 0, 0];
      const inside = u >= -40 && v >= -40 && u <= 552 && v <= 552;
      if (inside) {
        let mask = 1;
        if (shape === 'rounded') mask = roundedMask(u, v, scale);
        else if (shape === 'circle') mask = Math.max(0, Math.min(1, 0.5 - (Math.hypot(u - 256, v - 256) - 256) / scale));
        else if (shape === 'square') mask = u >= 0 && v >= 0 && u < 512 && v < 512 ? 1 : 0;
        const a = artwork(u, v, scale, shape !== 'none');
        const alpha = a[3] * (shape === 'none' ? 1 : mask);
        const outA = alpha + c[3] * (1 - alpha);
        c = [0, 1, 2].map((i) => (a[i] * alpha + c[i] * c[3] * (1 - alpha)) / (outA || 1)).concat(outA);
      }
      const o = (y * W + x) * 4;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = Math.round(c[3] * 255);
    }
  }
  return { W, H, px };
}

function roundedMask(u, v, aa) {
  const r = 112;
  const qx = Math.abs(u - 256) - (256 - r);
  const qy = Math.abs(v - 256) - (256 - r);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return Math.max(0, Math.min(1, 0.5 - d / aa));
}

// ------------------------------------------------------------------ PNG encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Encodes RGBA (or RGB when `opaque`, e.g. for the iOS app icon). */
function png({ W, H, px }, opaque = false) {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc((W * ch + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * ch + 1)] = 0;
    for (let x = 0; x < W; x++) {
      for (let i = 0; i < ch; i++) raw[y * (W * ch + 1) + 1 + x * ch + i] = px[(y * W + x) * 4 + i];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngSize(file) {
  const b = readFileSync(file);
  return { W: b.readUInt32BE(16), H: b.readUInt32BE(20) };
}

function write(file, image, opaque = false) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png(image, opaque));
  console.log(`  ${file.replace(ROOT + '/', '')} (${image.W}x${image.H})`);
}

const icon = (size, shape) => render(size, size, { art: { x: 0, y: 0, size }, shape });
const BG = hex('#07060f');

/** Splash: dark background with a centred rounded icon. */
function splash(W, H) {
  const size = Math.round(Math.min(W, H) * 0.28);
  return render(W, H, { art: { x: (W - size) / 2, y: (H - size) / 2, size }, shape: 'rounded', fill: BG });
}

// ------------------------------------------------------------------ outputs

console.log('PWA icons');
write(join(ROOT, 'public/icons/icon-180.png'), icon(180, 'square'), true);
write(join(ROOT, 'public/icons/icon-192.png'), icon(192, 'rounded'));
write(join(ROOT, 'public/icons/icon-512.png'), icon(512, 'square'), true);

const res = join(ROOT, 'android/app/src/main/res');
if (existsSync(res)) {
  console.log('Android');
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    write(join(dir, 'ic_launcher.png'), icon(48 * k, 'rounded'));
    write(join(dir, 'ic_launcher_round.png'), icon(48 * k, 'circle'));
    // Adaptive icon foreground: 108dp canvas, artwork inside the 66dp safe zone.
    const fg = 108 * k;
    const art = Math.round(fg * 0.62);
    write(join(dir, 'ic_launcher_foreground.png'), render(fg, fg, { art: { x: (fg - art) / 2, y: (fg - art) / 2, size: art }, shape: 'none' }));
  }
  writeFileSync(
    join(res, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1A1338</color>\n</resources>\n',
  );
  // Replace every template splash with ours at the same size.
  for (const d of readdirSync(res).filter((n) => n.startsWith('drawable'))) {
    const f = join(res, d, 'splash.png');
    if (existsSync(f)) {
      const { W, H } = pngSize(f);
      write(f, splash(W, H));
    }
  }
}

const xc = join(ROOT, 'ios/App/App/Assets.xcassets');
if (existsSync(xc)) {
  console.log('iOS');
  // App Store icons must be opaque (no alpha); iOS applies the corner mask.
  write(join(xc, 'AppIcon.appiconset/AppIcon-512@2x.png'), icon(1024, 'square'), true);
  const splashDir = join(xc, 'Splash.imageset');
  if (existsSync(splashDir)) {
    for (const f of readdirSync(splashDir).filter((n) => n.endsWith('.png'))) {
      const file = join(splashDir, f);
      if (statSync(file).isFile()) {
        const { W, H } = pngSize(file);
        write(file, splash(W, H), true);
      }
    }
  }
}
console.log('Done.');

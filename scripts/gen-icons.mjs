// Generates PWA icons + iOS splash screens at build time. Pure Node — no deps.
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(w, h, pixel) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GOLD = [245, 196, 81];
const CYAN = [63, 224, 255];
const BG   = [7, 10, 12];

const clamp = t => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t)));

function appIcon(size) {
  const c = size / 2;
  return (x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const r = Math.sqrt(dx * dx + dy * dy) / size;
    let rgb = mix(BG, GOLD, Math.max(0, 1 - r / 0.45) ** 2 * 0.30);
    rgb = mix(rgb, CYAN, Math.max(0, 1 - Math.abs(r - 0.40) / 0.030));
    rgb = mix(rgb, CYAN, Math.max(0, 1 - Math.abs(r - 0.29) / 0.016) * 0.65);
    rgb = mix(rgb, GOLD, clamp((0.15 - r) / 0.03));
    return [...rgb, 255];
  };
}

function badgeIcon(size) {
  const c = size / 2;
  return (x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const r = Math.sqrt(dx * dx + dy * dy) / size;
    const ring = Math.max(0, 1 - Math.abs(r - 0.34) / 0.06);
    const core = clamp((0.16 - r) / 0.04);
    const a = Math.round(255 * Math.max(ring, core));
    return [255, 255, 255, a];
  };
}

function splashPixel(w, h) {
  const cx = w / 2, cy = h * 0.42;
  const sz = Math.min(w, h) * 0.44;
  return (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const r = Math.sqrt(dx * dx + dy * dy) / sz;
    if (r > 0.47) return [...BG, 255];
    let rgb = mix(BG, GOLD, Math.max(0, 1 - r / 0.45) ** 2 * 0.30);
    rgb = mix(rgb, CYAN, Math.max(0, 1 - Math.abs(r - 0.40) / 0.030));
    rgb = mix(rgb, CYAN, Math.max(0, 1 - Math.abs(r - 0.29) / 0.016) * 0.65);
    rgb = mix(rgb, GOLD, clamp((0.15 - r) / 0.03));
    return [...rgb, 255];
  };
}

// --- Icons (always generated first, never skipped) ---
for (const s of [180, 192, 512]) writeFileSync(join(OUT, `icon-${s}.png`), makePng(s, s, appIcon(s)));
writeFileSync(join(OUT, 'badge-96.png'), makePng(96, 96, badgeIcon(96)));
console.log('icons written to public/icons/');

// --- Splash screens (isolated so failures cannot affect icons above) ---
// iPhone SE 2/3 · XR/11 · X/XS/11Pro/12mini/13mini · 12/13/14 · 11ProMax/XSMax · 12/13/14ProMax · 14Pro/15/15Pro · 14ProMax/15Plus/15ProMax
const SPLASHES = [
  [750,  1334],
  [828,  1792],
  [1125, 2436],
  [1170, 2532],
  [1242, 2688],
  [1284, 2778],
  [1179, 2556],
  [1290, 2796],
];

try {
  for (const [w, h] of SPLASHES) {
    writeFileSync(join(OUT, `splash-${w}x${h}.png`), makePng(w, h, splashPixel(w, h)));
  }
  console.log('splash screens written to public/icons/');
} catch (e) {
  console.warn('splash generation failed (non-fatal):', e.message);
}

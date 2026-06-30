/**
 * Generates PWA icon PNGs in public/icons/ using only Node.js built-ins.
 * Run: node scripts/gen-icons.js
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// Spark polygon vertices defined in a 120×120 viewBox (from SparkLogo.jsx)
const SPARK_120 = [
  [60,8],[66,48],[100,28],[72,54],[112,60],[72,66],
  [100,92],[66,72],[60,112],[54,72],[20,92],[48,66],
  [8,60],[48,54],[20,28],[54,48],
];

// Even-odd point-in-polygon
function pip(x, y, verts) {
  let inside = false;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i][0], yi = verts[i][1];
    const xj = verts[j][0], yj = verts[j][1];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

// Gradient stops: Blue → Purple → Red → Amber → Green → Blue (by angle 0…2π)
const STOPS = [
  [0.00, [59,130,246]],
  [0.20, [168,85,247]],
  [0.40, [239,68,68]],
  [0.60, [245,158,11]],
  [0.80, [34,197,94]],
  [1.00, [59,130,246]],
];

function angleColor(angle) {
  const t = ((angle + Math.PI) / (2 * Math.PI)); // 0…1
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const s = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], s), lerp(c0[1], c1[1], s), lerp(c0[2], c1[2], s)];
    }
  }
  return [59, 130, 246];
}

function pixelColor(px, py, verts, size) {
  const cx = size / 2, cy = size / 2;
  const angle = Math.atan2(py - cy, px - cx);
  const col = angleColor(angle);

  // Spark outline glow (anti-alias via soft distance from polygon boundary)
  if (pip(px, py, verts)) return col;

  // Inner circle fill
  const d = Math.hypot(px - cx, py - cy);
  const r = size * (10 / 120);
  if (d < r) return col;

  // Dark background
  return [24, 24, 27];
}

// CRC32 table (PNG requirement)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size, pixFn) {
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const [r,g,b] = pixFn(x, y);
      row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([sig, pngChunk('IHDR',ihdr), pngChunk('IDAT',idat), pngChunk('IEND',Buffer.alloc(0))]);
}

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

for (const [sz, name] of [[96,'badge-96'], [192,'icon-192'], [512,'icon-512']]) {
  const scale = sz / 120;
  const verts = SPARK_120.map(([x,y]) => [x * scale, y * scale]);
  const buf = makePNG(sz, (px, py) => pixelColor(px, py, verts, sz));
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, buf);
  console.log(`✓ ${name}.png  ${(buf.length/1024).toFixed(1)} KB`);
}
// Also copy icon-192 as apple-touch-icon (180×180 will re-scale in browser)
const icon192 = fs.readFileSync(path.join(OUT, 'icon-192.png'));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), icon192);
console.log('✓ apple-touch-icon.png (alias of icon-192)');

/**
 * Generates all PWA icons + iOS splash screens from public/favicon.svg
 * Run: node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'public', 'icons');
const SVG  = readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8');

mkdirSync(OUT, { recursive: true });

function renderAt(size) {
  const resvg = new Resvg(SVG, {
    fitTo: { mode: 'width', value: size },
    font:  { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

// Build a splash SVG: solid black + centered logo + wordmark
function splashSvg(w, h) {
  const logoSize = Math.round(Math.min(w, h) * 0.28);
  const lx       = Math.round((w - logoSize) / 2);
  const ly       = Math.round(h * 0.34);
  const fontSize = Math.round(logoSize * 0.11);
  const spacing  = Math.round(logoSize * 0.022);
  const ty       = ly + logoSize + Math.round(logoSize * 0.18);

  // Strip outer <svg …> tag so we can embed the artwork as a group
  const inner = SVG
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#080808"/>
  <g transform="translate(${lx},${ly}) scale(${(logoSize / 512).toFixed(6)})">
    ${inner}
  </g>
  <text x="${w / 2}" y="${ty}"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${fontSize}"
    letter-spacing="${spacing}"
    fill="rgba(201,168,76,0.52)">THE COUNCIL</text>
</svg>`;
}

function renderSplash(w, h) {
  const resvg = new Resvg(splashSvg(w, h), {
    fitTo: { mode: 'original' },
    font:  { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

// ── App icons ──
for (const size of [180, 192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), renderAt(size));
  console.log(`✓  icon-${size}.png`);
}

// Badge (monochrome, used for notifications on some platforms)
writeFileSync(join(OUT, 'badge-96.png'), renderAt(96));
console.log('✓  badge-96.png');

// ── Splash screens ──
const SPLASHES = [
  [750, 1334], [828, 1792], [1125, 2436], [1170, 2532],
  [1242, 2688], [1284, 2778], [1179, 2556], [1290, 2796],
];
for (const [w, h] of SPLASHES) {
  writeFileSync(join(OUT, `splash-${w}x${h}.png`), renderSplash(w, h));
  console.log(`✓  splash-${w}x${h}.png`);
}

console.log('\nAll icons written to public/icons/');

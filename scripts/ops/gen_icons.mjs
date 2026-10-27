// Regenerates the PWA icon set from the single source of truth, `src/app/icon.png`.
//
//   pnpm exec node scripts/ops/gen_icons.mjs
//
// The 192 and 512 "any" icons are the artwork as authored, only rescaled.
//
// The maskable variant is NOT a redraw either. The artwork is a blue rounded square carrying a
// thin white keyline on its own edge; that keyline is what makes the frame read as a sticker, and
// it is also what would leave two white arcs floating in a maskable field. So the generator crops
// inside the keyline and composites that crop, scaled down, onto a solid field of the artwork's
// own background colour: the crop's blue disappears into the field and only the mark remains.
// The scale comes from the mark's own bounding box, chosen so the box fits inside the square
// inscribed in the 80% safe circle, which makes "no mark pixel outside the safe zone" true by
// construction rather than by eyeballing.
//
// Every assumption is then re-checked in pixels against the file that was actually written:
// a keyline-free crop boundary, and a mark that stays inside the safe circle.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = resolve(ROOT, 'src/app/icon.png');
const OUT_DIR = resolve(ROOT, 'public/icons');

// The OS clips a maskable icon to a circle whose diameter is 80% of the canvas, so everything
// the user must see has to fit the largest square inscribed in that circle.
const SAFE_DIAMETER_RATIO = 0.8;
// Headroom so anti-aliased edge pixels cannot land exactly on the clip boundary.
const SAFE_MARGIN = 0.96;
// A pixel is part of the mark when it is far enough from the flat background colour.
const MARK_COLOR_DISTANCE = 60;
// How much of the artwork edge to drop so the white keyline is gone. In the current artwork the
// keyline reaches 26px inward from the edge and the mark itself starts 70px in, so 32 sits
// between the two. The boundary check below fails the run if either number drifts, instead of
// silently shipping a keyline arc in the field or a clipped donkey.
const KEYLINE_INSET = 32;

function distanceTo(color, pixel) {
  return Math.abs(color[0] - pixel[0]) + Math.abs(color[1] - pixel[1]) + Math.abs(color[2] - pixel[2]);
}

function isMark(pixel, field) {
  return pixel[3] === 255 && distanceTo(field, pixel) > MARK_COLOR_DISTANCE;
}

function pixel(raw, info, x, y) {
  return raw.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4);
}

/** The flat background colour: the most common fully opaque pixel. */
function fieldColor(raw, info) {
  const counts = new Map();
  for (let i = 0; i < info.width * info.height; i += 1) {
    const pixel = raw.subarray(i * 4, i * 4 + 4);
    if (pixel[3] !== 255) continue;
    const key = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return [(key >> 16) & 255, (key >> 8) & 255, key & 255];
}

/** Bounding box of the mark, i.e. of the opaque pixels that are not background. */
function markBounds(raw, info, field) {
  const box = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isMark(pixel(raw, info, x, y), field)) continue;
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
  }
  if (box.maxX < 0) throw new Error('no mark pixels found in the source icon');
  return { ...box, width: box.maxX - box.minX + 1, height: box.maxY - box.minY + 1 };
}

/** Count mark pixels in the outer `band` pixels of the frame; proves the keyline is gone. */
function edgeMarkCount(raw, info, field, band) {
  let count = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const onEdge = x < band || y < band || x >= info.width - band || y >= info.height - band;
      if (onEdge && isMark(pixel(raw, info, x, y), field)) count += 1;
    }
  }
  return count;
}

/** Furthest mark pixel from the centre, measured on a finished file. */
function markExtent(path, field) {
  return readFile(path).then(async (buffer) => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cx = (info.width - 1) / 2;
    const cy = (info.height - 1) / 2;
    let worst = 0;
    let offenders = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        // The composited artwork feathers into an opaque field, so anything not background here
        // is visible artwork, including its anti-aliased halo.
        if (distanceTo(field, pixel(data, info, x, y)) <= MARK_COLOR_DISTANCE) continue;
        const radius = Math.hypot(x - cx, y - cy);
        if (radius > (info.width * SAFE_DIAMETER_RATIO) / 2) offenders += 1;
        worst = Math.max(worst, radius);
      }
    }
    return { safeRadius: (info.width * SAFE_DIAMETER_RATIO) / 2, worst, offenders };
  });
}

const source = await readFile(SOURCE);
const { info: sourceInfo, data: sourceRaw } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (sourceInfo.width !== sourceInfo.height) throw new Error('the source icon must be square');
const field = fieldColor(sourceRaw, sourceInfo);
const hex = `#${field.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

await mkdir(OUT_DIR, { recursive: true });
const written = [];

// Plain icons: the artwork exactly as authored.
for (const size of [192, 512]) {
  const png = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const path = resolve(OUT_DIR, `icon-${size}.png`);
  await writeFile(path, png);
  written.push(path);
}

// Maskable: the keyline-free interior, scaled into the safe circle of a solid field.
const cropSize = sourceInfo.width - KEYLINE_INSET * 2;
const crop = await sharp(source).extract({ left: KEYLINE_INSET, top: KEYLINE_INSET, width: cropSize, height: cropSize }).toBuffer();
const { info: cropInfo, data: cropRaw } = await sharp(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const strayKeyline = edgeMarkCount(cropRaw, cropInfo, field, 3);
if (strayKeyline > 0) {
  throw new Error(`the crop carries artwork within 3px of its edge (${strayKeyline} pixels): either the keyline is still inside, so raise KEYLINE_INSET, or the mark is being cut, so lower it`);
}

const bounds = markBounds(cropRaw, cropInfo, field);
const maskableSize = 512;
const safeSide = ((maskableSize * SAFE_DIAMETER_RATIO) / Math.SQRT2) * SAFE_MARGIN;
const scale = Math.min(1, safeSide / Math.max(bounds.width, bounds.height));
const artworkSize = Math.round(cropSize * scale);
const artwork = await sharp(crop).resize(artworkSize, artworkSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
// Centre the mark, not the crop: the artwork is not optically centred on its own canvas.
const left = Math.round(maskableSize / 2 - (bounds.minX + bounds.width / 2) * scale);
const top = Math.round(maskableSize / 2 - (bounds.minY + bounds.height / 2) * scale);
const maskable = await sharp({
  create: { width: maskableSize, height: maskableSize, channels: 4, background: { r: field[0], g: field[1], b: field[2], alpha: 1 } },
}).composite([{ input: artwork, left, top, premultiply: true }]).png({ compressionLevel: 9 }).toBuffer();
const maskablePath = resolve(OUT_DIR, 'icon-maskable-512.png');
await writeFile(maskablePath, maskable);
written.push(maskablePath);

const extent = await markExtent(maskablePath, field);
if (extent.offenders > 0) throw new Error(`maskable artwork leaks past the safe circle (${extent.offenders} pixels)`);

console.log(`source ${sourceInfo.width}px field ${hex} crop ${cropSize}px mark ${bounds.width}x${bounds.height}`);
console.log(`maskable artwork ${artworkSize}px at ${left},${top} scale ${scale.toFixed(3)}`);
console.log(`safe radius ${extent.safeRadius.toFixed(1)}px, furthest artwork pixel ${extent.worst.toFixed(1)}px`);
for (const path of written) console.log(relative(ROOT, path).replaceAll('\\', '/'));
console.log('OK');

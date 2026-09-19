/**
 * Renders a *take* offline: one contact sheet per clip with the real timeline
 * evaluation, the real framing maths, and the same shutter integration the GPU
 * path performs (N sub-frames averaged) so the motion blur can be eyeballed
 * without a browser.
 *
 *   npm run render:take                     -> orbit, William/Bodoni
 *   npm run render:take -- pushIn Sofia     -> clip + name
 *   npm run render:take -- orbit William 3   -> samples per frame (motion blur)
 *
 * PNGs land in `tools/out/take-<clip>.png`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

// `softrender.mjs` reads the DOM-free scene bundle: rebuild it so this script
// works on its own, without having to run `verify:scene` first.
execFileSync(
  path.join(repo, 'node_modules/esbuild/bin/esbuild'),
  [
    path.join(repo, 'src/jewelry/index.ts'),
    '--bundle',
    '--format=esm',
    '--platform=neutral',
    '--target=es2022',
    '--packages=external',
    '--loader:.json=json',
    `--outfile=${path.join(outDir, 'jewelry.bundle.mjs')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

const { renderScene, API, THREE } = await import('./softrender.mjs');

const clipId = process.argv[2] ?? 'orbit';
const name = process.argv[3] ?? 'William';
const fontId = process.argv[4] ?? 'bodoni';
const samples = Number(process.argv[5] ?? 3);
const fps = 30;
const TILES = 6;
const aspect = 16 / 9;
const tileWidth = 640;
const tileHeight = Math.round(tileWidth / aspect);
const gutter = 6;

/* ------------------------------------------------------------------ *
 * Scena: stessa costruzione dell'app
 * ------------------------------------------------------------------ */
const materials = API.createMaterialLibrary();
const assembly = API.buildJewelryPiece(materials);
assembly.setText(
  API.getFont(fontId),
  { text: name, uppercase: false, tracking: 0.02, depth: 0.34, scale: 1 },
  API.findQuality('standard')
);

const clip = API.findClip(clipId);
const compiled = API.compileClip(clip);
const frames = API.frameCountOf(clip, fps);
const shutter = API.shutterSpan(fps, 180); // 180°: mezzo fotogramma, come al cinema

/* ------------------------------------------------------------------ *
 * PNG helper (RGBA, così le tile possono avere un bordo)
 * ------------------------------------------------------------------ */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const encodeRgb = (width, height, rgb) => {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* ------------------------------------------------------------------ *
 * Un fotogramma: `samples` sub-frame sommati lungo l'otturatore
 * ------------------------------------------------------------------ */
const renderFrame = (time) => {
  const accumulated = Buffer.alloc(tileWidth * tileHeight * 3, 0);
  const count = Math.max(1, samples);

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? time : time - shutter / 2 + (shutter * i) / (count - 1);
    const rig = API.evaluateClip(compiled, Math.max(0, t));

    const fov = API.computeFramingFov(aspect, rig.fit);
    const distance = API.computeViewDistance(fov, aspect, rig.fit);
    const position = rig.target.clone().addScaledVector(rig.direction, distance);

    // il piatto girevole ruota l'assieme, non la camera
    assembly.group.rotation.y = THREE.MathUtils.degToRad(rig.spin);
    assembly.group.position.y = 0;

    const { rgb } = renderScene(assembly.group, {
      width: tileWidth,
      height: tileHeight,
      position: position.toArray(),
      target: rig.target.toArray(),
      fov,
      pixelRatio: 1,
    });

    for (let p = 0; p < accumulated.length; p += 3) {
      accumulated[p] += rgb[p] / count;
      accumulated[p + 1] += rgb[p + 1] / count;
      accumulated[p + 2] += rgb[p + 2] / count;
    }
  }

  return accumulated;
};

/* ------------------------------------------------------------------ *
 * Contact sheet
 * ------------------------------------------------------------------ */
const columns = TILES;
const rows = Math.ceil(TILES / columns) || 1;
const sheetWidth = columns * tileWidth + (columns + 1) * gutter;
const sheetHeight = rows * tileHeight + (rows + 1) * gutter;
const sheet = Buffer.alloc(sheetWidth * sheetHeight * 3, 12);

const started = Date.now();
for (let tileIndex = 0; tileIndex < TILES; tileIndex++) {
  const time = (clip.duration * tileIndex) / (TILES - 1 || 1);
  const frameIndex = Math.min(frames - 1, Math.round(time * fps));
  const frame = renderFrame(frameIndex / fps);

  const column = tileIndex % columns;
  const row = Math.floor(tileIndex / columns);
  const originX = gutter + column * (tileWidth + gutter);
  const originY = gutter + row * (tileHeight + gutter);

  for (let y = 0; y < tileHeight; y++) {
    const from = y * tileWidth * 3;
    const to = ((originY + y) * sheetWidth + originX) * 3;
    frame.copy(sheet, to, from, from + tileWidth * 3);
  }

  const rig = API.evaluateClip(compiled, time);
  console.log(
    `  tile ${tileIndex + 1}/${TILES} · t ${time.toFixed(2)}s · fotogramma ${frameIndex + 1}/${frames} · ` +
      `spin ${rig.spin.toFixed(0)}° · luce ×${rig.lightScale.toFixed(2)}`
  );
}

const file = path.join(outDir, `take-${clip.id}.png`);
fs.writeFileSync(file, encodeRgb(sheetWidth, sheetHeight, sheet));
console.log(
  `${path.basename(file)}: ${TILES} fotogrammi di "${clip.label}" (${clip.duration}s a ${fps} fps, ` +
    `${samples} sub-frame per fotogramma) in ${((Date.now() - started) / 1000).toFixed(1)}s`
);

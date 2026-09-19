/**
 * Renders the assembly from every camera preset with the offline software
 * renderer, using exactly the same framing maths as the app
 * (`src/jewelry/cameraFraming.ts`).
 *
 *   npm run render:views            -> William, Bodoni
 *   npm run render:views -- Sofia cinzel
 *
 * PNGs land in `tools/out/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScene, API, THREE } from './softrender.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const name = process.argv[2] ?? 'William';
const fontId = process.argv[3] ?? 'bodoni';
const aspect = 16 / 9;
const pixelRatio = 1;

const materials = API.createMaterialLibrary();
const assembly = API.buildJewelryPiece(materials);
assembly.setText(
  API.getFont(fontId),
  { text: name, uppercase: false, tracking: 0.02, depth: 0.34, scale: 1 },
  API.findQuality('standard')
);

const heroFit = API.findCameraView('hero').fit;
const fov = API.computeFramingFov(aspect, heroFit);

for (const view of API.CAMERA_VIEWS) {
  const target = new THREE.Vector3(...view.target);
  const direction = new THREE.Vector3(...view.direction).normalize();
  const distance = API.computeViewDistance(fov, aspect, view.fit);
  const position = target.clone().addScaledVector(direction, distance);

  const { png, stats } = renderScene(assembly.group, {
    width: 1440,
    height: Math.round(1440 / aspect),
    position: position.toArray(),
    target: target.toArray(),
    fov,
    pixelRatio,
  });
  const file = path.join(outDir, `${name}-${fontId}-${view.id}.png`);
  fs.writeFileSync(file, png);
  console.log(
    `${path.basename(file)}: fov ${fov.toFixed(1)}°, d ${distance.toFixed(1)} u, ${stats.triangles} tri`
  );
}

/**
 * Offline QA harness for the jewellery scene.
 *
 *   npm run verify:scene
 *
 * It bundles the DOM-free scene modules with esbuild (three stays external),
 * then checks:
 *   - gemstone faceting (every facet must be wound and oriented outwards),
 *   - the text pipeline for arbitrary names, fonts and quality presets,
 *   - the layout of the assembly (pave on the bezel band, chain links not
 *     interpenetrating, name inside the plate window),
 * and finally rasterises the real geometry with the tiny software renderer in
 * `softrender.mjs`, writing PNGs to `tools/out/` for visual inspection.
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

/* ------------------------------------------------------------------ *
 * 1. bundle the scene modules (three stays external, resolved by node)
 * ------------------------------------------------------------------ */
const bundlePath = path.join(outDir, 'jewelry.bundle.mjs');
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
    `--outfile=${bundlePath}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

const THREE = await import(path.join(repo, 'node_modules/three/build/three.module.js'));
const API = await import(bundlePath);

/* ------------------------------------------------------------------ *
 * 2. checks
 * ------------------------------------------------------------------ */
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const outwardScore = (geometry, center = new THREE.Vector3(0, 0, 0)) => {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const stored = new THREE.Vector3();
  let good = 0;
  let total = 0;

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    centroid.copy(a).add(b).add(c).divideScalar(3);
    const outward = centroid.clone().sub(center);
    if (outward.lengthSq() < 1e-9) continue;

    faceNormal.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    stored.fromBufferAttribute(normal, i).normalize();

    total += 1;
    // consistent winding AND facing away from the gem centre
    if (faceNormal.dot(stored) > 0.5 && stored.dot(outward.normalize()) > 0) good += 1;
  }

  return { ratio: total ? good / total : 0, total };
};

const hasNaN = (geometry) => {
  const array = geometry.attributes.position.array;
  for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) return true;
  return false;
};

console.log('\n=== Gemstone faceting ===');
for (const [label, geometry] of [
  ['round brilliant r=0.18', API.createRoundBrilliantGeometry(0.18, 1)],
  ['round brilliant r=0.26', API.createRoundBrilliantGeometry(0.26, 1)],
  ['baguette 0.3x0.3x1.15', API.createBaguetteCutGeometry(0.3, 0.3, 1.15)],
]) {
  const { ratio, total } = outwardScore(geometry);
  check(`${label}: facce orientate verso l'esterno`, ratio > 0.999, `${(ratio * 100).toFixed(1)}% su ${total} facce`);
  check(`${label}: nessun NaN`, !hasNaN(geometry));
}

console.log('\n=== Assembly ===');
const materials = API.createMaterialLibrary();
const assembly = API.buildJewelryPiece(materials);
check('assemblaggio creato', assembly.group.children.length > 0, `${assembly.stones} pietre`);

const textChecks = [
  ['William', 'bodoni'],
  ['Sofia', 'bodoni'],
  ['Niccolò', 'cormorant'],
  ['José-María', 'cinzel'],
  ['ANNALISA', 'cinzel'],
  ['ÈLODIE', 'bodoni'],
  ['Ludovica', 'cormorant'],
  ['D\'Angelo', 'bodoni'],
  ['<script>', 'bodoni'],
  ['', 'bodoni'],
];
for (const [text, fontId] of textChecks) {
  const font = API.getFont(fontId);
  const fit = assembly.setText(
    font,
    { text, uppercase: false, tracking: 0.02, depth: 0.34, scale: 1 },
    API.findQuality('standard')
  );
  const expected = text.trim().length === 0 ? 0 : 1;
  const fits = fit.width <= assembly.dimensions.innerWidth && fit.height <= assembly.dimensions.innerHeight;
  check(
    `testo "${text || '(vuoto)'}" [${fontId}]`,
    fit.visible === Boolean(expected) && (fit.visible ? fits && fit.size > 0 : true),
    fit.visible
      ? `size=${fit.size.toFixed(2)} ${fit.width.toFixed(2)}×${fit.height.toFixed(2)} (finestra ${assembly.dimensions.innerWidth}×${assembly.dimensions.innerHeight})`
      : 'nessun glifo'
  );
}

// the old font only contained W, i, l, a, m: make sure every Latin letter works
const missing = [];
for (const fontId of API.FONT_IDS) {
  const font = API.getFont(fontId);
  const fit = assembly.setText(
    font,
    {
      text: 'abcdefghijklmnopqrstuvwxyz0123456789',
      uppercase: false,
      tracking: 0,
      depth: 0.3,
      scale: 1,
    },
    API.findQuality('draft')
  );
  if (fit.dropped.length) missing.push(`${fontId}: ${fit.dropped.join('')}`);
}
check('copertura alfabeto completo su tutti i font', missing.length === 0, missing.join(' | '));

/* ------------------------------------------------------------------ *
 * 2b. layout / interpenetration checks
 * ------------------------------------------------------------------ */
console.log('\n=== Layout ===');

const { dimensions } = assembly;
const boxOf = (mesh) => {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
};
assembly.group.updateMatrixWorld(true);

const instanceMesh = (name) => {
  let found = null;
  assembly.group.traverse((child) => {
    if (child.name === name) found = child;
  });
  return found;
};

// pavé ring: every stone has to sit on the bezel band, none inside the window
const paveMesh = instanceMesh('PaveStones');
const paveMatrix = new THREE.Matrix4();
const pavePoint = new THREE.Vector3();
const halfWinW = dimensions.innerWidth / 2;
const halfWinH = dimensions.innerHeight / 2;
const bandOffset = dimensions.bezelBorder / 2;
const cornerR = dimensions.cornerRadius * 0.8;
const bandHalfW = halfWinW + bandOffset;
const bandHalfH = halfWinH + bandOffset;
let paveOnBand = 0;
let paveWorstGap = 0;
let paveInWindow = 0;
for (let i = 0; i < paveMesh.count; i++) {
  paveMesh.getMatrixAt(i, paveMatrix);
  pavePoint.setFromMatrixPosition(paveMatrix);
  const dx = Math.abs(pavePoint.x);
  const dy = Math.abs(pavePoint.y);
  const straightW = bandHalfW - cornerR;
  const straightH = bandHalfH - cornerR;
  const inCorner = dx > straightW && dy > straightH;
  const gap = inCorner
    ? Math.abs(Math.hypot(dx - straightW, dy - straightH) - cornerR)
    : Math.min(Math.abs(dx - bandHalfW), Math.abs(dy - bandHalfH));
  paveWorstGap = Math.max(paveWorstGap, gap);
  if (gap < 0.05) paveOnBand += 1;
  if (dx < halfWinW + 0.06 && dy < halfWinH + 0.06) paveInWindow += 1;
}
check(
  'pave allineato sulla fascia del castone',
  paveOnBand === paveMesh.count && paveInWindow === 0,
  `${paveOnBand}/${paveMesh.count} pietre in linea, scostamento max ${paveWorstGap.toFixed(3)} u, ${paveInWindow} nella finestra`
);

// chain links: consecutive links must not interpenetrate
const linkPositions = [];
assembly.group.traverse((child) => {
  if (child.isMesh && child.parent?.name === 'BailAndChain' && child.geometry.type === 'TorusGeometry') {
    linkPositions.push(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld));
  }
});
let linkOverlaps = 0;
let minSpacing = Infinity;
for (let i = 0; i < linkPositions.length; i++) {
  for (let j = i + 1; j < linkPositions.length; j++) {
    const distance = linkPositions[i].distanceTo(linkPositions[j]);
    if (distance < minSpacing) minSpacing = distance;
    if (distance < 0.3) linkOverlaps += 1;
  }
}
check(
  'maglia cubana senza anelli sovrapposti',
  linkOverlaps === 0,
  `${linkPositions.length} anelli, ${linkOverlaps} sovrapposti, passo minimo ${minSpacing.toFixed(3)} u`
);

// nameplate text inside the bezel window
const textBox = boxOf(assembly.textMesh);
check(
  'nome contenuto nella finestra del castone',
  textBox.min.x > -halfWinW - 0.25 &&
    textBox.max.x < halfWinW + 0.25 &&
    textBox.min.y > -halfWinH - 0.25 &&
    textBox.max.y < halfWinH + 0.25,
  `x ${textBox.min.x.toFixed(2)}..${textBox.max.x.toFixed(2)} (limite +-${halfWinW.toFixed(2)}), y ${textBox.min.y.toFixed(2)}..${textBox.max.y.toFixed(2)}`
);

// solitaires vs baguettes: no interpenetration
const solitaires = [];
const baguettes = [];
assembly.group.traverse((child) => {
  if (!child.isMesh) return;
  if (child.material === materials.accentGem) baguettes.push(boxOf(child));
  else if (child.material === materials.gem && !child.isInstancedMesh) {
    const box = boxOf(child);
    const size = box.getSize(new THREE.Vector3());
    if (size.x > 0.4) solitaires.push(box);
  }
});
check(
  'solitari e baguette non collidono',
  solitaires.every((s) => baguettes.every((b) => !s.intersectsBox(b))),
  `${solitaires.length} solitari, ${baguettes.length} baguette`
);

const { renderScene } = await import('./softrender.mjs');

/* ------------------------------------------------------------------ *
 * 4. renders
 * ------------------------------------------------------------------ */
console.log('\n=== Software renders ===');
const renderJobs = [
  ['hero', { position: [2.05, 1.35, 7.4] }],
  ['front', { position: [0, 0.1, 7.2] }],
  ['macro', { position: [0.35, 0.2, 3.2] }],
  ['top', { position: [0, 7.0, 2.6] }],
];

for (const fontId of ['bodoni', 'cinzel', 'cormorant']) {
  for (const name of ['William', 'Sofia', 'Ginevra']) {
    const font = API.getFont(fontId);
    assembly.setText(
      font,
      { text: name, uppercase: false, tracking: 0.02, depth: 0.34, scale: 1 },
      API.findQuality('standard')
    );
    const [view, options] = renderJobs[0];
    const { png, stats } = renderScene(assembly.group, options);
    const file = path.join(outDir, `${fontId}-${name}-${view}.png`);
    fs.writeFileSync(file, png);
    console.log(`  wrote ${path.basename(file)} (${stats.triangles} triangles drawn)`);
  }
}

// all views for the default name
assembly.setText(
  API.getFont('bodoni'),
  { text: 'William', uppercase: false, tracking: 0.02, depth: 0.34, scale: 1 },
  API.findQuality('standard')
);
for (const [view, options] of renderJobs) {
  const { png, stats } = renderScene(assembly.group, options);
  fs.writeFileSync(path.join(outDir, `views-${view}.png`), png);
  console.log(`  wrote views-${view}.png (${stats.triangles} triangles drawn, ${stats.backFacing} culled)`);
}

console.log('\n=== Summary ===');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  failed.forEach((f) => console.log(`  FAIL ${f.name} ${f.detail}`));
  process.exitCode = 1;
}

import * as THREE from 'three';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBaguetteCutGeometry,
  createBeadGeometry,
  createProngGeometry,
  createRoundBrilliantGeometry,
} from './gemstoneGeometry';
import type { MaterialLibrary } from './materials';
import type { QualityPreset } from './types';

export interface JewelryDimensions {
  innerWidth: number;
  innerHeight: number;
  bezelBorder: number;
  outerWidth: number;
  outerHeight: number;
  plateDepth: number;
  cornerRadius: number;
}

export interface TextFitResult {
  text: string;
  /** size actually used for the extrusion */
  size: number;
  width: number;
  height: number;
  /** characters dropped because the typeface has no glyph for them */
  dropped: string[];
  visible: boolean;
}

export interface TextOptions {
  text: string;
  uppercase: boolean;
  tracking: number;
  depth: number;
  /** user multiplier on top of the automatic fit-to-plate size */
  scale: number;
}

export interface JewelryAssembly {
  group: THREE.Group;
  dimensions: JewelryDimensions;
  textMesh: THREE.Mesh | null;
  setText: (font: Font, options: TextOptions, quality: QualityPreset) => TextFitResult;
  setNameplateMaterial: (source: 'metal' | 'gem') => void;
  cycleNameplateMaterial: () => 'metal' | 'gem';
  nameplateMaterial: () => 'metal' | 'gem';
  raycastTargets: THREE.Object3D[];
  stones: number;
  dispose: () => void;
}

/** Rounded rectangle outline used for the plate and the pavé path. */
function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const radius = Math.min(r, Math.min(w, h) / 2 - 0.001);
  shape.moveTo(x + radius, y);
  shape.lineTo(x + w - radius, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + radius);
  shape.lineTo(x + w, y + h - radius);
  shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  shape.lineTo(x + radius, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** Evenly distributes points along a rounded rectangle (arc-length walk). */
function walkRoundedRect(
  w: number,
  h: number,
  r: number,
  spacing: number
): { x: number; y: number; angle: number }[] {
  const radius = Math.min(r, Math.min(w, h) / 2 - 0.001);
  const straightW = w - radius * 2;
  const straightH = h - radius * 2;
  const corner = (Math.PI / 2) * radius;
  const perimeter = straightW * 2 + straightH * 2 + corner * 4;
  const count = Math.max(4, Math.round(perimeter / spacing));
  const step = perimeter / count;
  const points: { x: number; y: number; angle: number }[] = [];

  for (let i = 0; i < count; i++) {
    let d = i * step;
    let x = 0;
    let y = 0;
    let angle = 0;

    const seg = (len: number, fn: () => void) => {
      if (d <= len) fn();
      else d -= len;
    };

    // bottom edge, left -> right
    seg(straightW, () => {
      x = -straightW / 2 + d;
      y = -h / 2;
      angle = 0;
    });
    // bottom right corner
    seg(corner, () => {
      const a = -Math.PI / 2 + (d / corner) * (Math.PI / 2);
      x = straightW / 2 + Math.cos(a) * radius;
      y = -straightH / 2 + Math.sin(a) * radius;
      angle = Math.PI * 0.25;
    });
    // right edge
    seg(straightH, () => {
      x = w / 2;
      y = -straightH / 2 + d;
      angle = 0;
    });
    // top right corner
    seg(corner, () => {
      const a = 0 + (d / corner) * (Math.PI / 2);
      x = straightW / 2 + Math.cos(a) * radius;
      y = straightH / 2 + Math.sin(a) * radius;
      angle = Math.PI * 0.25;
    });
    // top edge, right -> left
    seg(straightW, () => {
      x = straightW / 2 - d;
      y = h / 2;
      angle = 0;
    });
    // top left corner
    seg(corner, () => {
      const a = Math.PI / 2 + (d / corner) * (Math.PI / 2);
      x = -straightW / 2 + Math.cos(a) * radius;
      y = straightH / 2 + Math.sin(a) * radius;
      angle = Math.PI * 0.25;
    });
    // left edge
    seg(straightH, () => {
      x = -w / 2;
      y = straightH / 2 - d;
      angle = 0;
    });
    // bottom left corner
    seg(corner, () => {
      const a = Math.PI + (d / corner) * (Math.PI / 2);
      x = -straightW / 2 + Math.cos(a) * radius;
      y = -straightH / 2 + Math.sin(a) * radius;
      angle = Math.PI * 0.25;
    });

    points.push({ x, y, angle });
  }

  return points;
}

interface TypefaceData {
  glyphs: Record<string, { ha: number; o?: string }>;
  resolution: number;
  boundingBox: { yMax: number; yMin: number };
  underlineThickness: number;
}

const typefaceData = (font: Font): TypefaceData => font.data as unknown as TypefaceData;

interface TextBuildOptions {
  size: number;
  depth: number;
  /** extra letter spacing expressed in em */
  tracking: number;
  curveSegments: number;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelThickness: number;
  bevelSegments: number;
}

interface TextBuildResult {
  geometry: THREE.BufferGeometry;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  isEmpty: boolean;
}

/**
 * Builds the extruded nameplate text glyph by glyph.
 *
 * Doing the layout ourselves (instead of leaning on THREE.TextGeometry) gives
 * full control on tracking (three.js has no kerning/tracking support), on
 * multi-line centring and on the per-character glyph coverage check.
 */
function buildTextGeometry(font: Font, text: string, options: TextBuildOptions): TextBuildResult {
  const data = typefaceData(font);
  const scale = options.size / data.resolution;
  const lineHeight =
    (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) * scale * 1.1;
  const tracking = options.tracking * options.size;

  const parts: THREE.BufferGeometry[] = [];
  let cursorX = 0;
  let cursorY = 0;

  for (const char of Array.from(text)) {
    if (char === '\n') {
      cursorY -= lineHeight;
      cursorX = 0;
      continue;
    }

    const glyph = data.glyphs[char];
    const advance = (glyph?.ha ?? 0) * scale;

    if (glyph?.o) {
      const shapes = font.generateShapes(char, options.size);
      if (shapes.length > 0) {
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: options.depth,
          steps: 1,
          curveSegments: options.curveSegments,
          bevelEnabled: options.bevelEnabled,
          bevelSize: options.bevelSize,
          bevelThickness: options.bevelThickness,
          bevelOffset: 0,
          bevelSegments: options.bevelSegments,
        });
        geometry.translate(cursorX, cursorY, 0);
        parts.push(geometry);
      }
    }

    cursorX += advance + tracking;
  }

  const merged =
    parts.length === 1 ? parts[0] : (mergeGeometries(parts, false) ?? new THREE.BufferGeometry());
  if (parts.length > 1) parts.forEach((part) => part.dispose());

  if (!merged.attributes.position || merged.attributes.position.count === 0) {
    merged.dispose();
    return {
      geometry: new THREE.BufferGeometry(),
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
      isEmpty: true,
    };
  }

  merged.computeBoundingBox();
  const box = merged.boundingBox ?? new THREE.Box3();
  return {
    geometry: merged,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    centerX: (box.max.x + box.min.x) / 2,
    centerY: (box.max.y + box.min.y) / 2,
    isEmpty: false,
  };
}

/**
 * Builds the complete pendant: stepped bezel, pierced azurage backplate,
 * pavé halo, cardinal baguettes, corner solitaires, bail and Cuban chain.
 */
export function buildJewelryPiece(materials: MaterialLibrary): JewelryAssembly {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'JewelryRoot';

  const innerWidth = 7.6;
  const innerHeight = 2.8;
  const bezelBorder = 0.55;
  const plateDepth = 0.65;
  const cornerRadius = 0.85;
  const outerWidth = innerWidth + bezelBorder * 2;
  const outerHeight = innerHeight + bezelBorder * 2;

  const dimensions: JewelryDimensions = {
    innerWidth,
    innerHeight,
    bezelBorder,
    outerWidth,
    outerHeight,
    plateDepth,
    cornerRadius,
  };

  const disposables: { dispose: () => void }[] = [];
  const raycastTargets: THREE.Object3D[] = [];

  /* ---------------------------------------------------------------- *
   * A. Pendant base: stepped bezel + azurage backplate
   * ---------------------------------------------------------------- */
  const pendantBaseGroup = new THREE.Group();
  pendantBaseGroup.name = 'PendantBase';

  const outerShape = roundedRectShape(outerWidth, outerHeight, cornerRadius);
  outerShape.holes.push(roundedRectShape(innerWidth * 0.97, innerHeight * 0.95, cornerRadius * 0.6));

  const bezelGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: plateDepth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    curveSegments: 16,
  });
  bezelGeometry.translate(0, 0, -plateDepth / 2);
  disposables.push(bezelGeometry);

  const bezelMesh = new THREE.Mesh(bezelGeometry, materials.metal);
  bezelMesh.name = 'Bezel';
  bezelMesh.castShadow = true;
  bezelMesh.receiveShadow = true;
  pendantBaseGroup.add(bezelMesh);
  raycastTargets.push(bezelMesh);

  // pierced honeycomb backplate
  const backShape = roundedRectShape(innerWidth * 0.99, innerHeight * 0.97, cornerRadius * 0.5);
  const rows = 3;
  const cols = 9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * 0.72 + (r % 2 === 1 ? 0.36 : 0);
      const offsetY = (r - (rows - 1) / 2) * 0.65;
      if (
        Math.abs(offsetX) < innerWidth / 2 - 0.5 &&
        Math.abs(offsetY) < innerHeight / 2 - 0.35
      ) {
        const hole = new THREE.Path();
        const hexRadius = 0.21;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = offsetX + Math.cos(a) * hexRadius;
          const py = offsetY + Math.sin(a) * hexRadius;
          if (i === 0) hole.moveTo(px, py);
          else hole.lineTo(px, py);
        }
        backShape.holes.push(hole);
      }
    }
  }

  const backPlateGeometry = new THREE.ExtrudeGeometry(backShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 12,
  });
  backPlateGeometry.translate(0, 0, -plateDepth / 2 - 0.2);
  disposables.push(backPlateGeometry);

  const backPlateMesh = new THREE.Mesh(backPlateGeometry, materials.darkMetal);
  backPlateMesh.name = 'AzurageBackplate';
  backPlateMesh.castShadow = true;
  backPlateMesh.receiveShadow = true;
  pendantBaseGroup.add(backPlateMesh);

  /* ---------------------------------------------------------------- *
   * B. Pavé halo (round brilliants + micro prongs)
   * ---------------------------------------------------------------- */
  const paveGroup = new THREE.Group();
  paveGroup.name = 'DiamondPaveHalo';

  const paveRadius = 0.105;
  const paveGeometry = createRoundBrilliantGeometry(paveRadius, 1);
  const prongGeometry = createProngGeometry(0.028, 0.1);
  disposables.push(paveGeometry, prongGeometry);

  // The halo sits on the centre line of the bezel band (between the window
  // edge and the outer rim), not on the window edge: stones straddling the
  // opening would look like they are floating in the hole.
  const bandCentre = bezelBorder * 0.5;
  const pavePath = walkRoundedRect(
    innerWidth + bandCentre * 2,
    innerHeight + bandCentre * 2,
    cornerRadius * 0.8,
    0.42
  );
  const frontZ = plateDepth * 0.5 + 0.02;

  const stones = pavePath.length + 4 + 4; // pave + corner solitaires + baguettes

  const diamondMesh = new THREE.InstancedMesh(paveGeometry, materials.gem, pavePath.length);
  diamondMesh.name = 'PaveStones';
  diamondMesh.castShadow = true;

  const prongMesh = new THREE.InstancedMesh(prongGeometry, materials.metal, pavePath.length * 4);
  prongMesh.name = 'PaveProngs';
  prongMesh.castShadow = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  const spinEuler = new THREE.Euler();

  let prongIndex = 0;
  pavePath.forEach((point, index) => {
    const position = new THREE.Vector3(point.x, point.y, frontZ);
    // Every stone has to face the camera (+Z): the previous code rotated them
    // radially, so the stones on the right/left/bottom edges showed their
    // pavilion (black) instead of their table.
    spinEuler.set(Math.PI / 2, 0, (index % 4) * (Math.PI / 2), 'ZYX');
    quaternion.setFromEuler(spinEuler);
    matrix.compose(position, quaternion, scaleOne);
    diamondMesh.setMatrixAt(index, matrix);

    for (let p = 0; p < 4; p++) {
      const angle = (p / 4) * Math.PI * 2 + Math.PI / 4;
      const prongPos = new THREE.Vector3(
        point.x + Math.cos(angle) * 0.145,
        point.y + Math.sin(angle) * 0.145,
        frontZ - 0.035
      );
      spinEuler.set(Math.PI / 2, 0, 0);
      quaternion.setFromEuler(spinEuler);
      matrix.compose(prongPos, quaternion, scaleOne);
      prongMesh.setMatrixAt(prongIndex++, matrix);
    }
  });

  diamondMesh.instanceMatrix.needsUpdate = true;
  prongMesh.instanceMatrix.needsUpdate = true;
  paveGroup.add(diamondMesh, prongMesh);
  pendantBaseGroup.add(paveGroup);
  raycastTargets.push(diamondMesh, prongMesh);

  /* ---------------------------------------------------------------- *
   * C. Cardinal baguettes + corner solitaires
   * ---------------------------------------------------------------- */
  const accentGroup = new THREE.Group();
  accentGroup.name = 'Accents';

  // the baguettes are set in the middle of each plate edge, flush with the
  // front face so they read as a "ballerina" cardinal accent
  const baguetteGeometry = createBaguetteCutGeometry(0.26, 0.28, 1.0);
  const colletGeometry = new THREE.BoxGeometry(0.34, 0.34, 1.12);
  const baguetteFrontZ = plateDepth * 0.5 + 0.05;
  disposables.push(baguetteGeometry, colletGeometry);

  const baguettes: { position: THREE.Vector3; spin: number }[] = [
    { position: new THREE.Vector3(0, outerHeight / 2 - 0.02, baguetteFrontZ), spin: Math.PI / 2 },
    { position: new THREE.Vector3(0, -outerHeight / 2 + 0.02, baguetteFrontZ), spin: Math.PI / 2 },
    { position: new THREE.Vector3(-outerWidth / 2 + 0.02, 0, baguetteFrontZ), spin: 0 },
    { position: new THREE.Vector3(outerWidth / 2 - 0.02, 0, baguetteFrontZ), spin: 0 },
  ];

  for (const baguette of baguettes) {
    const collet = new THREE.Mesh(colletGeometry, materials.metal);
    collet.position.copy(baguette.position).setZ(baguetteFrontZ - 0.24);
    collet.rotation.set(Math.PI / 2, 0, baguette.spin, 'ZYX');
    collet.castShadow = true;
    accentGroup.add(collet);

    const stone = new THREE.Mesh(baguetteGeometry, materials.accentGem);
    stone.position.copy(baguette.position);
    stone.rotation.set(Math.PI / 2, 0, baguette.spin, 'ZYX');
    stone.castShadow = true;
    accentGroup.add(stone);
    raycastTargets.push(stone);
  }

  const solitaireGeometry = createRoundBrilliantGeometry(0.3, 1);
  const clawGeometry = new THREE.CylinderGeometry(0.032, 0.05, 0.26, 10);
  clawGeometry.translate(0, 0.13, 0);
  disposables.push(solitaireGeometry, clawGeometry);

  const corners: [number, number][] = [
    [outerWidth / 2 - 0.12, outerHeight / 2 - 0.12],
    [-outerWidth / 2 + 0.12, outerHeight / 2 - 0.12],
    [-outerWidth / 2 + 0.12, -outerHeight / 2 + 0.12],
    [outerWidth / 2 - 0.12, -outerHeight / 2 + 0.12],
  ];
  for (const [cx, cy] of corners) {
    const stone = new THREE.Mesh(solitaireGeometry, materials.gem);
    stone.position.set(cx, cy, plateDepth * 0.5 + 0.04);
    stone.rotation.set(Math.PI / 2, 0, 0);
    stone.castShadow = true;
    accentGroup.add(stone);
    raycastTargets.push(stone);

    for (let a = 0; a < 4; a++) {
      const angle = (a / 4) * Math.PI * 2 + Math.PI / 4;
      const claw = new THREE.Mesh(clawGeometry, materials.metal);
      claw.position.set(cx + Math.cos(angle) * 0.26, cy + Math.sin(angle) * 0.26, plateDepth * 0.5 - 0.03);
      claw.rotation.set(Math.PI / 2, 0, 0);
      claw.castShadow = true;
      accentGroup.add(claw);
    }
  }

  pendantBaseGroup.add(accentGroup);

  /* ---------------------------------------------------------------- *
   * D. Bail + Cuban chain
   * ---------------------------------------------------------------- */
  const chainGroup = new THREE.Group();
  chainGroup.name = 'BailAndChain';

  const bailGroup = new THREE.Group();
  const bailBaseY = outerHeight / 2 + 0.42;
  bailGroup.position.set(0, bailBaseY, plateDepth * 0.08);

  const bailOuter = new THREE.Shape();
  bailOuter.moveTo(-0.42, -0.62);
  bailOuter.lineTo(0.42, -0.62);
  bailOuter.quadraticCurveTo(0.52, 0.55, 0.32, 1.02);
  bailOuter.quadraticCurveTo(0, 1.3, -0.32, 1.02);
  bailOuter.quadraticCurveTo(-0.52, 0.55, -0.42, -0.62);

  const bailHole = new THREE.Path();
  bailHole.moveTo(-0.22, -0.36);
  bailHole.lineTo(0.22, -0.36);
  bailHole.quadraticCurveTo(0.3, 0.45, 0.18, 0.82);
  bailHole.quadraticCurveTo(0, 1.0, -0.18, 0.82);
  bailHole.quadraticCurveTo(-0.3, 0.45, -0.22, -0.36);
  bailOuter.holes.push(bailHole);

  const bailGeometry = new THREE.ExtrudeGeometry(bailOuter, {
    depth: 0.5,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.07,
    bevelThickness: 0.07,
    curveSegments: 16,
  });
  bailGeometry.translate(0, 0, -0.25);
  disposables.push(bailGeometry);

  const bailMesh = new THREE.Mesh(bailGeometry, materials.metal);
  bailMesh.name = 'Bail';
  bailMesh.castShadow = true;
  bailMesh.receiveShadow = true;
  bailGroup.add(bailMesh);
  raycastTargets.push(bailMesh);

  const beadGeometry = createBeadGeometry(0.07);
  disposables.push(beadGeometry);
  for (let b = 0; b < 5; b++) {
    const t = (b + 0.5) / 5;
    const bead = new THREE.Mesh(beadGeometry, materials.gem);
    bead.position.set(0, -0.3 + t * 1.15, 0.28);
    bead.rotation.x = Math.PI / 2;
    bead.scale.setScalar(0.9);
    bailGroup.add(bead);
  }

  chainGroup.add(bailGroup);

  // heavy flattened curb links hanging on a natural drape
  const linkMajor = 0.46;
  const linkTube = 0.115;
  const linkGeometry = new THREE.TorusGeometry(linkMajor, linkTube, 10, 26);
  linkGeometry.scale(1.18, 1, 0.72);
  disposables.push(linkGeometry);

  const spacing = linkMajor * 1.55;
  const bailTop = new THREE.Vector3(0, bailBaseY + 1.0, plateDepth * 0.08);

  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      // both sides start next to each other on top of the bail, otherwise the
      // first links of the two halves interpenetrate in a visible X
      bailTop.clone().add(new THREE.Vector3(side * 0.42, -0.05, -0.15)),
      new THREE.Vector3(side * 0.9, bailBaseY + 1.5, plateDepth * 0.08 - 0.35),
      new THREE.Vector3(side * 2.0, bailBaseY + 2.7, -1.1),
      new THREE.Vector3(side * 3.6, bailBaseY + 3.15, -2.6),
      new THREE.Vector3(side * 5.6, bailBaseY + 3.4, -4.8),
    ]);
    const length = curve.getLength();
    const count = Math.max(3, Math.round(length / spacing));
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();

      // build an orthonormal frame: the link plane must contain the tangent
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

      // alternate the plane of each link so they interlock
      const planeAxis = i % 2 === 0 ? normal : binormal;
      const ringNormal = new THREE.Vector3().crossVectors(planeAxis, tangent).normalize();

      const basis = new THREE.Matrix4().makeBasis(planeAxis, tangent, ringNormal);
      const link = new THREE.Mesh(linkGeometry, materials.metal);
      link.position.copy(point);
      link.quaternion.setFromRotationMatrix(basis);
      link.castShadow = true;
      link.receiveShadow = true;
      chainGroup.add(link);
      raycastTargets.push(link);
    }
  }

  rootGroup.add(chainGroup, pendantBaseGroup);

  /* ---------------------------------------------------------------- *
   * E. 3D nameplate text (rebuildable)
   * ---------------------------------------------------------------- */
  const textContainerGroup = new THREE.Group();
  textContainerGroup.name = 'TextContainer';
  pendantBaseGroup.add(textContainerGroup);

  let textMesh: THREE.Mesh | null = null;
  let nameplateSource: 'metal' | 'gem' = 'metal';

  // the nameplate uses dedicated material clones so it can be styled
  // independently from the rest of the piece (see the material library)
  const materialForNameplate = () =>
    nameplateSource === 'gem' ? materials.textGem : materials.textMetal;

  const fitText = (
    font: Font,
    options: TextOptions,
    quality: QualityPreset
  ): TextFitResult => {
    const rawText = (options.uppercase ? options.text.toUpperCase() : options.text).trim();
    const dropped: string[] = [];

    // Drop characters the typeface has no glyph for instead of letting
    // three.js throw (its FontLoader returns `undefined` from createPath()
    // and the exception bubbles up, destroying the nameplate).
    const glyphs = typefaceData(font).glyphs;
    const safeText = Array.from(rawText)
      .filter((char) => {
        if (char === '\n' || char === ' ') return true;
        const known = Boolean(glyphs[char]);
        if (!known) dropped.push(char);
        return known;
      })
      .join('');

    if (textMesh) {
      textContainerGroup.remove(textMesh);
      textMesh.geometry.dispose();
      const index = raycastTargets.indexOf(textMesh);
      if (index >= 0) raycastTargets.splice(index, 1);
      textMesh = null;
    }

    if (!safeText.trim()) {
      return { text: '', size: 0, width: 0, height: 0, dropped, visible: false };
    }

    // 1. cheap measuring pass (no bevel, low tessellation)
    const measured = buildTextGeometry(font, safeText, {
      size: 1,
      depth: 0.02,
      tracking: options.tracking,
      curveSegments: 3,
      bevelEnabled: false,
      bevelSize: 0,
      bevelThickness: 0,
      bevelSegments: 1,
    });

    if (measured.isEmpty) {
      measured.geometry.dispose();
      return { text: safeText, size: 0, width: 0, height: 0, dropped, visible: false };
    }

    const naturalWidth = Math.max(0.001, measured.width);
    const naturalHeight = Math.max(0.001, measured.height);
    measured.geometry.dispose();

    // 2. fit inside the plate window, then apply the user multiplier
    const maxWidth = innerWidth * 0.9;
    const maxHeight = innerHeight * 0.66;
    const fittedSize = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
    const size = THREE.MathUtils.clamp(fittedSize * options.scale, 0.16, 3.2);

    // 3. real extrusion, bevel size relative to the fitted size so hairlines
    //    of high-contrast typefaces are not blown up by the bevel
    // proportionally small bevel: high contrast typefaces have hairlines that a
    // large bevel would swallow (the tittles of the "i" turned into spheres)
    const bevelSize = THREE.MathUtils.clamp(size * 0.011, 0.003, 0.02);
    const built = buildTextGeometry(font, safeText, {
      size,
      depth: options.depth,
      tracking: options.tracking,
      curveSegments: quality.curveSegments,
      bevelEnabled: true,
      bevelSize,
      bevelThickness: Math.min(options.depth * 0.4, bevelSize * 1.6),
      bevelSegments: quality.bevelSegments,
    });

    if (built.isEmpty) {
      built.geometry.dispose();
      return { text: safeText, size, width: 0, height: 0, dropped, visible: false };
    }

    const geometry = built.geometry;
    geometry.translate(
      -built.centerX,
      -built.centerY,
      plateDepth * 0.5
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    disposables.push(geometry);

    textMesh = new THREE.Mesh(geometry, materialForNameplate());
    textMesh.name = 'NameplateText';
    textMesh.castShadow = true;
    textMesh.receiveShadow = true;
    textContainerGroup.add(textMesh);
    raycastTargets.push(textMesh);

    return {
      text: safeText,
      size,
      width: built.width,
      height: built.height,
      dropped,
      visible: true,
    };
  };

  return {
    group: rootGroup,
    dimensions,
    get textMesh() {
      return textMesh;
    },
    setText: fitText,
    setNameplateMaterial: (source) => {
      nameplateSource = source;
      if (textMesh) textMesh.material = materialForNameplate();
    },
    cycleNameplateMaterial: () => {
      nameplateSource = nameplateSource === 'metal' ? 'gem' : 'metal';
      if (textMesh) textMesh.material = materialForNameplate();
      return nameplateSource;
    },
    nameplateMaterial: () => nameplateSource,
    raycastTargets,
    stones,
    dispose: () => {
      disposables.forEach((item) => item.dispose());
      if (textMesh) textMesh.geometry.dispose();
    },
  };
}

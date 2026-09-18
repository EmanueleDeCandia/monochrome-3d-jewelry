import * as THREE from 'three';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import {
  createRoundBrilliantGeometry,
  createBaguetteCutGeometry,
  createProngGeometry,
} from './gemstoneGeometry';
import { JewelryMaterials } from './materials';
import { luxurySerifTypeface } from './fonts/luxurySerifFont';

export interface JewelryAssembly {
  group: THREE.Group;
  textMesh: THREE.Mesh | null;
  textMaterialType: 'platinum' | 'diamond' | 'obsidian';
  toggleTextMaterial: () => 'platinum' | 'diamond' | 'obsidian';
  setTextMaterial: (type: 'platinum' | 'diamond' | 'obsidian') => void;
  updateText: (newText: string) => Promise<void>;
  raycastTargets: THREE.Object3D[];
  setWireframe: (enabled: boolean) => void;
}

/**
 * Builds the dense, hyper-realistic Haute Joaillerie Pendant & Chain.
 */
export async function buildJewelryPiece(
  materials: JewelryMaterials,
  initialText: string = 'William'
): Promise<JewelryAssembly> {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'JewelryRoot';

  // 1. Load Font (try local path first, fallback to embedded luxury serif)
  const fontLoader = new FontLoader();
  let font: Font;
  try {
    font = await new Promise<Font>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(fontLoader.parse(luxurySerifTypeface));
        }
      }, 600);

      const paths = [
        './assets/luxury_serif.typeface.json',
        '/assets/luxury_serif.typeface.json',
        './assets/droid_serif_bold.typeface.json',
      ];

      const tryPath = (index: number) => {
        if (index >= paths.length) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(fontLoader.parse(luxurySerifTypeface));
          }
          return;
        }

        fontLoader.load(
          paths[index],
          (loadedFont) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve(loadedFont);
            }
          },
          undefined,
          () => {
            tryPath(index + 1);
          }
        );
      };

      tryPath(0);
    });
  } catch {
    font = fontLoader.parse(luxurySerifTypeface);
  }

  let currentTextMaterialType: 'platinum' | 'diamond' | 'obsidian' = 'platinum';
  let textMesh: THREE.Mesh | null = null;
  const raycastTargets: THREE.Object3D[] = [];

  // ==========================================
  // A. PENDANT BASE & STEPPED PLATINUM BEZEL
  // ==========================================
  const pendantBaseGroup = new THREE.Group();
  pendantBaseGroup.name = 'PendantBase';

  const innerWidth = 7.6;
  const innerHeight = 2.8;
  const bezelBorder = 0.55;
  const outerWidth = innerWidth + bezelBorder * 2;
  const outerHeight = innerHeight + bezelBorder * 2;
  const plateDepth = 0.65;
  const cornerRadius = 0.85;

  // Function to create a rounded rectangle Shape
  function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  // 1. Main Bezel Body (Heavy Polished Platinum Frame)
  const outerShape = createRoundedRectShape(outerWidth, outerHeight, cornerRadius);
  const innerHole = createRoundedRectShape(innerWidth * 0.96, innerHeight * 0.94, cornerRadius * 0.6);
  outerShape.holes.push(innerHole);

  const bezelGeom = new THREE.ExtrudeGeometry(outerShape, {
    depth: plateDepth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.12,
    bevelThickness: 0.12,
    curveSegments: 16,
  });
  // Center bezel depth
  bezelGeom.translate(0, 0, -plateDepth / 2);

  const bezelMesh = new THREE.Mesh(bezelGeom, materials.platinum);
  bezelMesh.castShadow = true;
  bezelMesh.receiveShadow = true;
  pendantBaseGroup.add(bezelMesh);
  raycastTargets.push(bezelMesh);

  // 2. Azurage Honeycomb Backplate (Underneath the text for realistic CAD light passage)
  const backPlateShape = createRoundedRectShape(innerWidth * 0.98, innerHeight * 0.96, cornerRadius * 0.5);
  // Add pierced honeycomb holes
  const rows = 3;
  const cols = 9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * 0.72 + (r % 2 === 1 ? 0.36 : 0);
      const offsetY = (r - (rows - 1) / 2) * 0.65;
      if (Math.abs(offsetX) < (innerWidth / 2 - 0.5) && Math.abs(offsetY) < (innerHeight / 2 - 0.4)) {
        const hexHole = new THREE.Path();
        const hexR = 0.22;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = offsetX + Math.cos(a) * hexR;
          const py = offsetY + Math.sin(a) * hexR;
          if (i === 0) hexHole.moveTo(px, py);
          else hexHole.lineTo(px, py);
        }
        backPlateShape.holes.push(hexHole);
      }
    }
  }

  const backPlateGeom = new THREE.ExtrudeGeometry(backPlateShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    curveSegments: 12,
  });
  backPlateGeom.translate(0, 0, -plateDepth / 2 - 0.22);

  const backPlateMesh = new THREE.Mesh(backPlateGeom, materials.matteDarkMetal);
  backPlateMesh.castShadow = true;
  backPlateMesh.receiveShadow = true;
  pendantBaseGroup.add(backPlateMesh);

  // 3. Under-Gallery Hallmarks (PT950 / William Atelier laser inscription on back rim)
  const rimTrimGeom = new THREE.TorusGeometry(outerWidth * 0.36, 0.07, 8, 36);
  rimTrimGeom.scale(1.35, 0.55, 1);
  rimTrimGeom.translate(0, 0, -plateDepth / 2 - 0.22);
  const rimTrimMesh = new THREE.Mesh(rimTrimGeom, materials.rhodiumSilver);
  pendantBaseGroup.add(rimTrimMesh);

  // ==========================================
  // B. DIAMOND PAVÉ HALO & MICRO-PRONGS
  // ==========================================
  const paveGroup = new THREE.Group();
  paveGroup.name = 'DiamondPaveHalo';

  const diamondGeom = createRoundBrilliantGeometry(0.18, 0.12);
  const prongGeom = createProngGeometry(0.042, 0.14);

  // Distribute diamonds in a continuous perimeter loop around the bezel
  const stonePositions: THREE.Vector3[] = [];
  const stoneRotations: number[] = [];

  const paveW = innerWidth + 0.15;
  const paveH = innerHeight + 0.15;
  const paveRadius = cornerRadius * 0.75;
  const spacing = 0.44;

  // Perimeter path points
  const halfW = paveW / 2 - paveRadius;
  const halfH = paveH / 2 - paveRadius;

  // Top edge
  for (let x = -halfW; x <= halfW; x += spacing) {
    stonePositions.push(new THREE.Vector3(x, paveH / 2, plateDepth * 0.5 + 0.04));
    stoneRotations.push(0);
  }
  // Right edge
  for (let y = halfH - spacing; y >= -halfH + spacing; y -= spacing) {
    stonePositions.push(new THREE.Vector3(paveW / 2, y, plateDepth * 0.5 + 0.04));
    stoneRotations.push(-Math.PI / 2);
  }
  // Bottom edge
  for (let x = halfW; x >= -halfW; x -= spacing) {
    stonePositions.push(new THREE.Vector3(x, -paveH / 2, plateDepth * 0.5 + 0.04));
    stoneRotations.push(Math.PI);
  }
  // Left edge
  for (let y = -halfH + spacing; y <= halfH - spacing; y += spacing) {
    stonePositions.push(new THREE.Vector3(-paveW / 2, y, plateDepth * 0.5 + 0.04));
    stoneRotations.push(Math.PI / 2);
  }

  // Corners with corner curve
  const cornerAngles = [
    { cx: halfW, cy: halfH, start: 0, end: Math.PI / 2 },
    { cx: -halfW, cy: halfH, start: Math.PI / 2, end: Math.PI },
    { cx: -halfW, cy: -halfH, start: Math.PI, end: (3 * Math.PI) / 2 },
    { cx: halfW, cy: -halfH, start: (3 * Math.PI) / 2, end: Math.PI * 2 },
  ];
  for (const corner of cornerAngles) {
    const steps = 3;
    for (let s = 1; s <= steps; s++) {
      const a = corner.start + ((corner.end - corner.start) * s) / (steps + 1);
      const px = corner.cx + Math.cos(a) * paveRadius;
      const py = corner.cy + Math.sin(a) * paveRadius;
      stonePositions.push(new THREE.Vector3(px, py, plateDepth * 0.5 + 0.04));
      stoneRotations.push(a);
    }
  }

  // Create InstancedMesh for maximum CAD facet rendering performance
  const diamondInstanceCount = stonePositions.length;
  const diamondInstancedMesh = new THREE.InstancedMesh(
    diamondGeom,
    materials.pureDiamond,
    diamondInstanceCount
  );
  diamondInstancedMesh.castShadow = true;
  diamondInstancedMesh.receiveShadow = true;

  // 4 micro-prongs per stone
  const prongInstanceCount = diamondInstanceCount * 4;
  const prongInstancedMesh = new THREE.InstancedMesh(
    prongGeom,
    materials.platinum,
    prongInstanceCount
  );
  prongInstancedMesh.castShadow = true;
  prongInstancedMesh.receiveShadow = true;

  const dummyMatrix = new THREE.Matrix4();
  const dummyQuat = new THREE.Quaternion();
  const dummyScale = new THREE.Vector3(1, 1, 1);

  let prongIdx = 0;
  for (let i = 0; i < diamondInstanceCount; i++) {
    const pos = stonePositions[i];
    const rotZ = stoneRotations[i];

    // Diamond matrix: table facing forward (+Z), rotated to align with bezel normal
    const rot = new THREE.Euler(Math.PI / 2, 0, rotZ);
    dummyQuat.setFromEuler(rot);
    dummyMatrix.compose(pos, dummyQuat, dummyScale);
    diamondInstancedMesh.setMatrixAt(i, dummyMatrix);

    // 4 prongs surrounding each stone
    const prongOffset = 0.16;
    const offsets = [
      [-prongOffset, -prongOffset],
      [prongOffset, -prongOffset],
      [prongOffset, prongOffset],
      [-prongOffset, prongOffset],
    ];

    for (const [ox, oy] of offsets) {
      const pPos = new THREE.Vector3(pos.x + ox, pos.y + oy, pos.z + 0.02);
      const pRot = new THREE.Euler(Math.PI / 2, 0, 0);
      dummyQuat.setFromEuler(pRot);
      dummyMatrix.compose(pPos, dummyQuat, dummyScale);
      prongInstancedMesh.setMatrixAt(prongIdx++, dummyMatrix);
    }
  }

  diamondInstancedMesh.instanceMatrix.needsUpdate = true;
  prongInstancedMesh.instanceMatrix.needsUpdate = true;
  paveGroup.add(diamondInstancedMesh);
  paveGroup.add(prongInstancedMesh);
  pendantBaseGroup.add(paveGroup);
  raycastTargets.push(diamondInstancedMesh);

  // ==========================================
  // C. ACCENT OBSIDIAN BAGUETTES & CORNER GEMS
  // ==========================================
  const accentGroup = new THREE.Group();
  accentGroup.name = 'ObsidianAccents';

  const baguetteGeom = createBaguetteCutGeometry(0.38, 0.22, 1.4);
  const baguetteInstances = [
    // Top cardinal baguette
    { pos: new THREE.Vector3(0, outerHeight / 2 + 0.18, plateDepth * 0.3), rot: new THREE.Euler(0, 0, Math.PI / 2) },
    // Bottom cardinal baguette
    { pos: new THREE.Vector3(0, -outerHeight / 2 - 0.18, plateDepth * 0.3), rot: new THREE.Euler(0, 0, Math.PI / 2) },
    // Left cardinal baguette
    { pos: new THREE.Vector3(-outerWidth / 2 - 0.18, 0, plateDepth * 0.3), rot: new THREE.Euler(0, 0, 0) },
    // Right cardinal baguette
    { pos: new THREE.Vector3(outerWidth / 2 + 0.18, 0, plateDepth * 0.3), rot: new THREE.Euler(0, 0, 0) },
  ];

  for (const b of baguetteInstances) {
    const bMesh = new THREE.Mesh(baguetteGeom, materials.obsidian);
    bMesh.position.copy(b.pos);
    bMesh.rotation.copy(b.rot);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    accentGroup.add(bMesh);

    // Bezel collet cup for each baguette
    const colletGeom = new THREE.BoxGeometry(0.46, 0.28, 1.5);
    const colletMesh = new THREE.Mesh(colletGeom, materials.platinum);
    colletMesh.position.copy(b.pos);
    colletMesh.position.z -= 0.12;
    colletMesh.rotation.copy(b.rot);
    accentGroup.add(colletMesh);
  }

  // 4 Corner Brilliant Diamonds in Cathedral Claw Mounts
  const cornerGems = [
    new THREE.Vector3(outerWidth / 2 - 0.1, outerHeight / 2 - 0.1, plateDepth * 0.5 + 0.08),
    new THREE.Vector3(-outerWidth / 2 + 0.1, outerHeight / 2 - 0.1, plateDepth * 0.5 + 0.08),
    new THREE.Vector3(-outerWidth / 2 + 0.1, -outerHeight / 2 + 0.1, plateDepth * 0.5 + 0.08),
    new THREE.Vector3(outerWidth / 2 - 0.1, -outerHeight / 2 + 0.1, plateDepth * 0.5 + 0.08),
  ];
  const largeDiamondGeom = createRoundBrilliantGeometry(0.32, 0.2);
  for (const cg of cornerGems) {
    const cgMesh = new THREE.Mesh(largeDiamondGeom, materials.pureDiamond);
    cgMesh.position.copy(cg);
    cgMesh.rotation.x = Math.PI / 2;
    cgMesh.castShadow = true;
    accentGroup.add(cgMesh);

    // 4 prominent corner claws
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
      const clawGeom = new THREE.CylinderGeometry(0.045, 0.065, 0.32, 10);
      const clawMesh = new THREE.Mesh(clawGeom, materials.platinum);
      clawMesh.position.set(
        cg.x + Math.cos(ang) * 0.28,
        cg.y + Math.sin(ang) * 0.28,
        cg.z
      );
      clawMesh.rotation.x = Math.PI / 2;
      accentGroup.add(clawMesh);
    }
  }

  pendantBaseGroup.add(accentGroup);

  // ==========================================
  // D. SCULPTED LUXURY BAIL & HEAVY CUBAN CHAIN
  // ==========================================
  const chainGroup = new THREE.Group();
  chainGroup.name = 'LuxuryChainAndBail';

  // 1. Sculpted Diamond-Encrusted Bail at Top
  const bailGroup = new THREE.Group();
  bailGroup.position.set(0, outerHeight / 2 + 0.72, plateDepth * 0.15);

  const bailLoopShape = new THREE.Shape();
  bailLoopShape.moveTo(-0.45, -0.6);
  bailLoopShape.lineTo(0.45, -0.6);
  bailLoopShape.quadraticCurveTo(0.55, 0.6, 0.35, 1.1);
  bailLoopShape.quadraticCurveTo(0, 1.4, -0.35, 1.1);
  bailLoopShape.quadraticCurveTo(-0.55, 0.6, -0.45, -0.6);

  const bailHole = new THREE.Path();
  bailHole.moveTo(-0.25, -0.4);
  bailHole.lineTo(0.25, -0.4);
  bailHole.quadraticCurveTo(0.35, 0.5, 0.2, 0.9);
  bailHole.quadraticCurveTo(0, 1.1, -0.2, 0.9);
  bailHole.quadraticCurveTo(-0.35, 0.5, -0.25, -0.4);
  bailLoopShape.holes.push(bailHole);

  const bailGeom = new THREE.ExtrudeGeometry(bailLoopShape, {
    depth: 0.6,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    curveSegments: 16,
  });
  bailGeom.translate(0, 0, -0.3);
  const bailMesh = new THREE.Mesh(bailGeom, materials.platinum);
  bailMesh.castShadow = true;
  bailGroup.add(bailMesh);

  // Bail micro-diamonds
  const bailDiamondCount = 5;
  for (let b = 0; b < bailDiamondCount; b++) {
    const t = (b + 0.5) / bailDiamondCount;
    const by = -0.35 + t * 1.25;
    const bz = 0.36;
    const bdMesh = new THREE.Mesh(diamondGeom, materials.pureDiamond);
    bdMesh.position.set(0, by, bz);
    bdMesh.rotation.x = Math.PI / 2;
    bdMesh.scale.set(0.85, 0.85, 0.85);
    bailGroup.add(bdMesh);
  }
  chainGroup.add(bailGroup);

  // 2. Heavy Platinum Cuban / Curb Chain Links Draping Naturally
  // Uses beveled flattened torus links interlocking at 90-degree rotations
  const linkMajorR = 0.58;
  const linkTubeR = 0.16;
  const linkGeom = new THREE.TorusGeometry(linkMajorR, linkTubeR, 12, 28);
  linkGeom.scale(1.35, 0.85, 1.0); // Flattened curb link profile

  // Chain curve path (graceful hanging arch behind the pendant)
  const linksPerSide = 22;

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < linksPerSide; i++) {
      const t = i / (linksPerSide - 1);
      // Catenary curve trajectory
      const linkX = side * (0.35 + Math.pow(t, 0.85) * 5.2);
      const linkY = outerHeight / 2 + 1.45 + t * 4.8 - Math.sin(t * Math.PI * 0.4) * 0.8;
      const linkZ = -0.3 - t * 4.2 - Math.cos(t * Math.PI * 0.5) * 0.5;

      const linkMesh = new THREE.Mesh(linkGeom, materials.platinum);
      linkMesh.position.set(linkX, linkY, linkZ);

      // Alternate link rotation by ~75-90 degrees to interlock realistically
      const isOdd = i % 2 === 1;
      const rollAngle = (side * Math.PI) / 4 + (isOdd ? Math.PI / 2.1 : 0);
      const pitchAngle = t * 0.5;
      const yawAngle = -side * (t * 0.4);

      linkMesh.rotation.set(pitchAngle, yawAngle, rollAngle);
      linkMesh.castShadow = true;
      linkMesh.receiveShadow = true;
      chainGroup.add(linkMesh);
    }
  }

  rootGroup.add(chainGroup);
  rootGroup.add(pendantBaseGroup);

  // ==========================================
  // E. 3D TEXT GEOMETRY ('William')
  // ==========================================
  const textContainerGroup = new THREE.Group();
  textContainerGroup.name = 'TextContainer';
  pendantBaseGroup.add(textContainerGroup);

  // Function to create or recreate the 3D Text Mesh with micro-bevels
  function generateTextMesh(textString: string): THREE.Mesh {
    const textGeometry = new TextGeometry(textString, {
      font: font,
      size: 1.42,
      depth: 0.38,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.075,
      bevelSize: 0.055,
      bevelOffset: 0.0,
      bevelSegments: 5,
    });

    // Center text bounding box perfectly
    textGeometry.computeBoundingBox();
    const bb = textGeometry.boundingBox;
    let offsetX = 0;
    let offsetY = 0;
    if (bb) {
      offsetX = -(bb.max.x + bb.min.x) / 2;
      offsetY = -(bb.max.y + bb.min.y) / 2;
    }
    textGeometry.translate(offsetX, offsetY, plateDepth * 0.5);
    textGeometry.computeVertexNormals();

    const mat =
      currentTextMaterialType === 'diamond'
        ? materials.pureDiamond
        : currentTextMaterialType === 'obsidian'
        ? materials.obsidian
        : materials.platinum;

    const mesh = new THREE.Mesh(textGeometry, mat);
    mesh.name = 'WilliamTextMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  // Initial text creation
  textMesh = generateTextMesh(initialText);
  textContainerGroup.add(textMesh);
  raycastTargets.push(textMesh);

  // Material switcher helper
  const setTextMaterial = (type: 'platinum' | 'diamond' | 'obsidian') => {
    currentTextMaterialType = type;
    if (textMesh) {
      const mat =
        type === 'diamond'
          ? materials.pureDiamond
          : type === 'obsidian'
          ? materials.obsidian
          : materials.platinum;
      textMesh.material = mat;
    }
  };

  const toggleTextMaterial = (): 'platinum' | 'diamond' | 'obsidian' => {
    if (currentTextMaterialType === 'platinum') {
      setTextMaterial('diamond');
    } else if (currentTextMaterialType === 'diamond') {
      setTextMaterial('obsidian');
    } else {
      setTextMaterial('platinum');
    }
    return currentTextMaterialType;
  };

  // Live text update helper
  const updateText = async (newText: string) => {
    if (!newText.trim()) return;
    if (textMesh) {
      // Remove previous target from raycast
      const idx = raycastTargets.indexOf(textMesh);
      if (idx !== -1) raycastTargets.splice(idx, 1);

      textContainerGroup.remove(textMesh);
      textMesh.geometry.dispose();
    }
    textMesh = generateTextMesh(newText);
    textContainerGroup.add(textMesh);
    raycastTargets.push(textMesh);
  };

  // Wireframe toggle for CAD technical inspection mode
  const setWireframe = (enabled: boolean) => {
    rootGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = enabled));
        } else if (child.material) {
          child.material.wireframe = enabled;
        }
      }
    });
  };

  return {
    group: rootGroup,
    textMesh,
    textMaterialType: currentTextMaterialType,
    toggleTextMaterial,
    setTextMaterial,
    updateText,
    raycastTargets,
    setWireframe,
  };
}

import * as THREE from 'three';

/**
 * Faceted gemstone geometry.
 *
 * The previous implementation emitted every facet with the wrong winding *and*
 * the wrong normal: `addTriangle()` computed `(v3-v2) × (v1-v2)`, which for a
 * counter-clockwise outline yields the inward normal. Diamonds therefore
 * rendered as black, inside-out blobs and their tables were back-face culled
 * when seen from the front (i.e. invisible).
 *
 * The builder below assembles the facet layout and orients every facet
 * outwards using the gem centre as reference, producing flat facet normals
 * plus UVs.
 */

type Vec3 = [number, number, number];

class FacetBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];

  constructor(private center = new THREE.Vector3(0, 0, 0)) {}

  /** Adds a planar polygon (fan triangulated) oriented away from the centre. */
  addFace(points: Vec3[]) {
    if (points.length < 3) return;

    const face = points.map((p) => new THREE.Vector3(...p));
    const reference = new THREE.Vector3()
      .subVectors(face[1], face[0])
      .cross(new THREE.Vector3().subVectors(face[2], face[0]));

    const centroid = face
      .reduce((acc, v) => acc.add(v), new THREE.Vector3())
      .divideScalar(face.length);

    const outward = centroid.clone().sub(this.center);
    if (outward.lengthSq() < 1e-10) outward.set(0, 1, 0);
    outward.normalize();

    if (reference.dot(outward) < 0) face.reverse();

    const normal = new THREE.Vector3()
      .subVectors(face[1], face[0])
      .cross(new THREE.Vector3().subVectors(face[2], face[0]))
      .normalize();

    for (let i = 1; i < face.length - 1; i++) {
      for (const v of [face[0], face[i], face[i + 1]]) {
        this.positions.push(v.x, v.y, v.z);
        this.normals.push(normal.x, normal.y, normal.z);
        this.uvs.push(v.x * 0.25 + 0.5, v.z * 0.25 + 0.5);
      }
    }
  }

  addTriangle(a: Vec3, b: Vec3, c: Vec3) {
    this.addFace([a, b, c]);
  }

  addQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
    this.addFace([a, b, c]);
    this.addFace([a, c, d]);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const ring = (count: number, radius: number, y: number, offset = 0): Vec3[] =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + offset;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius] as Vec3;
  });

/**
 * Round brilliant cut (Tolkowsky style proportions, 57 facets).
 * The table faces +Y, the girdle plane sits on y = 0, the culet at the bottom.
 *
 * @param radius girdle radius
 * @param crownScale vertical scale of the crown (1 = Tolkowsky proportions)
 */
export function createRoundBrilliantGeometry(radius = 1.0, crownScale = 1.0): THREE.BufferGeometry {
  const builder = new FacetBuilder(new THREE.Vector3(0, 0, 0));

  const R = radius;
  const crownHeight = R * 0.32 * crownScale; // 16.2% of the diameter
  const pavilionDepth = R * 0.86; // 43.1% of the diameter
  const girdleThickness = R * 0.05;
  const tableRadius = R * 0.56; // 56% table

  const tableY = crownHeight;
  const girdleBottomY = -girdleThickness;
  const culetY = girdleBottomY - pavilionDepth;

  // rings ------------------------------------------------------------
  const tableVerts = ring(8, tableRadius, tableY, 0);
  const kiteApexes = ring(8, R * 0.99, crownHeight * 0.16, 0); // azimuth 45k
  const starTips = ring(8, R * 0.78, crownHeight * 0.6, Math.PI / 8); // azimuth 45k + 22.5
  const crownRing: Vec3[] = [];
  for (let i = 0; i < 8; i++) crownRing.push(kiteApexes[i], starTips[i]);

  const girdleTop = ring(16, R, 0, 0);
  const girdleBottom = ring(16, R * 0.995, girdleBottomY, 0);
  const pavilionRibs = ring(8, R * 0.46, girdleBottomY - pavilionDepth * 0.45, 0);
  const culet: Vec3 = [0, culetY, 0];

  // 1. table ---------------------------------------------------------
  for (let i = 0; i < 8; i++) {
    builder.addTriangle([0, tableY, 0], tableVerts[i], tableVerts[(i + 1) % 8]);
  }

  // 2. star facets: table edge -> star tip on the girdle ---------------
  for (let i = 0; i < 8; i++) {
    builder.addTriangle(tableVerts[i], crownRing[i * 2 + 1], tableVerts[(i + 1) % 8]);
  }

  // 3. kite / bezel facets: table vertex -> star tips -> girdle apex ----
  for (let i = 0; i < 8; i++) {
    const starBefore = crownRing[(i * 2 - 1 + 16) % 16];
    const apex = crownRing[i * 2];
    const starAfter = crownRing[i * 2 + 1];
    builder.addTriangle(tableVerts[i], starBefore, apex);
    builder.addTriangle(tableVerts[i], apex, starAfter);
  }

  // 4. upper girdle facets --------------------------------------------
  for (let i = 0; i < 16; i++) {
    builder.addQuad(crownRing[i], girdleTop[i], girdleTop[(i + 1) % 16], crownRing[(i + 1) % 16]);
  }

  // 5. girdle band ----------------------------------------------------
  for (let i = 0; i < 16; i++) {
    builder.addQuad(
      girdleTop[i],
      girdleTop[(i + 1) % 16],
      girdleBottom[(i + 1) % 16],
      girdleBottom[i]
    );
  }

  // 6. lower girdle facets + pavilion mains ----------------------------
  for (let i = 0; i < 8; i++) {
    const gA = girdleBottom[i * 2];
    const gMid = girdleBottom[i * 2 + 1];
    const gB = girdleBottom[(i * 2 + 2) % 16];
    const rib = pavilionRibs[i];
    const nextRib = pavilionRibs[(i + 1) % 8];

    builder.addTriangle(gA, rib, gMid);
    builder.addTriangle(gMid, rib, gB);
    builder.addTriangle(rib, culet, nextRib);
  }

  return builder.build();
}

/**
 * Emerald / step cut with a keeled pavilion (used for the accent baguettes).
 * The table faces +Y, the girdle plane sits on y = 0.
 */
export function createBaguetteCutGeometry(
  width = 1.0,
  depth = 0.5,
  length = 2.0
): THREE.BufferGeometry {
  const builder = new FacetBuilder(new THREE.Vector3(0, 0, 0));

  const w = width * 0.5;
  const l = length * 0.5;
  const crownH = depth * 0.35;
  const pavH = depth * 0.9;
  const chamfer = Math.min(width, length) * 0.16;

  const tableW = w * 0.7;
  const tableL = l * 0.78;
  const stepW = w * 0.86;
  const stepL = l * 0.92;

  const table: Vec3[] = [
    [-tableW, crownH, -tableL],
    [tableW, crownH, -tableL],
    [tableW, crownH, tableL],
    [-tableW, crownH, tableL],
  ];
  const step: Vec3[] = [
    [-stepW, crownH * 0.55, -stepL],
    [stepW, crownH * 0.55, -stepL],
    [stepW, crownH * 0.55, stepL],
    [-stepW, crownH * 0.55, stepL],
  ];
  const girdle: Vec3[] = [
    [-w, 0, -l + chamfer],
    [w, 0, -l + chamfer],
    [w, 0, l - chamfer],
    [-w, 0, l - chamfer],
  ];

  builder.addFace(table);

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    builder.addQuad(table[i], table[j], step[j], step[i]);
    builder.addQuad(step[i], step[j], girdle[j], girdle[i]);
  }

  const keelFront: Vec3 = [0, -pavH, -l * 0.62];
  const keelBack: Vec3 = [0, -pavH, l * 0.62];

  builder.addQuad(girdle[0], keelFront, keelBack, girdle[3]); // -X long facet
  builder.addQuad(girdle[1], girdle[2], keelBack, keelFront); // +X long facet
  builder.addTriangle(girdle[0], girdle[1], keelFront); // front end
  builder.addTriangle(girdle[2], girdle[3], keelBack); // back end

  return builder.build();
}

/** Micro-prong / bead used by the pavé setting, pointing along +Y. */
export function createProngGeometry(radius = 0.06, height = 0.2): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.45, radius, height, 10, 1);
  geometry.translate(0, height * 0.5, 0);
  return geometry;
}

/** Cabochon (dome) used for the tiny accent beads of the bail. */
export function createBeadGeometry(radius = 0.08): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  geometry.scale(1, 0.7, 1);
  return geometry;
}

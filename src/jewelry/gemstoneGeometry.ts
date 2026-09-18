import * as THREE from 'three';

/**
 * Generates an authentic 57-facet Round Brilliant Cut Diamond geometry.
 * Standard Tolkowsky / Ideal Cut proportions:
 * - Table facet (octagonal)
 * - 8 Star facets
 * - 8 Kite (Bezel) facets
 * - 16 Upper Girdle facets
 * - Girdle (faceted rim)
 * - 16 Lower Girdle facets
 * - 8 Pavilion Main facets
 * - Culet point
 */
export function createRoundBrilliantGeometry(radius: number = 1.0, depth: number = 0.62): THREE.BufferGeometry {
  const tableRadius = radius * 0.56;
  const crownHeight = depth * 0.35;
  const girdleThickness = depth * 0.04;
  const pavilionDepth = depth * 0.61;

  const positions: number[] = [];
  const normals: number[] = [];

  const starRadius = radius * 0.76;
  const starHeight = crownHeight * 0.55;

  const girdleRadius = radius;
  const girdleY = 0;
  const girdleBottomY = -girdleThickness;
  const tableY = crownHeight;
  const culetY = -girdleThickness - pavilionDepth;

  const pavilionMidRadius = radius * 0.48;
  const pavilionMidY = girdleBottomY - pavilionDepth * 0.5;

  // Helper to add a triangle with faceted flat normal
  function addTriangle(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ) {
    const v1 = new THREE.Vector3(...p1);
    const v2 = new THREE.Vector3(...p2);
    const v3 = new THREE.Vector3(...p3);

    const cb = new THREE.Vector3().subVectors(v3, v2);
    const ab = new THREE.Vector3().subVectors(v1, v2);
    cb.cross(ab).normalize();

    positions.push(
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z,
      v3.x, v3.y, v3.z
    );

    normals.push(
      cb.x, cb.y, cb.z,
      cb.x, cb.y, cb.z,
      cb.x, cb.y, cb.z
    );
  }

  // 1. Table Facet (Octagon formed by 8 triangles to center)
  const tableVerts: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    tableVerts.push([
      Math.cos(angle) * tableRadius,
      tableY,
      Math.sin(angle) * tableRadius
    ]);
  }
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    addTriangle(
      [0, tableY, 0],
      tableVerts[i],
      tableVerts[next]
    );
  }

  // 2. Star & Kite (Bezel) Facets: 16 points along crown
  // 8 Kite apex points (at angle i * 2pi/8)
  // 8 Star valley points (at angle (i + 0.5) * 2pi/8)
  const crownPoints: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const isKiteApex = i % 2 === 0;
    const r = isKiteApex ? girdleRadius * 0.98 : starRadius;
    const y = isKiteApex ? crownHeight * 0.28 : starHeight;
    crownPoints.push([Math.cos(angle) * r, y, Math.sin(angle) * r]);
  }

  // Star facets: between table edge and star points
  for (let i = 0; i < 8; i++) {
    const tableA = tableVerts[i];
    const tableB = tableVerts[(i + 1) % 8];
    const starPt = crownPoints[i * 2 + 1];
    addTriangle(tableA, starPt, tableB);
  }

  // Kite (Bezel) facets: four-sided (2 triangles)
  for (let i = 0; i < 8; i++) {
    const kiteApex = crownPoints[i * 2];
    const tablePt = tableVerts[i];
    const starLeft = crownPoints[(i * 2 - 1 + 16) % 16];
    const starRight = crownPoints[i * 2 + 1];

    addTriangle(tablePt, starLeft, kiteApex);
    addTriangle(tablePt, kiteApex, starRight);
  }

  // 3. Upper Girdle Facets (16 facets leading from crown points down to girdle)
  const girdleTopPoints: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    girdleTopPoints.push([Math.cos(angle) * girdleRadius, girdleY, Math.sin(angle) * girdleRadius]);
  }

  for (let i = 0; i < 16; i++) {
    const pCrown = crownPoints[i];
    const g1 = girdleTopPoints[i];
    const g2 = girdleTopPoints[(i + 1) % 16];
    addTriangle(pCrown, g1, g2);
  }

  // 4. Girdle Rim (16 vertical rectangle facets = 32 triangles)
  const girdleBottomPoints: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    girdleBottomPoints.push([Math.cos(angle) * girdleRadius, girdleBottomY, Math.sin(angle) * girdleRadius]);
  }

  for (let i = 0; i < 16; i++) {
    const gTop1 = girdleTopPoints[i];
    const gTop2 = girdleTopPoints[(i + 1) % 16];
    const gBot1 = girdleBottomPoints[i];
    const gBot2 = girdleBottomPoints[(i + 1) % 16];

    addTriangle(gTop1, gBot1, gBot2);
    addTriangle(gTop1, gBot2, gTop2);
  }

  // 5. Lower Girdle Facets (16 facets) & Pavilion Main Facets (8 facets)
  const pavilionRibs: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    pavilionRibs.push([
      Math.cos(angle) * pavilionMidRadius,
      pavilionMidY,
      Math.sin(angle) * pavilionMidRadius
    ]);
  }

  const culet: [number, number, number] = [0, culetY, 0];

  for (let i = 0; i < 8; i++) {
    const gBotA = girdleBottomPoints[i * 2];
    const gBotMid = girdleBottomPoints[i * 2 + 1];
    const gBotB = girdleBottomPoints[(i * 2 + 2) % 16];
    const pavPt = pavilionRibs[i];
    const pavNext = pavilionRibs[(i + 1) % 8];

    // Lower girdle pairs
    addTriangle(gBotA, pavPt, gBotMid);
    addTriangle(gBotMid, pavPt, gBotB);

    // Pavilion main facet to culet
    addTriangle(pavPt, culet, pavNext);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Generates an Emerald / Baguette Cut faceted gemstone geometry
 */
export function createBaguetteCutGeometry(
  width: number = 1.0,
  height: number = 0.5,
  length: number = 2.0
): THREE.BufferGeometry {
  const w2 = width * 0.5;
  const l2 = length * 0.5;
  const tableW = w2 * 0.65;
  const tableL = l2 * 0.75;
  const crownH = height * 0.35;
  const pavH = height * 0.65;
  const chamfer = Math.min(width, length) * 0.15;

  const positions: number[] = [];
  const normals: number[] = [];

  function addTri(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ) {
    const v1 = new THREE.Vector3(...p1);
    const v2 = new THREE.Vector3(...p2);
    const v3 = new THREE.Vector3(...p3);
    const cb = new THREE.Vector3().subVectors(v3, v2);
    const ab = new THREE.Vector3().subVectors(v1, v2);
    cb.cross(ab).normalize();

    positions.push(
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z,
      v3.x, v3.y, v3.z
    );
    normals.push(
      cb.x, cb.y, cb.z,
      cb.x, cb.y, cb.z,
      cb.x, cb.y, cb.z
    );
  }

  function addQuad(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    p4: [number, number, number]
  ) {
    addTri(p1, p2, p3);
    addTri(p1, p3, p4);
  }

  // Table (Top flat face)
  addQuad(
    [-tableW, crownH, -tableL],
    [tableW, crownH, -tableL],
    [tableW, crownH, tableL],
    [-tableW, crownH, tableL]
  );

  // Crown Slopes (Sides)
  addQuad(
    [-tableW, crownH, -tableL],
    [-tableW, crownH, tableL],
    [-w2, 0, l2 - chamfer],
    [-w2, 0, -l2 + chamfer]
  );
  addQuad(
    [tableW, crownH, tableL],
    [tableW, crownH, -tableL],
    [w2, 0, -l2 + chamfer],
    [w2, 0, l2 - chamfer]
  );
  addQuad(
    [-tableW, crownH, tableL],
    [tableW, crownH, tableL],
    [w2 - chamfer, 0, l2],
    [-w2 + chamfer, 0, l2]
  );
  addQuad(
    [tableW, crownH, -tableL],
    [-tableW, crownH, -tableL],
    [-w2 + chamfer, 0, -l2],
    [w2 - chamfer, 0, -l2]
  );

  // Pavilion (Bottom keeled pyramid)
  const keelL = tableL * 0.6;
  addQuad(
    [-w2, 0, -l2 + chamfer],
    [-w2, 0, l2 - chamfer],
    [0, -pavH, keelL],
    [0, -pavH, -keelL]
  );
  addQuad(
    [w2, 0, l2 - chamfer],
    [w2, 0, -l2 + chamfer],
    [0, -pavH, -keelL],
    [0, -pavH, keelL]
  );
  addTri(
    [-w2 + chamfer, 0, l2],
    [w2 - chamfer, 0, l2],
    [0, -pavH, keelL]
  );
  addTri(
    [w2 - chamfer, 0, -l2],
    [-w2 + chamfer, 0, -l2],
    [0, -pavH, -keelL]
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Creates micro-prong dome bead geometry
 */
export function createProngGeometry(radius: number = 0.08, height: number = 0.22): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius * 0.85, radius, height, 12, 1);
}

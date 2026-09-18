import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const THREE = await import(path.join(repo, 'node_modules/three/build/three.module.js'));
const API = await import(path.join(here, 'out/jewelry.bundle.mjs'));
const materials = API.createMaterialLibrary();

/**
 * Minimal software rasteriser used only for offline QA: it walks the real
 * three.js geometry, culls back faces, applies a simple PBR-ish shading and
 * writes a PNG. It is deliberately simple - it exists to eyeball silhouettes,
 * layout and normal orientation without a GPU/browser in the loop.
 */
const PNG = (() => {
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
  return { crc32, chunk };
})();

function encodePng(width, height, rgb) {
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
    PNG.chunk('IHDR', ihdr),
    PNG.chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    PNG.chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderScene(group, { width = 1280, height = 800, position, target = [0, 0.15, 0], fov = 34 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 200);
  camera.position.set(...position);
  camera.lookAt(...target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );

  const color = Buffer.alloc(width * height * 3, 0);
  // z is 1/w, i.e. the *inverse* distance: bigger = closer to the camera
  const depth = new Float32Array(width * height).fill(-Infinity);

  // background gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = 1 - y / height;
      const v = Math.round(26 * Math.pow(t, 2.2) + 4);
      const i = (y * width + x) * 3;
      color[i] = v;
      color[i + 1] = v;
      color[i + 2] = v;
    }
  }

  const lights = [
    { dir: new THREE.Vector3(0.55, 0.75, 0.6).normalize(), intensity: 1.0 },
    { dir: new THREE.Vector3(-0.7, -0.2, 0.5).normalize(), intensity: 0.45 },
    { dir: new THREE.Vector3(0, 1, -0.4).normalize(), intensity: 0.25 },
  ];

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const p0 = new THREE.Vector4();
  const p1 = new THREE.Vector4();
  const p2 = new THREE.Vector4();
  const faceNormal = new THREE.Vector3();

  const stats = { triangles: 0, backFacing: 0 };

  group.updateMatrixWorld(true);
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geometry = child.geometry;
    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const index = geometry.index;
    const count = index ? index.count : positionAttr.count;
    const instanced = child.isInstancedMesh;
    const instanceCount = instanced ? child.count : 1;
    const instanceMatrix = new THREE.Matrix4();

    const baseColor = new THREE.Color(materials.gem.color).lerp(
      new THREE.Color('#ffffff'),
      child.material === materials.darkMetal ? -0.6 : 0
    );
    const mix =
      child.material === materials.metal || child.material === materials.textMetal
        ? 0.78
        : child.material === materials.darkMetal
        ? 0.18
        : child.material === materials.accentGem
        ? 0.45
        : 0.62;

    for (let inst = 0; inst < instanceCount; inst++) {
      if (instanced) {
        child.getMatrixAt(inst, instanceMatrix);
        instanceMatrix.premultiply(child.matrixWorld);
      } else {
        instanceMatrix.copy(child.matrixWorld);
      }

      for (let i = 0; i < count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;

        v0.fromBufferAttribute(positionAttr, i0).applyMatrix4(instanceMatrix);
        v1.fromBufferAttribute(positionAttr, i1).applyMatrix4(instanceMatrix);
        v2.fromBufferAttribute(positionAttr, i2).applyMatrix4(instanceMatrix);

        faceNormal.subVectors(v1, v0).cross(v2.clone().sub(v0));
        if (faceNormal.lengthSq() === 0) continue;
        faceNormal.normalize();

        // cull back faces like the GPU does (FrontSide)
        const toCamera = camera.position.clone().sub(v0);
        if (faceNormal.dot(toCamera) <= 0) {
          stats.backFacing += 1;
          continue;
        }
        stats.triangles += 1;

        n0.fromBufferAttribute(normalAttr, i0).transformDirection(child.matrixWorld);
        n1.fromBufferAttribute(normalAttr, i1).transformDirection(child.matrixWorld);
        n2.fromBufferAttribute(normalAttr, i2).transformDirection(child.matrixWorld);
        // if the stored normal points inwards while the winding is outwards the
        // render is wrong: trust the winding for the light calculation
        const normalSign = faceNormal.dot(n0) >= 0 ? 1 : -1;

        p0.set(v0.x, v0.y, v0.z, 1).applyMatrix4(viewProjection);
        p1.set(v1.x, v1.y, v1.z, 1).applyMatrix4(viewProjection);
        p2.set(v2.x, v2.y, v2.z, 1).applyMatrix4(viewProjection);

        const screen = [p0, p1, p2].map((p) => {
          const invW = 1 / p.w;
          return {
            x: (p.x * invW * 0.5 + 0.5) * width,
            y: (1 - (p.y * invW * 0.5 + 0.5)) * height,
            z: invW,
          };
        });
        if (screen.some((s) => !Number.isFinite(s.x) || !Number.isFinite(s.y))) continue;

        const minX = Math.max(0, Math.floor(Math.min(screen[0].x, screen[1].x, screen[2].x)));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(screen[0].x, screen[1].x, screen[2].x)));
        const minY = Math.max(0, Math.floor(Math.min(screen[0].y, screen[1].y, screen[2].y)));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(screen[0].y, screen[1].y, screen[2].y)));
        if (minX > maxX || minY > maxY) continue;

        const area =
          (screen[0].x - screen[2].x) * (screen[1].y - screen[2].y) -
          (screen[1].x - screen[2].x) * (screen[0].y - screen[2].y);
        if (Math.abs(area) < 1e-9) continue;
        const invArea = 1 / area;

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((px - screen[2].x) * (screen[1].y - screen[2].y) -
              (screen[1].x - screen[2].x) * (py - screen[2].y)) * invArea;
            const w1 = ((screen[0].x - screen[2].x) * (py - screen[2].y) -
              (px - screen[2].x) * (screen[0].y - screen[2].y)) * invArea;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;

            const z = w0 * screen[0].z + w1 * screen[1].z + w2 * screen[2].z;
            const pixel = y * width + x;
            if (z <= depth[pixel]) continue;
            depth[pixel] = z;

            const nx = (w0 * n0.x + w1 * n1.x + w2 * n2.x) * normalSign;
            const ny = (w0 * n0.y + w1 * n1.y + w2 * n2.y) * normalSign;
            const nz = (w0 * n0.z + w1 * n1.z + w2 * n2.z) * normalSign;
            const normal = new THREE.Vector3(nx, ny, nz).normalize();

            let luminance = 0.06;
            for (const light of lights) {
              const diffuse = Math.max(0, normal.dot(light.dir));
              luminance += diffuse * light.intensity * mix;
              const view = camera.position.clone().sub(v0).normalize();
              const half = light.dir.clone().add(view).normalize();
              const spec = Math.pow(Math.max(0, normal.dot(half)), 48) * light.intensity;
              luminance += spec * (mix > 0.5 ? 0.9 : 1.4);
            }

            const value = Math.max(0, Math.min(255, Math.round(255 * Math.pow(luminance, 0.85))));
            const base = Math.round(20 * (1 - mix));
            const final = Math.max(0, Math.min(255, Math.round(value * 0.9 + base * 0.35)));
            color[pixel * 3] = final;
            color[pixel * 3 + 1] = final;
            color[pixel * 3 + 2] = final;
          }
        }
      }
    }
  });

  return { png: encodePng(width, height, color), stats };
}


export { API, THREE };

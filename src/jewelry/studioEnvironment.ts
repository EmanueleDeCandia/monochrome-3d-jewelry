import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface StudioEnvironmentResult {
  envTexture: THREE.Texture;
  keySpotLight: THREE.SpotLight;
  rimSpotLight: THREE.SpotLight;
  overheadLight: THREE.SpotLight;
  updateMouseLight: (ndcX: number, ndcY: number) => void;
  setLightingPreset: (preset: 'high_contrast' | 'soft_editorial' | 'rim_noir' | 'top_spot') => void;
}

/**
 * Creates an ultra-sharp Monochrome Keyshot Studio Equirectangular map.
 * This simulates high-end jewelry photography softboxes, strip lights, and black negative baffles.
 */
export function createMonochromeStudioTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  // Pure black studio base
  ctx.fillStyle = '#020202';
  ctx.fillRect(0, 0, width, height);

  // 1. Subtle horizon / ground gradient (monochrome)
  const groundGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
  groundGrad.addColorStop(0, '#0a0a0a');
  groundGrad.addColorStop(0.3, '#141414');
  groundGrad.addColorStop(1, '#000000');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  // 2. High-intensity Overhead Softbox (Center Zenith)
  // Essential for lighting the top faces of the 'William' text and diamond tables
  const zenithGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.18,
    10,
    width * 0.5,
    height * 0.18,
    width * 0.35
  );
  zenithGrad.addColorStop(0, '#FFFFFF');
  zenithGrad.addColorStop(0.2, '#EAEAEA');
  zenithGrad.addColorStop(0.5, '#707070');
  zenithGrad.addColorStop(0.8, '#181818');
  zenithGrad.addColorStop(1.0, 'transparent');
  ctx.fillStyle = zenithGrad;
  ctx.fillRect(0, 0, width, height * 0.5);

  // 3. Sharp Left Strip Softbox (Creates crisp linear specular lines along jewelry edges)
  const leftStrip = ctx.createLinearGradient(width * 0.18, 0, width * 0.28, 0);
  leftStrip.addColorStop(0, 'transparent');
  leftStrip.addColorStop(0.4, '#FFFFFF');
  leftStrip.addColorStop(0.6, '#FFFFFF');
  leftStrip.addColorStop(1, 'transparent');
  ctx.fillStyle = leftStrip;
  ctx.fillRect(width * 0.15, height * 0.1, width * 0.16, height * 0.5);

  // 4. Sharp Right Strip Softbox
  const rightStrip = ctx.createLinearGradient(width * 0.72, 0, width * 0.82, 0);
  rightStrip.addColorStop(0, 'transparent');
  rightStrip.addColorStop(0.4, '#FFFFFF');
  rightStrip.addColorStop(0.6, '#FFFFFF');
  rightStrip.addColorStop(1, 'transparent');
  ctx.fillStyle = rightStrip;
  ctx.fillRect(width * 0.69, height * 0.1, width * 0.16, height * 0.5);

  // 5. Back Rim Light (Separates diamond pavilion and platinum chain from black void)
  const rimGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.75,
    5,
    width * 0.5,
    height * 0.75,
    width * 0.22
  );
  rimGrad.addColorStop(0, '#A0A0A0');
  rimGrad.addColorStop(0.5, '#404040');
  rimGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(width * 0.3, height * 0.6, width * 0.4, height * 0.35);

  // 6. Micro Pin-Point Highlights (Give diamond micro-facets ultra-sharp sparkle glints)
  const pinPoints = [
    { x: width * 0.38, y: height * 0.24, r: 18 },
    { x: width * 0.62, y: height * 0.24, r: 18 },
    { x: width * 0.48, y: height * 0.35, r: 12 },
    { x: width * 0.52, y: height * 0.12, r: 24 },
  ];
  for (const pin of pinPoints) {
    const pGrad = ctx.createRadialGradient(pin.x, pin.y, 1, pin.x, pin.y, pin.r);
    pGrad.addColorStop(0, '#FFFFFF');
    pGrad.addColorStop(0.3, '#FFFFFF');
    pGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, pin.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Process through Three.js PMREMGenerator for photorealistic PBR reflections
  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.mapping = THREE.EquirectangularReflectionMapping;
  canvasTexture.colorSpace = THREE.SRGBColorSpace;
  canvasTexture.needsUpdate = true;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const renderTarget = pmremGenerator.fromEquirectangular(canvasTexture);
  canvasTexture.dispose();

  return renderTarget.texture;
}

/**
 * Sets up studio lighting and monochrome environment mapping.
 * Initializes RGBELoader for `/assets/studio_black_white_sharp.hdr`
 * with guaranteed procedural fallback.
 */
export function setupStudioLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): StudioEnvironmentResult {
  // 1. Initial Monochrome Studio PMREM Environment
  const proceduralEnv = createMonochromeStudioTexture(renderer);
  scene.environment = proceduralEnv;
  scene.background = new THREE.Color('#030303');

  // 2. Monochrome IBL Loader: Load greyscale studio HDRI as per spec
  const rgbeLoader = new RGBELoader();
  const hdrPaths = [
    '/assets/studio_black_white_sharp.hdr',
    './assets/studio_black_white_sharp.hdr',
    './textures/studio_black_white_sharp.hdr',
  ];

  function tryLoadHDR(pathIndex: number) {
    if (pathIndex >= hdrPaths.length) return;
    const path = hdrPaths[pathIndex];
    rgbeLoader.load(
      path,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
      },
      undefined,
      () => {
        // Fallback to next path or continue with high-quality procedural PMREM
        tryLoadHDR(pathIndex + 1);
      }
    );
  }
  tryLoadHDR(0);

  // 3. Key Light 1: High-intensity SpotLight (#FFFFFF) with castShadow = true
  // Creates sharp, dramatic white highlights and deep black shadows on diamond facets
  const keySpotLight = new THREE.SpotLight(0xffffff, 85);
  keySpotLight.position.set(5.5, 7.5, 6.5);
  keySpotLight.angle = Math.PI / 4.2;
  keySpotLight.penumbra = 0.35;
  keySpotLight.decay = 2.0;
  keySpotLight.distance = 40;
  keySpotLight.castShadow = true;
  keySpotLight.shadow.mapSize.width = 2048;
  keySpotLight.shadow.mapSize.height = 2048;
  keySpotLight.shadow.camera.near = 1.0;
  keySpotLight.shadow.camera.far = 30;
  keySpotLight.shadow.bias = -0.0001;
  scene.add(keySpotLight);

  // 4. Key Light 2: High-intensity Rim/Fill SpotLight (#FFFFFF) with castShadow = true
  const rimSpotLight = new THREE.SpotLight(0xffffff, 55);
  rimSpotLight.position.set(-6.5, -4.0, 5.0);
  rimSpotLight.angle = Math.PI / 3.8;
  rimSpotLight.penumbra = 0.45;
  rimSpotLight.decay = 2.0;
  rimSpotLight.distance = 35;
  rimSpotLight.castShadow = true;
  rimSpotLight.shadow.mapSize.width = 1024;
  rimSpotLight.shadow.mapSize.height = 1024;
  rimSpotLight.shadow.bias = -0.0001;
  scene.add(rimSpotLight);

  // 5. Overhead Soft Top Spot (Sculpting the nameplate and top pavé row)
  const overheadLight = new THREE.SpotLight(0xffffff, 40);
  overheadLight.position.set(0, 9.0, 2.0);
  overheadLight.angle = Math.PI / 3.0;
  overheadLight.penumbra = 0.6;
  overheadLight.castShadow = false;
  scene.add(overheadLight);

  // Dynamic light offset target coordinates
  const defaultKeyPos = keySpotLight.position.clone();
  let targetX = defaultKeyPos.x;
  let targetY = defaultKeyPos.y;

  const updateMouseLight = (ndcX: number, ndcY: number) => {
    // Subtle cursor offset tracking (dancing specular highlights across 'William' text)
    targetX = defaultKeyPos.x + ndcX * 3.2;
    targetY = defaultKeyPos.y + ndcY * 2.8;
    keySpotLight.position.x += (targetX - keySpotLight.position.x) * 0.08;
    keySpotLight.position.y += (targetY - keySpotLight.position.y) * 0.08;
  };

  const setLightingPreset = (preset: 'high_contrast' | 'soft_editorial' | 'rim_noir' | 'top_spot') => {
    switch (preset) {
      case 'high_contrast':
        keySpotLight.intensity = 85;
        rimSpotLight.intensity = 55;
        overheadLight.intensity = 40;
        break;
      case 'soft_editorial':
        keySpotLight.intensity = 50;
        rimSpotLight.intensity = 40;
        overheadLight.intensity = 70;
        break;
      case 'rim_noir':
        keySpotLight.intensity = 30;
        rimSpotLight.intensity = 95;
        overheadLight.intensity = 20;
        break;
      case 'top_spot':
        keySpotLight.intensity = 40;
        rimSpotLight.intensity = 30;
        overheadLight.intensity = 100;
        break;
    }
  };

  return {
    envTexture: proceduralEnv,
    keySpotLight,
    rimSpotLight,
    overheadLight,
    updateMouseLight,
    setLightingPreset,
  };
}

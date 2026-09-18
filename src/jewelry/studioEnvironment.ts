import * as THREE from 'three';
import { findBackdrop, findLighting, type BackdropId, type EnvPresetId, type LightingPresetId } from './types';

export interface StudioEnvironmentResult {
  /** regenerates the IBL for another softbox layout, releasing the previous one */
  setEnvPreset: (preset: EnvPresetId) => void;
  setLightingPreset: (preset: LightingPresetId) => void;
  setEnvIntensity: (value: number) => void;
  /** degrees */
  setEnvRotation: (degrees: number) => void;
  setLightIntensity: (scale: number) => void;
  setBackdrop: (id: BackdropId) => void;
  setBackdropVisible: (visible: boolean) => void;
  setPointerLight: (enabled: boolean) => void;
  /** feeds the normalised device coordinates of the pointer (-1..1) */
  updatePointer: (ndcX: number, ndcY: number) => void;
  /** eases the pointer light towards its target, called once per frame */
  tick: () => void;
  setShadows: (enabled: boolean) => void;
  backdrop: THREE.Mesh;
  dispose: () => void;
}

/**
 * Paints a monochrome studio HDRI (equirectangular) on a 2D canvas.
 *
 * The repository used to ship a 45 byte placeholder file named
 * `studio_black_white_sharp.hdr` whose RGBELoader parsing always failed, so the
 * "HDRI" lighting never worked. Generating the environment procedurally keeps
 * the project self-contained (0 assets, no network round-trip) and makes the
 * softbox layout switchable at runtime.
 */
export function paintStudioEnvironment(preset: EnvPresetId, width = 1024): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // studio black base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const drawSoftBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    intensity: number,
    softness = 0.5
  ) => {
    const g = ctx.createRadialGradient(x, y, 1, x, y, Math.max(w, h) / 2);
    const inner = Math.round(255 * intensity);
    const mid = Math.round(inner * 0.55);
    g.addColorStop(0, `rgb(${inner},${inner},${inner})`);
    g.addColorStop(Math.min(0.85, softness), `rgb(${mid},${mid},${mid})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    void softness;
  };

  const drawStrip = (
    x: number,
    widthPct: number,
    topPct: number,
    heightPct: number,
    intensity: number
  ) => {
    const w = width * widthPct;
    const x0 = x - w / 2;
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    const v = Math.round(255 * intensity);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgb(${v},${v},${v})`);
    g.addColorStop(0.55, `rgb(${v},${v},${v})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, height * topPct, w, height * heightPct);
  };

  // 1. ground / horizon falloff, common to every layout
  const floor = ctx.createLinearGradient(0, height * 0.5, 0, height);
  floor.addColorStop(0, '#0d0d0d');
  floor.addColorStop(0.55, '#151515');
  floor.addColorStop(1, '#000000');
  ctx.fillStyle = floor;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  switch (preset) {
    case 'studio': {
      // even dome: neutral, flat, great for CAD readability
      const dome = ctx.createLinearGradient(0, 0, 0, height * 0.6);
      dome.addColorStop(0, '#c9c9c9');
      dome.addColorStop(0.55, '#6b6b6b');
      dome.addColorStop(1, '#101010');
      ctx.fillStyle = dome;
      ctx.fillRect(0, 0, width, height * 0.6);
      drawSoftBox(width * 0.5, height * 0.22, width * 0.5, height * 0.55, 1.0, 0.6);
      break;
    }
    case 'softbox': {
      // two strip boxes + top: the classic jewellery setup
      drawStrip(width * 0.2, 0.11, 0.05, 0.55, 1.0);
      drawStrip(width * 0.8, 0.11, 0.05, 0.55, 1.0);
      drawSoftBox(width * 0.5, height * 0.14, width * 0.4, height * 0.4, 0.9, 0.55);
      drawSoftBox(width * 0.5, height * 0.78, width * 0.5, height * 0.3, 0.35, 0.6);
      break;
    }
    case 'dome': {
      // huge soft light from above, open shadows (editorial soft)
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#9a9a9a');
      g.addColorStop(0.62, '#3a3a3a');
      g.addColorStop(1, '#050505');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height * 0.75);
      drawSoftBox(width * 0.5, height * 0.3, width * 0.85, height * 0.7, 1.0, 0.75);
      break;
    }
    case 'noir':
    default: {
      // single hard key light and deep black baffles
      const baffle = ctx.createLinearGradient(0, 0, width, 0);
      baffle.addColorStop(0, '#050505');
      baffle.addColorStop(0.5, '#1b1b1b');
      baffle.addColorStop(1, '#050505');
      ctx.fillStyle = baffle;
      ctx.fillRect(0, height * 0.2, width, height * 0.5);
      drawSoftBox(width * 0.34, height * 0.2, width * 0.22, height * 0.34, 1.0, 0.35);
      drawStrip(width * 0.86, 0.05, 0.3, 0.35, 0.5);
      drawSoftBox(width * 0.5, height * 0.86, width * 0.3, height * 0.25, 0.22, 0.5);
      break;
    }
  }

  return canvas;
}

function equirectTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function paintBackdrop(stops: [string, string, string]): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = stops[2];
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(
      size * 0.5,
      size * 0.42,
      size * 0.02,
      size * 0.5,
      size * 0.45,
      size * 0.72
    );
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sets up the studio: procedural IBL, three sculpting spot lights, a backdrop
 * dome and the optional pointer-following key light.
 */
export function setupStudioLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): StudioEnvironmentResult {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let envTarget: THREE.WebGLRenderTarget | null = null;
  let envTexture: THREE.Texture = new THREE.Texture();

  const applyEnv = (preset: EnvPresetId) => {
    const previousTarget = envTarget;
    const previousTexture = envTexture;

    const next = equirectTexture(paintStudioEnvironment(preset));
    const target = pmrem.fromEquirectangular(next);
    next.dispose();

    envTarget = target;
    envTexture = target.texture;
    scene.environment = envTexture;

    if (previousTarget) previousTarget.dispose();
    previousTexture.dispose();
  };

  // IBL ---------------------------------------------------------------
  scene.environmentIntensity = 1;
  applyEnv('softbox');
  scene.background = null;

  // backdrop dome ------------------------------------------------------
  let backdropTexture = paintBackdrop(findBackdrop('black').stops);
  const backdropMaterial = new THREE.MeshBasicMaterial({
    map: backdropTexture,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: true,
  });
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 24), backdropMaterial);
  backdrop.name = 'StudioBackdrop';
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  // lights -------------------------------------------------------------
  // decay = 0 keeps the intensities independent from the camera distance, so
  // the presets stay predictable while the user tweaks exposure.
  const keySpotLight = new THREE.SpotLight(0xffffff, 2.2, 0, Math.PI / 5, 0.45, 0);
  keySpotLight.position.set(6.5, 8.5, 8.0);
  keySpotLight.castShadow = true;
  keySpotLight.shadow.mapSize.set(2048, 2048);
  keySpotLight.shadow.camera.near = 1;
  keySpotLight.shadow.camera.far = 36;
  keySpotLight.shadow.bias = -0.0004;
  keySpotLight.shadow.normalBias = 0.02;
  scene.add(keySpotLight);
  scene.add(keySpotLight.target);

  const rimSpotLight = new THREE.SpotLight(0xffffff, 1.4, 0, Math.PI / 3.6, 0.6, 0);
  rimSpotLight.position.set(-7.5, -3.5, 5.5);
  rimSpotLight.castShadow = true;
  rimSpotLight.shadow.mapSize.set(1024, 1024);
  rimSpotLight.shadow.bias = -0.0006;
  rimSpotLight.shadow.normalBias = 0.03;
  scene.add(rimSpotLight);
  scene.add(rimSpotLight.target);

  const overheadLight = new THREE.SpotLight(0xffffff, 1.0, 0, Math.PI / 2.6, 0.75, 0);
  overheadLight.position.set(0, 10, 2.5);
  scene.add(overheadLight);
  scene.add(overheadLight.target);

  let presetScale = { key: 1, rim: 1, top: 1 };
  let masterScale = 1;
  let pointerLightEnabled = false;
  const pointerTarget = new THREE.Vector2(0, 0);
  const keyHome = keySpotLight.position.clone();

  const applyLightIntensity = () => {
    keySpotLight.intensity = 2.2 * presetScale.key * masterScale;
    rimSpotLight.intensity = 1.4 * presetScale.rim * masterScale;
    overheadLight.intensity = 1.0 * presetScale.top * masterScale;
  };
  applyLightIntensity();

  return {
    setEnvPreset: (preset) => applyEnv(preset),
    setLightingPreset: (preset) => {
      const definition = findLighting(preset);
      presetScale = { key: definition.key, rim: definition.rim, top: definition.top };
      applyLightIntensity();
      applyEnv(definition.envPreset);
      scene.environmentIntensity = definition.envIntensity;
    },
    setEnvIntensity: (value) => {
      scene.environmentIntensity = Math.max(0, value);
    },
    setEnvRotation: (degrees) => {
      scene.environmentRotation.set(0, THREE.MathUtils.degToRad(degrees), 0);
    },
    setLightIntensity: (scale) => {
      masterScale = scale;
      applyLightIntensity();
    },
    setBackdrop: (id) => {
      const definition = findBackdrop(id);
      const previous = backdropTexture;
      backdropTexture = paintBackdrop(definition.stops);
      backdropMaterial.map = backdropTexture;
      backdropMaterial.needsUpdate = true;
      previous.dispose();
    },
    setBackdropVisible: (visible) => {
      backdrop.visible = visible;
    },
    setPointerLight: (enabled) => {
      pointerLightEnabled = enabled;
      if (!enabled) {
        keySpotLight.position.copy(keyHome);
        pointerTarget.set(0, 0);
      }
    },
    updatePointer: (ndcX, ndcY) => {
      if (!pointerLightEnabled) return;
      pointerTarget.set(ndcX, ndcY);
    },
    tick: () => {
      // subtle pointer-following key light: the old build moved a 85 cd
      // spotlight on every mousemove, which washed out the piece.
      const targetX = keyHome.x + (pointerLightEnabled ? pointerTarget.x * 1.6 : 0);
      const targetY = keyHome.y + (pointerLightEnabled ? pointerTarget.y * 1.2 : 0);
      keySpotLight.position.x += (targetX - keySpotLight.position.x) * 0.06;
      keySpotLight.position.y += (targetY - keySpotLight.position.y) * 0.06;
    },
    setShadows: (enabled) => {
      renderer.shadowMap.enabled = enabled;
    },
    backdrop,
    dispose: () => {
      pmrem.dispose();
      if (envTarget) envTarget.dispose();
      else envTexture.dispose();
      backdropTexture.dispose();
      if (backdropMaterial.map && backdropMaterial.map !== backdropTexture) {
        backdropMaterial.map.dispose();
      }
      backdropMaterial.dispose();
      backdrop.geometry.dispose();
      [keySpotLight, rimSpotLight, overheadLight].forEach((light) => {
        light.shadow?.map?.dispose();
        light.removeFromParent();
      });
    },
  };
}

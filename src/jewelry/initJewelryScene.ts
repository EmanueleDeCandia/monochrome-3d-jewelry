import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMonochromeJewelryMaterials } from './materials';
import { setupStudioLighting, StudioEnvironmentResult } from './studioEnvironment';
import { setupPostprocessing, PostprocessingPipeline } from './postprocessing';
import { buildJewelryPiece, JewelryAssembly } from './jewelryBuilder';

export interface JewelrySceneOptions {
  initialText?: string;
  onMaterialChange?: (material: 'platinum' | 'diamond' | 'obsidian') => void;
  onStatsUpdate?: (stats: { polyCount: number; diamondCount: number; fps: number }) => void;
}

export interface JewelrySceneHandle {
  toggleTextMaterial: () => 'platinum' | 'diamond' | 'obsidian';
  setTextMaterial: (type: 'platinum' | 'diamond' | 'obsidian') => void;
  getTextMaterial: () => 'platinum' | 'diamond' | 'obsidian';
  updateText: (text: string) => Promise<void>;
  setCameraView: (view: 'hero' | 'front' | 'macro' | 'back' | 'top') => void;
  setWireframe: (enabled: boolean) => void;
  setLightingPreset: (preset: 'high_contrast' | 'soft_editorial' | 'rim_noir' | 'top_spot') => void;
  setExposure: (val: number) => void;
  toggleAutoRotate: () => boolean;
  isAutoRotating: () => boolean;
  captureScreenshot: (scale?: number) => string;
  dispose: () => void;
}

/**
 * Initializes the Zero-Shot Hyper-Realistic 3D Jewelry Scene.
 * Strictly Monochrome PBR, High-Contrast Studio Lighting, Anti-Glare Post-processing.
 */
export async function initJewelryScene(
  canvas: HTMLCanvasElement,
  options: JewelrySceneOptions = {}
): Promise<JewelrySceneHandle> {
  const initialText = options.initialText || 'William';

  // 1. Scene, Camera, WebGLRenderer with shadowMap enabled
  const scene = new THREE.Scene();
  scene.name = 'JewelryStudioScene';

  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
  camera.position.set(2.2, 1.4, 8.8); // Sophisticated 3/4 luxury CAD Hero angle
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08; // strictly between 1.0 and 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. Grayscale Studio Environment & Dynamic Lights Setup
  const studio: StudioEnvironmentResult = setupStudioLighting(scene, renderer);

  // 3. Monochrome PBR Materials Matrix
  const materials = createMonochromeJewelryMaterials();

  // 4. Procedural Jewelry Assembly ('William' 3D text + micro-pavé diamonds + Cuban chain)
  const assembly: JewelryAssembly = await buildJewelryPiece(materials, initialText);
  scene.add(assembly.group);

  // Calculate polygon statistics
  let polyCount = 0;
  assembly.group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      if (geom.index) {
        polyCount += geom.index.count / 3;
      } else if (geom.attributes.position) {
        polyCount += geom.attributes.position.count / 3;
      }
    }
  });

  // 5. Post-Processing Pipeline (Anti-Glare Bloom, SSAO, FXAA, Tone Mapping clamp)
  const postprocessing: PostprocessingPipeline = setupPostprocessing(
    renderer,
    scene,
    camera,
    width,
    height
  );

  // 6. Interactive Setup: OrbitControls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05; // smooth cinematic inertia
  controls.minDistance = 3.6;   // clamped so camera cannot penetrate text mesh
  controls.maxDistance = 18.0;
  controls.maxPolarAngle = Math.PI * 0.90;
  controls.minPolarAngle = Math.PI * 0.10;
  controls.target.set(0, 0.2, 0);

  // 7. Dynamic Light Reflection (Mouse Tracking)
  let mouseNdcX = 0;
  let mouseNdcY = 0;
  const raycaster = new THREE.Raycaster();
  const mouseCoord = new THREE.Vector2();

  let pointerDownPos = { x: 0, y: 0 };
  let isPointerDown = false;
  let autoRotate = true;
  let lastUserInteractionTime = Date.now();

  const handlePointerMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouseNdcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseCoord.set(mouseNdcX, mouseNdcY);

    studio.updateMouseLight(mouseNdcX, mouseNdcY);

    if (isPointerDown) {
      lastUserInteractionTime = Date.now();
    }
  };

  const handlePointerDown = (e: MouseEvent) => {
    isPointerDown = true;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    lastUserInteractionTime = Date.now();
  };

  // 8. Material Hot-Swap (Click Effect on Jewelry Piece)
  const handlePointerUp = (e: MouseEvent) => {
    isPointerDown = false;
    lastUserInteractionTime = Date.now();

    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If it was a click (not a camera orbit drag)
    if (dist < 6) {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const intersects = raycaster.intersectObjects(assembly.raycastTargets, true);
      if (intersects.length > 0) {
        // Clicked jewelry piece: toggle text material between Platinum and Diamond
        const newMat = assembly.toggleTextMaterial();
        options.onMaterialChange?.(newMat);
      }
    }
  };

  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mouseup', handlePointerUp);

  // Camera animation interpolation helper
  let targetCamPos: THREE.Vector3 | null = null;
  let targetControlsTarget: THREE.Vector3 | null = null;

  const setCameraView = (view: 'hero' | 'front' | 'macro' | 'back' | 'top') => {
    lastUserInteractionTime = Date.now() + 3000;
    switch (view) {
      case 'hero':
        targetCamPos = new THREE.Vector3(2.4, 1.6, 8.4);
        targetControlsTarget = new THREE.Vector3(0, 0.2, 0);
        break;
      case 'front':
        targetCamPos = new THREE.Vector3(0, 0, 8.6);
        targetControlsTarget = new THREE.Vector3(0, 0, 0);
        break;
      case 'macro':
        targetCamPos = new THREE.Vector3(0.5, 0.3, 4.4);
        targetControlsTarget = new THREE.Vector3(0, 0.2, 0);
        break;
      case 'back':
        targetCamPos = new THREE.Vector3(0.2, 0.4, -8.6);
        targetControlsTarget = new THREE.Vector3(0, 0, 0);
        break;
      case 'top':
        targetCamPos = new THREE.Vector3(0, 8.5, 3.2);
        targetControlsTarget = new THREE.Vector3(0, 0, 0);
        break;
    }
  };

  // Resize handler
  const handleResize = () => {
    const w = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    const h = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    postprocessing.resize(w, h);
  };
  window.addEventListener('resize', handleResize);

  // 9. requestAnimationFrame Render Loop with subtle auto-rotation
  let animationFrameId: number;
  let frameCount = 0;
  let lastFpsTime = performance.now();

  const animate = (currentTime: number) => {
    animationFrameId = requestAnimationFrame(animate);

    // Smooth camera transition if active
    if (targetCamPos && targetControlsTarget) {
      camera.position.lerp(targetCamPos, 0.06);
      controls.target.lerp(targetControlsTarget, 0.06);
      if (camera.position.distanceTo(targetCamPos) < 0.05) {
        targetCamPos = null;
        targetControlsTarget = null;
      }
    }

    // Subtle auto-rotation when user is not interacting
    const idleTime = Date.now() - lastUserInteractionTime;
    if (autoRotate && idleTime > 1800 && !isPointerDown && !targetCamPos) {
      assembly.group.rotation.y += 0.0035;
    }

    // OrbitControls damping update
    controls.update();

    // Subtle breathing float on jewelry group
    const floatOffset = Math.sin(currentTime * 0.0012) * 0.04;
    assembly.group.position.y = floatOffset;

    // Render through Post-Processing EffectComposer
    postprocessing.render();

    // FPS & stats calculation
    frameCount++;
    if (currentTime - lastFpsTime >= 1000) {
      const currentFps = Math.round((frameCount * 1000) / (currentTime - lastFpsTime));
      options.onStatsUpdate?.({
        polyCount,
        diamondCount: 68,
        fps: currentFps,
      });
      frameCount = 0;
      lastFpsTime = currentTime;
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  // 10. Public API Handle
  return {
    toggleTextMaterial: () => assembly.toggleTextMaterial(),
    setTextMaterial: (type) => assembly.setTextMaterial(type),
    getTextMaterial: () => assembly.textMaterialType,
    updateText: async (newText: string) => {
      await assembly.updateText(newText);
    },
    setCameraView,
    setWireframe: (enabled) => assembly.setWireframe(enabled),
    setLightingPreset: (preset) => studio.setLightingPreset(preset),
    setExposure: (val) => {
      // Clamped strictly between 1.0 and 1.2
      renderer.toneMappingExposure = Math.min(1.2, Math.max(1.0, val));
    },
    toggleAutoRotate: () => {
      autoRotate = !autoRotate;
      return autoRotate;
    },
    isAutoRotating: () => autoRotate,
    captureScreenshot: (scale: number = 1.0) => {
      // Hide helpers, render crisp monochrome screenshot
      postprocessing.render();
      return canvas.toDataURL('image/png', scale);
    },
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('mousedown', handlePointerDown);
      canvas.removeEventListener('mouseup', handlePointerUp);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    },
  };
}

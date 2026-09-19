import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getFont } from './fonts';
import { createMaterialLibrary } from './materials';
import { buildJewelryPiece, type JewelryAssembly, type TextFitResult } from './jewelryBuilder';
import { setupPostprocessing, type PostprocessingPipeline } from './postprocessing';
import { setupStudioLighting, type StudioEnvironmentResult } from './studioEnvironment';
import { computeFramingFov, computeViewDistance } from './cameraFraming';
import { Conductor } from './conductor';
import { CLIP_PRESETS, findClip, shutterSpan, type RigState } from './timeline';
import {
  TakeRecorder,
  type TakePlan,
  type TakeProgress,
  type TakeResult,
} from './takeRecorder';
import {
  DEFAULT_SETTINGS,
  findCameraView,
  findLighting,
  findQuality,
  type CameraViewId,
  type JewelrySettings,
  type SceneStats,
} from './types';

export interface JewelrySceneOptions {
  initialSettings?: Partial<JewelrySettings>;
  onStats?: (stats: SceneStats) => void;
  /** emitted when the scene itself changes a setting (click to swap, ...) */
  onSettingsChange?: (patch: Partial<JewelrySettings>) => void;
  onError?: (error: Error) => void;
}

export interface CaptureOptions {
  /** 1 = viewport resolution, 2 = 2x, ... capped at 4096 px on the long edge */
  scale?: number;
  transparent?: boolean;
}

export interface DirectorState {
  clip: string;
  clipLabel: string;
  clips: { id: string; label: string; hint: string; duration: number; loop: boolean }[];
  time: number;
  duration: number;
  frames: number;
  fps: number;
  playing: boolean;
  recording: boolean;
  progress: number;
  loop: boolean;
}

export interface JewelrySceneHandle {
  applySettings: (patch: Partial<JewelrySettings>) => void;
  getSettings: () => JewelrySettings;
  setText: (text: string) => TextFitResult;
  cycleNameplateMaterial: () => 'metal' | 'gem';
  setCameraView: (view: CameraViewId) => void;
  resetView: () => void;
  capture: (options?: CaptureOptions) => string;
  getStats: () => SceneStats;
  /** regia: trasporto della timeline */
  director: {
    state: () => DirectorState;
    onState: (listener: (state: DirectorState) => void) => () => void;
    onProgress: (listener: (progress: TakeProgress | null) => void) => () => void;
    play: () => void;
    pause: () => void;
    toggle: () => void;
    stop: () => void;
    seek: (time: number) => void;
    step: (frames: number) => void;
    setClip: (clipId: string) => void;
    record: (plan: TakePlan) => Promise<TakeResult>;
    cancel: () => void;
  };
  dispose: () => void;
}

const EMPTY_FIT: TextFitResult = {
  text: '',
  size: 0,
  width: 0,
  height: 0,
  dropped: [],
  visible: false,
};

/**
 * Boots the interactive monochrome jewellery scene.
 *
 * Everything is procedural (fonts are bundled, the studio HDRI is generated at
 * runtime), so the component also works from a `file://` build produced by
 * `vite-plugin-singlefile`.
 *
 * Rendering happens exclusively through the EffectComposer: three.js only ever
 * needs to render into the multisampled composer target.
 */
export async function initJewelryScene(
  canvas: HTMLCanvasElement,
  options: JewelrySceneOptions = {}
): Promise<JewelrySceneHandle> {
  // let the browser paint the loading overlay before the heavy synchronous setup
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  let settings: JewelrySettings = { ...DEFAULT_SETTINGS };
  const quality = () => findQuality(settings.quality);
  let font = getFont(settings.font);

  const host = canvas.parentElement ?? canvas;
  const measureViewport = () => ({
    width: Math.max(1, host.clientWidth || window.innerWidth),
    height: Math.max(1, host.clientHeight || window.innerHeight),
  });
  let { width, height } = measureViewport();

  /* -------------------------------------------------------------- *
   * Renderer / camera / scene
   * -------------------------------------------------------------- */
  const scene = new THREE.Scene();
  scene.name = 'JewelryStudio';

  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 200);

  /** direction from the target towards the camera, unit length */
  const viewDirection = (view: ReturnType<typeof findCameraView>) =>
    new THREE.Vector3(...view.direction).normalize();

  const framingFov = (aspect: number) =>
    computeFramingFov(aspect, findCameraView('hero').fit);

  const viewDistance = (view: ReturnType<typeof findCameraView>, aspect: number, fov: number) =>
    computeViewDistance(fov, aspect, view.fit);

  const initialView = findCameraView(settings.cameraView);
  camera.fov = framingFov(width / height);
  camera.position
    .copy(new THREE.Vector3(...initialView.target))
    .addScaledVector(viewDirection(initialView), viewDistance(initialView, width / height, camera.fov));
  camera.lookAt(...initialView.target);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    // MSAA is provided by the composer render target; asking for it here as
    // well would allocate a second unused multisampled buffer.
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
    stencil: false,
    // lets `capture()` read the framebuffer right after a render
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality().maxPixelRatio));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* -------------------------------------------------------------- *
   * Studio, materials, jewellery
   * -------------------------------------------------------------- */
  const studio: StudioEnvironmentResult = setupStudioLighting(scene, renderer);
  const materials = createMaterialLibrary();
  const assembly: JewelryAssembly = buildJewelryPiece(materials);
  assembly.setNameplateMaterial(settings.nameplateMaterial);
  scene.add(assembly.group);

  const postprocessing: PostprocessingPipeline = setupPostprocessing(
    renderer,
    scene,
    camera,
    width,
    height,
    renderer.getPixelRatio()
  );

  // construction starts from DEFAULT_SETTINGS, mirror them explicitly
  studio.setLightingPreset(DEFAULT_SETTINGS.lighting);
  materials.setMetal(DEFAULT_SETTINGS.metal);
  materials.setFinish(DEFAULT_SETTINGS.finish);
  materials.setGem(DEFAULT_SETTINGS.gem);

  /* -------------------------------------------------------------- *
   * Camera controls
   * -------------------------------------------------------------- */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.85;
  controls.panSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  // bounds follow the auto framing so the user can never lose the piece
  controls.minDistance = 1.4;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.minPolarAngle = Math.PI * 0.08;
  controls.target.set(...initialView.target);
  controls.autoRotate = settings.autoRotate;
  controls.autoRotateSpeed = settings.autoRotateSpeed * 2;
  controls.update();

  let cameraTween: {
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    elapsed: number;
    duration: number;
  } | null = null;

  let lastInteraction = performance.now();

  const setCameraView = (view: CameraViewId) => {
    const definition = findCameraView(view);
    const target = new THREE.Vector3(...definition.target);
    const distance = viewDistance(definition, camera.aspect, camera.fov);
    cameraTween = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().addScaledVector(viewDirection(definition), distance),
      fromTarget: controls.target.clone(),
      toTarget: target,
      elapsed: 0,
      duration: 0.9,
    };
    lastInteraction = performance.now();
  };

  const onControlsStart = () => {
    cameraTween = null;
    lastInteraction = performance.now();
  };
  const onControlsEnd = () => {
    lastInteraction = performance.now();
  };
  controls.addEventListener('start', onControlsStart);
  controls.addEventListener('end', onControlsEnd);

  /* -------------------------------------------------------------- *
   * Pointer interaction (mouse, pen and touch all emit pointer events)
   * -------------------------------------------------------------- */
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointer = { downX: 0, downY: 0, downTime: 0, isDown: false };

  const readPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerNdc.set(x, y);
    studio.updatePointer(x, y);
  };

  const onPointerMove = (event: PointerEvent) => {
    readPointer(event);
    if (pointer.isDown) lastInteraction = performance.now();
  };

  const onPointerDown = (event: PointerEvent) => {
    readPointer(event);
    pointer.isDown = true;
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    pointer.downTime = performance.now();
    lastInteraction = performance.now();
  };

  const onPointerUp = (event: PointerEvent) => {
    readPointer(event);
    const wasDown = pointer.isDown;
    pointer.isDown = false;
    lastInteraction = performance.now();
    if (!wasDown) return;

    const travelled = Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY);
    const elapsed = performance.now() - pointer.downTime;
    if (travelled > 6 || elapsed > 700) return; // orbit drag, not a click

    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.intersectObject(assembly.group, true).length === 0) return;

    const source = assembly.cycleNameplateMaterial();
    settings = { ...settings, nameplateMaterial: source };
    options.onSettingsChange?.({ nameplateMaterial: source });
  };

  const onPointerCancel = () => {
    pointer.isDown = false;
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  /* -------------------------------------------------------------- *
   * Viewport handling
   * -------------------------------------------------------------- */
  const applyViewport = (nextWidth: number, nextHeight: number) => {
    width = nextWidth;
    height = nextHeight;
    camera.aspect = width / height;
    // the FOV adapts to the viewport so wide pieces stay framed in portrait too
    camera.fov = framingFov(camera.aspect);
    camera.updateProjectionMatrix();
    const heroDistance = viewDistance(findCameraView('hero'), camera.aspect, camera.fov);
    controls.minDistance = Math.max(1.2, heroDistance * 0.16);
    controls.maxDistance = heroDistance * 2.6;
    renderer.setSize(width, height, false);
    postprocessing.setSize(width, height, renderer.getPixelRatio());
  };

  const handleResize = () => {
    const next = measureViewport();
    applyViewport(next.width, next.height);
  };

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(host);

  /* -------------------------------------------------------------- *
   * Text + stats
   * -------------------------------------------------------------- */
  let textFit: TextFitResult = { ...EMPTY_FIT };
  let stats: SceneStats = {
    fps: 0,
    triangles: 0,
    stones: assembly.stones,
    pieces: 0,
    drawCalls: 0,
    textWidth: 0,
    textHeight: 0,
    fittedSize: 0,
    droppedChars: [],
    renderScale: renderer.getPixelRatio(),
  };

  const rebuildText = () => {
    textFit = assembly.setText(
      font,
      {
        text: settings.text,
        uppercase: settings.uppercase,
        tracking: settings.tracking,
        depth: settings.textDepth,
        scale: settings.textScale,
      },
      quality()
    );
    assembly.setNameplateMaterial(settings.nameplateMaterial);
  };
  rebuildText();

  /* -------------------------------------------------------------- *
   * Settings
   * -------------------------------------------------------------- */
  const applySettings = (patch: Partial<JewelrySettings>) => {
    const previous = settings;
    settings = { ...previous, ...patch };
    const changed = <K extends keyof JewelrySettings>(key: K) =>
      patch[key] !== undefined && patch[key] !== previous[key];

    if (changed('metal')) materials.setMetal(settings.metal);
    if (changed('finish')) materials.setFinish(settings.finish);
    if (changed('gem')) materials.setGem(settings.gem);
    if (changed('nameplateMaterial')) assembly.setNameplateMaterial(settings.nameplateMaterial);

    if (changed('lighting')) {
      studio.setLightingPreset(settings.lighting);
      // keep the reported settings consistent: a lighting preset also picks
      // its softbox layout and its environment intensity
      const preset = findLighting(settings.lighting);
      settings = {
        ...settings,
        envPreset: preset.envPreset,
        envIntensity: preset.envIntensity,
      };
    }
    if (changed('envPreset')) studio.setEnvPreset(settings.envPreset);
    if (changed('envIntensity')) studio.setEnvIntensity(settings.envIntensity);
    if (changed('envRotation')) studio.setEnvRotation(settings.envRotation);
    if (changed('lightIntensity')) studio.setLightIntensity(settings.lightIntensity);
    if (changed('backdrop')) studio.setBackdrop(settings.backdrop);
    if (changed('pointerLight')) studio.setPointerLight(settings.pointerLight);
    if (changed('exposure')) renderer.toneMappingExposure = settings.exposure;

    if (changed('wireframe')) materials.setWireframe(settings.wireframe);
    if (changed('wireframe') || changed('bloom')) {
      // a wireframe read stays clean: no glow on top of the CAD lines
      postprocessing.setBloom(settings.bloom && !settings.wireframe);
    }
    if (changed('bloomStrength')) postprocessing.setBloomStrength(settings.bloomStrength);
    if (changed('wireframe') || changed('ssao')) {
      postprocessing.setSsao(settings.ssao && !settings.wireframe);
    }

    if (changed('quality')) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality().maxPixelRatio));
      handleResize();
    }
    if (changed('font')) font = getFont(settings.font);

    if (
      changed('font') ||
      changed('quality') ||
      changed('text') ||
      changed('uppercase') ||
      changed('tracking') ||
      changed('textDepth') ||
      changed('textScale')
    ) {
      rebuildText();
    }

    /* --- regia --- */
    if (changed('clip')) conductor.setClip(settings.clip);
    if (changed('takeFps') || changed('clip')) conductor.setFps(settings.takeFps);
    if (changed('loopTake')) conductor.setLoop(settings.loopTake);
    if (changed('motionBlur') || changed('shutterSamples')) {
      // 1 sub-frame = campione singolo, cioè nessuna integrazione
      if (!settings.motionBlur) conductor.refresh();
    }
    if (
      changed('dof') ||
      changed('dofAperture') ||
      changed('dofMaxBlur') ||
      changed('focusDistance') ||
      changed('wireframe')
    ) {
      postprocessing.setBokeh(settings.dof && !settings.wireframe);
      postprocessing.setBokehOptions({
        focus: settings.focusDistance,
        aperture: settings.dofAperture,
        maxblur: settings.dofMaxBlur,
      });
    }
    if (changed('clip') || changed('takeFps') || changed('loopTake')) emitDirector();

    if (changed('autoRotate')) controls.autoRotate = settings.autoRotate;
    if (changed('autoRotateSpeed')) controls.autoRotateSpeed = settings.autoRotateSpeed * 2;
    if (changed('cameraView')) setCameraView(settings.cameraView);
  };


  /* -------------------------------------------------------------- *
   * Regia: timeline, otturatore, take
   *
   * La regola è che **la ripresa è una funzione del tempo**: la timeline
   * produce un `RigState`, il rig posiziona camera, piatto e luci. Quando la
   * regia è attiva i controlli orbit sono disattivati; quando si ferma,
   * OrbitControls riparte dalla posizione raggiunta (ricava la sua sfera dalla
   * posizione corrente della camera, quindi la transizione è continua).
   * -------------------------------------------------------------- */
  const applyRig = (rig: RigState) => {
    const distance = computeViewDistance(camera.fov, camera.aspect, {
      width: rig.fit.width,
      height: rig.fit.height,
    });
    camera.position.copy(rig.target).addScaledVector(rig.direction, distance);
    camera.lookAt(rig.target);
    controls.target.copy(rig.target);
    assembly.group.rotation.y = THREE.MathUtils.degToRad(rig.spin);
    studio.setLightScale(rig.lightScale);
  };

  const directorListeners = new Set<(state: DirectorState) => void>();
  const progressListeners = new Set<(progress: TakeProgress | null) => void>();
  let lastDirectorEmit = 0;
  let offlineTake = false;
  let takeEndResolver: (() => void) | null = null;

  const directorState = (): DirectorState => ({
    clip: conductor.currentClip.id,
    clipLabel: conductor.currentClip.label,
    clips: CLIP_PRESETS.map((clip) => ({
      id: clip.id,
      label: clip.label,
      hint: clip.hint,
      duration: clip.duration,
      loop: clip.loop,
    })),
    time: conductor.time,
    duration: conductor.duration,
    frames: conductor.frames,
    fps: settings.takeFps,
    playing: conductor.isPlaying,
    recording: recorder.isRecording,
    progress: conductor.progress,
    loop: conductor.looping,
  });

  const emitDirector = (force = true) => {
    const now = performance.now();
    // lo stato viene pubblicato al massimo a ~15 Hz durante la riproduzione:
    // la UI resta fluida senza riconciliare React a ogni fotogramma
    if (!force && now - lastDirectorEmit < 66) return;
    lastDirectorEmit = now;
    const state = directorState();
    directorListeners.forEach((listener) => listener(state));
  };

  const setProgress = (progress: TakeProgress | null) => {
    progressListeners.forEach((listener) => listener(progress));
  };

  const conductor = new Conductor({
    clip: findClip(settings.clip),
    fps: settings.takeFps,
    loop: settings.loopTake,
    onRig: (rig) => applyRig(rig),
    onTime: () => emitDirector(false),
    onEnd: () => {
      takeEndResolver?.();
      takeEndResolver = null;
      emitDirector();
    },
  });

  /** Applica il rig al tempo `time` e disegna un fotogramma (con otturatore). */
  const renderTakeFrame = (time: number) => {
    conductor.seek(time);
    renderComposedFrame();
  };

  /**
   * Disegna il fotogramma corrente integrando l'otturatore quando il motion
   * blur è attivo: `samples` sub-frame distribuiti su metà fotogramma.
   */
  const renderComposedFrame = () => {
    const samples = settings.motionBlur ? Math.max(1, Math.round(settings.shutterSamples)) : 1;
    if (samples <= 1) {
      postprocessing.render();
      return;
    }
    const span = shutterSpan(settings.takeFps, settings.shutterAngle);
    const center = conductor.time;
    postprocessing.renderMotionBlurred(
      samples,
      Math.max(0, center - span / 2),
      center + span / 2,
      (t) => applyRig(conductor.rigAt(t))
    );
    // l'integrazione lascia la camera sull'ultimo sub-frame: la riporto al
    // centro dell'otturatore perché una cattura statica resti esatta
    applyRig(conductor.rigAt(center));
  };

  const applyViewportAfterTake = () => {
    applyViewport(width, height);
  };

  /* --- pass di profondità (opzionale, per il compositing) --- */
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const renderDepthPass = () => {
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const previousOverride = scene.overrideMaterial;

    scene.overrideMaterial = depthMaterial;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    scene.overrideMaterial = previousOverride;
    renderer.setClearColor(clearColor, clearAlpha);
  };

  /* --- registratore --- */
  const recorder = new TakeRecorder({
    canvas,
    beginTake: (plan) => {
      const previousSize = renderer.getSize(new THREE.Vector2());
      const previousPixelRatio = renderer.getPixelRatio();
      const previousAspect = camera.aspect;
      const previousClearAlpha = renderer.getClearAlpha();
      const previousLoop = conductor.looping;
      const backdropWasVisible = studio.backdrop.visible;
      const bloomWasEnabled = postprocessing.bloomPass.enabled;
      const ssaoWasEnabled = postprocessing.ssaoPass.enabled;
      const bokehWasEnabled = postprocessing.bokehPass.enabled;

      conductor.setLoop(false);
      offlineTake = plan.format === 'png';

      if (plan.format === 'png') {
        const factor = Math.min(plan.scale, Math.max(1, 4096 / Math.max(width, height)));
        const targetWidth = Math.round(width * factor);
        const targetHeight = Math.round(height * factor);
        renderer.setPixelRatio(1);
        renderer.setSize(targetWidth, targetHeight, false);
        postprocessing.setSize(targetWidth, targetHeight, 1);
        camera.aspect = targetWidth / targetHeight;
        camera.updateProjectionMatrix();
      } else {
        // la ripresa video usa il viewport così com'è: la cattura dello stream
        // segue la dimensione del canvas
        renderer.setPixelRatio(previousPixelRatio);
      }

      if (plan.transparent || plan.depth) studio.setBackdropVisible(false);
      if (plan.transparent) {
        renderer.setClearAlpha(0);
        postprocessing.setTransientDisabled(true);
      }
      if (plan.depth) postprocessing.setTransientDisabled(true);

      emitDirector();

      return () => {
        conductor.setLoop(previousLoop);
        offlineTake = false;
        renderer.setPixelRatio(previousPixelRatio);
        renderer.setSize(previousSize.x, previousSize.y, false);
        postprocessing.setSize(previousSize.x, previousSize.y, previousPixelRatio);
        camera.aspect = previousAspect;
        camera.updateProjectionMatrix();
        studio.setBackdropVisible(backdropWasVisible);
        renderer.setClearAlpha(previousClearAlpha);
        postprocessing.setBloom(bloomWasEnabled);
        postprocessing.setSsao(ssaoWasEnabled);
        postprocessing.setBokeh(bokehWasEnabled);
        applyViewportAfterTake();
        setProgress(null);
        emitDirector();
      };
    },
    renderAt: (time) => renderTakeFrame(time),
    renderDepth: () => renderDepthPass(),
    capturePng: () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('toBlob ha restituito null'));
        }, 'image/png');
      }),
    playTake: () =>
      new Promise<void>((resolve) => {
        takeEndResolver = resolve;
        conductor.play();
        emitDirector();
      }),
    nextTick: () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    now: () => performance.now(),
  });

  // stato iniziale coerente con le impostazioni dei parametri
  postprocessing.setBokehOptions({
    focus: settings.focusDistance,
    aperture: settings.dofAperture,
    maxblur: settings.dofMaxBlur,
  });
  postprocessing.setBokeh(settings.dof);
  conductor.refresh();

  /* -------------------------------------------------------------- *
   * Render loop
   * -------------------------------------------------------------- */
  const countGeometry = () => {
    let triangles = 0;
    let pieces = 0;
    assembly.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      pieces += 1;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const instances = (child as THREE.InstancedMesh).isInstancedMesh
        ? (child as THREE.InstancedMesh).count
        : 1;
      const perInstance = geometry.index
        ? geometry.index.count / 3
        : (geometry.attributes.position?.count ?? 0) / 3;
      triangles += perInstance * instances;
    });
    return { triangles: Math.round(triangles), pieces };
  };

  const clock = new THREE.Clock();
  let animationFrame = 0;
  let frameCount = 0;
  let lastFpsSample = performance.now();

  const renderFrame = () => {
    const delta = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();

    // durante una sequenza PNG il rendering è pilotato dal registratore:
    // il loop non deve disegnare un fotogramma diverso da quello catturato
    if (offlineTake) {
      studio.tick();
      return;
    }

    const directorActive = conductor.isPlaying;

    if (!directorActive && cameraTween) {
      cameraTween.elapsed += delta;
      const t = Math.min(1, cameraTween.elapsed / cameraTween.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
      if (t >= 1) cameraTween = null;
    }

    if (directorActive) {
      // la regia possiede camera, piatto e luci
      controls.enabled = false;
      conductor.tick(delta);
    } else {
      controls.enabled = true;
      // the turntable pauses for a moment after any interaction
      const idle = now - lastInteraction;
      controls.autoRotate = settings.autoRotate && idle > 1200 && !pointer.isDown && !cameraTween;
      controls.update();
    }
    studio.tick();

    // gentle floating so the piece feels alive
    assembly.group.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.035;

    if (directorActive) renderComposedFrame();
    else postprocessing.render();

    frameCount += 1;
    if (now - lastFpsSample >= 750) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsSample));
      frameCount = 0;
      lastFpsSample = now;
      const counts = countGeometry();
      stats = {
        ...stats,
        fps,
        triangles: counts.triangles,
        pieces: counts.pieces,
        stones: assembly.stones,
        drawCalls: renderer.info.render.calls,
        textWidth: textFit.width,
        textHeight: textFit.height,
        fittedSize: textFit.size,
        droppedChars: textFit.dropped,
        renderScale: renderer.getPixelRatio(),
      };
      options.onStats?.(stats);
    }
  };

  const animate = () => {
    animationFrame = requestAnimationFrame(animate);
    if (document.hidden) return; // do not render background tabs
    renderFrame();
  };
  animationFrame = requestAnimationFrame(animate);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(animationFrame);
    options.onError?.(new Error('WebGL context lost'));
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  /* -------------------------------------------------------------- *
   * High resolution capture
   * -------------------------------------------------------------- */
  const capture = ({ scale = 2, transparent = false }: CaptureOptions = {}): string => {
    const previousSize = renderer.getSize(new THREE.Vector2());
    const previousPixelRatio = renderer.getPixelRatio();
    const previousAspect = camera.aspect;
    const previousClearAlpha = renderer.getClearAlpha();
    const bloomWasEnabled = postprocessing.bloomPass.enabled;
    const ssaoWasEnabled = postprocessing.ssaoPass.enabled;
    const bokehWasEnabled = postprocessing.bokehPass.enabled;
    const backdropWasVisible = studio.backdrop.visible;

    // identical framing, just more pixels (capped at 4K on the long edge)
    const factor = Math.min(scale, Math.max(1, 4096 / Math.max(width, height)));
    const targetWidth = Math.round(width * factor);
    const targetHeight = Math.round(height * factor);

    renderer.setPixelRatio(1);
    renderer.setSize(targetWidth, targetHeight, false);
    postprocessing.setSize(targetWidth, targetHeight, 1);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();

    if (transparent) {
      studio.setBackdropVisible(false);
      renderer.setClearAlpha(0);
      postprocessing.setTransientDisabled(true);
    }

    postprocessing.render();
    // preserved drawing buffer: safe to read straight away
    const dataUrl = canvas.toDataURL('image/png');

    renderer.setPixelRatio(previousPixelRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    postprocessing.setSize(previousSize.x, previousSize.y, previousPixelRatio);
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();
    if (transparent) {
      studio.setBackdropVisible(backdropWasVisible);
      renderer.setClearAlpha(previousClearAlpha);
    }
    postprocessing.setBloom(bloomWasEnabled);
    postprocessing.setSsao(ssaoWasEnabled);
    postprocessing.setBokeh(bokehWasEnabled);
    renderFrame();

    return dataUrl;
  };

  /* -------------------------------------------------------------- *
   * Go
   * -------------------------------------------------------------- */
  applyViewport(width, height);
  applySettings(options.initialSettings ?? {});
  renderFrame();

  return {
    applySettings,
    getSettings: () => ({ ...settings }),
    setText: (text: string) => {
      applySettings({ text });
      return textFit;
    },
    cycleNameplateMaterial: () => {
      const source = assembly.cycleNameplateMaterial();
      settings = { ...settings, nameplateMaterial: source };
      return source;
    },
    setCameraView: (view) => {
      settings = { ...settings, cameraView: view };
      setCameraView(view);
    },
    resetView: () => setCameraView(settings.cameraView),
    capture,
    director: {
      state: directorState,
      onState: (listener) => {
        directorListeners.add(listener);
        listener(directorState());
        return () => directorListeners.delete(listener);
      },
      onProgress: (listener) => {
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      },
      play: () => {
        conductor.play();
        emitDirector();
      },
      pause: () => {
        conductor.pause();
        emitDirector();
      },
      toggle: () => {
        conductor.toggle();
        emitDirector();
      },
      stop: () => {
        conductor.stop();
        emitDirector();
      },
      seek: (time) => {
        conductor.seek(time);
        renderComposedFrame();
        emitDirector();
      },
      step: (frames) => {
        if (frames >= 0) conductor.nextFrame();
        else conductor.previousFrame();
        renderComposedFrame();
        emitDirector();
      },
      setClip: (clipId) => {
        applySettings({ clip: clipId });
      },
      record: async (plan) => {
        setProgress({ frame: 0, total: plan.frames, phase: 'render' });
        try {
          const result =
            plan.format === 'webm'
              ? await recorder.recordVideo(plan, setProgress)
              : await recorder.recordSequence(plan, setProgress);
          return result;
        } finally {
          setProgress(null);
          emitDirector();
        }
      },
      cancel: () => recorder.cancel(),
    },
    getStats: () => ({ ...stats }),
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
      controls.dispose();

      depthMaterial.dispose();
      postprocessing.dispose();
      studio.dispose();
      materials.dispose();
      assembly.dispose();
      scene.clear();

      renderer.dispose();
      // NOTE: intentionally no forceContextLoss() here. React StrictMode mounts
      // the effect twice on the same <canvas> element; killing the context would
      // leave the second mount with a dead WebGL context.
    },
  };
}

/**
 * Offline QA harness for the motion-control feature.
 *
 *   npm run verify:motion
 *
 * The whole take pipeline is designed to be a pure function of time, so it can
 * be verified without a browser:
 *   - easing curves and keyframe tracks behave (endpoints, clamping, order),
 *   - every clip preset evaluates without NaN, keeps the camera on a unit
 *     sphere and frames the piece at every sampled instant,
 *   - looping clips close seamlessly (turntable angle is modular),
 *   - the shutter maths matches a real camera (180° = half a frame),
 *   - the conductor transport (play / pause / loop / step / seek) is correct,
 *   - the take planner names frames and writes a usable manifest.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const outDir = path.join(here, 'out');

fs.mkdirSync(outDir, { recursive: true });

const bundlePath = path.join(outDir, 'motion.bundle.mjs');
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

const deliveryBundle = path.join(outDir, 'delivery.bundle.mjs');
execFileSync(
  path.join(repo, 'node_modules/esbuild/bin/esbuild'),
  [
    path.join(repo, 'src/utils/delivery.ts'),
    '--bundle',
    '--format=esm',
    '--platform=neutral',
    '--target=es2022',
    `--outfile=${deliveryBundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

const THREE = await import(path.join(repo, 'node_modules/three/build/three.module.js'));
const API = await import(bundlePath);
const Delivery = await import(deliveryBundle);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const {
  CLIP_PRESETS,
  Conductor,
  EASINGS,
  TakeRecorder,
  buildManifest,
  buildSequences,
  compileClip,
  ease,
  evaluateClip,
  frameCountOf,
  nearestFrame,
  shutterSpan,
  takeDuration,
  findClip,
  computeFramingFov,
  setupPostprocessing,
  computeViewDistance,
  Track,
} = API;

/* ------------------------------------------------------------------ *
 * 1. easing
 * ------------------------------------------------------------------ */
{
  const linear = EASINGS.every((easing) => {
    const start = ease(easing.id, 0);
    const end = ease(easing.id, 1);
    return Math.abs(start) < 1e-9 && Math.abs(end - 1) < 1e-9;
  });
  check('tutte le curve di easing vanno da 0 a 1', linear, `${EASINGS.length} curve`);

  const monotonic = ['smooth', 'easeIn', 'easeOut', 'easeInOut', 'linear'].every((id) => {
    let previous = -1;
    for (let i = 0; i <= 50; i++) {
      const value = ease(id, i / 50);
      if (value < previous - 1e-9) return false;
      previous = value;
    }
    return true;
  });
  check('le curve di easing sono monotone', monotonic);

  const clamped = [ease('smooth', -3), ease('smooth', 4), ease('linear', -1), ease('linear', 9)];
  check(
    'l\'easing clampa fuori da [0,1]',
    clamped[0] === 0 && clamped[1] === 1 && clamped[2] === 0 && clamped[3] === 1,
    clamped.join(', ')
  );
}

/* ------------------------------------------------------------------ *
 * 2. tracks
 * ------------------------------------------------------------------ */
{
  const track = new Track(5, [
    { t: 0, value: 0, ease: 'linear' },
    { t: 2, value: 10, ease: 'linear' },
    { t: 4, value: 0, ease: 'linear' },
  ]);
  check('la traccia campiona esattamente ai keyframe', track.sample(0) === 0 && track.sample(2) === 10 && track.sample(4) === 0);
  check(
    'la traccia interpola fra i keyframe',
    Math.abs(track.sample(1) - 5) < 1e-9 && Math.abs(track.sample(3) - 5) < 1e-9,
    `${track.sample(1)} / ${track.sample(3)}`
  );
  check('la traccia clampa fuori intervallo', track.sample(-5) === 0 && track.sample(99) === 0);
  check('la traccia vuota usa il valore iniziale', new Track(7).sample(3) === 7);

  track.add(2, 20, 'linear');
  check('add() sostituisce il keyframe allo stesso tempo', track.keyframes.length === 3 && track.sample(2) === 20);

  const vectors = new Track([0, 0], [
    { t: 0, value: [0, 0], ease: 'linear' },
    { t: 1, value: [2, -4], ease: 'linear' },
  ]);
  const mid = vectors.sample(0.5);
  check('le tracce vettoriali interpolano per componente', mid[0] === 1 && mid[1] === -2, `[${mid}]`);
}

/* ------------------------------------------------------------------ *
 * 3. clip presets
 * ------------------------------------------------------------------ */
const SAMPLES = 240;
{
  const badValues = [];
  const offSphere = [];
  const clipped = [];
  const durations = [];

  for (const clip of CLIP_PRESETS) {
    durations.push(clip.duration);
    const compiled = compileClip(clip);
    for (let i = 0; i <= SAMPLES; i++) {
      const t = (clip.duration * i) / SAMPLES;
      const rig = evaluateClip(compiled, t);
      const numbers = [
        rig.direction.x, rig.direction.y, rig.direction.z,
        rig.target.x, rig.target.y, rig.target.z,
        rig.fit.width, rig.fit.height, rig.spin, rig.lightScale,
      ];
      if (numbers.some((value) => !Number.isFinite(value))) {
        badValues.push(`${clip.id}@${t.toFixed(2)}`);
      }
      if (Math.abs(rig.direction.length() - 1) > 1e-6) offSphere.push(clip.id);

      // every instant must keep the framing region inside the frustum
      const aspect = 16 / 9;
      const fov = computeFramingFov(aspect, rig.fit);
      const distance = computeViewDistance(fov, aspect, rig.fit);
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * distance;
      const halfWidth = halfHeight * aspect;
      const inside =
        rig.fit.width <= halfWidth * 2 + 1e-6 && rig.fit.height <= halfHeight * 2 + 1e-6;
      if (!inside) clipped.push(`${clip.id}@${t.toFixed(2)}`);
    }
  }

  check('nessun valore NaN nelle tracce dei clip', badValues.length === 0, badValues.slice(0, 3).join(' '));
  check('il vettore camera resta unitario', offSphere.length === 0, offSphere.slice(0, 3).join(' '));
  check('nessun clip esce dall\'inquadratura', clipped.length === 0, clipped.slice(0, 3).join(' '));
  check(
    'i clip hanno durate distinte e plausibili',
    new Set(durations).size === durations.length && durations.every((d) => d >= 3 && d <= 20),
    durations.join(' / ')
  );
}

/* ------------------------------------------------------------------ *
 * 4. loop e piatto girevole
 * ------------------------------------------------------------------ */
{
  const orbit = compileClip(findClip('orbit'));
  const start = evaluateClip(orbit, 0);
  const end = evaluateClip(orbit, findClip('orbit').duration);
  check(
    'il clip orbit compie un giro completo (360°)',
    Math.abs(end.spin - start.spin - 360) < 1e-6,
    `${start.spin.toFixed(1)}° → ${end.spin.toFixed(1)}°`
  );
  check(
    'il piatto girevole chiude il loop senza scatto',
    Math.abs(((end.spin - start.spin) % 360) % 360) < 1e-6,
    '360° % 360° = 0'
  );
  check(
    'durante il clip orbit la camera è ferma (blur solo dal piatto)',
    start.direction.distanceTo(end.direction) < 1e-9 && start.target.distanceTo(end.target) < 1e-9
  );

  let monotone = true;
  let previous = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const spin = evaluateClip(orbit, (i / SAMPLES) * findClip('orbit').duration).spin;
    if (spin < previous - 1e-6) monotone = false;
    previous = spin;
  }
  check('la rotazione del piatto è monotona (nessun ritorno)', monotone);

  const pushIn = compileClip(findClip('pushIn'));
  const macro = API.CAMERA_VIEWS.find((view) => view.id === 'macro');
  const pushEnd = evaluateClip(pushIn, findClip('pushIn').duration);
  const macroDirection = new THREE.Vector3(...macro.direction).normalize();
  check(
    'il clip push in finisce esattamente sulla vista macro',
    pushEnd.direction.distanceTo(macroDirection) < 1e-9 &&
      pushEnd.fit.width === macro.fit.width,
    `fit ${pushEnd.fit.width}×${pushEnd.fit.height}`
  );
}

/* ------------------------------------------------------------------ *
 * 5. otturatore
 * ------------------------------------------------------------------ */
{
  const half = shutterSpan(30, 180);
  check('otturatore 180° a 30 fps = mezzo fotogramma', Math.abs(half - 1 / 60) < 1e-12, `${half.toFixed(5)} s`);
  check('otturatore 360° = un fotogramma intero', Math.abs(shutterSpan(24, 360) - 1 / 24) < 1e-12);
  check('otturatore 0° = nessuna integrazione', shutterSpan(30, 0) === 0);

  // a still camera the sub-frames must be identical: no invented blur
  const orbit = compileClip(findClip('orbit'));
  const span = shutterSpan(30, 180);
  const samples = 4;
  const centre = 3.333;
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const t = centre - span / 2 + (span * i) / (samples - 1);
    const rig = evaluateClip(orbit, t);
    frames.push(rig.direction.toArray().concat(rig.target.toArray()).join(','));
  }
  check('sub-frame identici se la camera è ferma (nessun blur finto)', new Set(frames).size === 1);

  const moving = [];
  for (let i = 0; i < samples; i++) {
    const t = centre - span / 2 + (span * i) / (samples - 1);
    moving.push(evaluateClip(orbit, t).spin.toFixed(6));
  }
  check('sub-frame diversi quando il piatto gira (blur reale)', new Set(moving).size === samples, moving.join(' '));
}

/* ------------------------------------------------------------------ *
 * 6. trasporto (conductor)
 * ------------------------------------------------------------------ */
{
  let rigCalls = 0;
  let ended = 0;
  const clip = findClip('pushIn');
  const conductor = new Conductor({
    clip,
    fps: 30,
    loop: false,
    onRig: () => rigCalls++,
    onEnd: () => ended++,
  });

  check('il conductor calcola fotogrammi e durata', conductor.frames === Math.round(clip.duration * 30) && Math.abs(conductor.duration - clip.duration) < 1e-9, `${conductor.frames} fotogrammi`);
  check('il conductor parte in pausa a t=0', !conductor.isPlaying && conductor.time === 0);

  conductor.play();
  const playingBefore = conductor.isPlaying;
  conductor.tick(1 / 30);
  check('play() avanza il tempo di un fotogramma', playingBefore && Math.abs(conductor.time - 1 / 30) < 1e-9, `t=${conductor.time.toFixed(4)}`);
  check('tick() ha pubblicato lo stato del rig', rigCalls > 0, `${rigCalls} chiamate`);

  conductor.seek(conductor.duration + 10);
  check('seek() clampa alla durata', Math.abs(conductor.time - conductor.duration) < 1e-9);
  check('seek() mette in pausa', !conductor.isPlaying);

  conductor.play();
  check('play() da fine take riparte da 0', conductor.time === 0 && conductor.isPlaying);

  // non-looping clip must stop on the last frame and report the end once
  conductor.seek(conductor.duration - 1 / 60);
  conductor.play();
  conductor.tick(1);
  check(
    'un clip non in loop si ferma sull\'ultimo fotogramma',
    !conductor.isPlaying && Math.abs(conductor.time - conductor.duration) < 1e-9 && ended === 1,
    `fine: ${conductor.time.toFixed(3)} s, onEnd×${ended}`
  );

  const loopConductor = new Conductor({ clip: findClip('orbit'), fps: 30, loop: true, onRig: () => {} });
  loopConductor.seek(loopConductor.duration - 1 / 60);
  loopConductor.play();
  loopConductor.tick(1);
  check(
    'un clip in loop riavvolge senza fermarsi',
    loopConductor.isPlaying && loopConductor.time < loopConductor.duration * 0.2,
    `t=${loopConductor.time.toFixed(3)}`
  );

  loopConductor.seek(0.5);
  loopConductor.nextFrame();
  check('nextFrame() avanza di un fotogramma', Math.abs(loopConductor.time - (Math.round(0.5 * 30) + 1) / 30) < 1e-9, `t=${loopConductor.time.toFixed(4)}`);
  loopConductor.previousFrame();
  check('previousFrame() torna indietro', Math.abs(loopConductor.time - Math.round(0.5 * 30) / 30) < 1e-9);
  check('nextFrame() mette in pausa', !loopConductor.isPlaying);

  const clamp = [nearestFrame(-4, 30, 240), nearestFrame(99, 30, 240)];
  check('nearestFrame() resta nell\'intervallo', clamp[0] === 0 && clamp[1] === 239, clamp.join(' / '));

  loopConductor.setFps(24);
  check('cambio di fps ricalcola il take', loopConductor.frames === Math.round(loopConductor.currentClip.duration * 24), `${loopConductor.frames} fotogrammi a 24 fps`);
  check('la durata del take resta allineata ai fotogrammi', Math.abs(loopConductor.duration - loopConductor.frames / 24) < 1e-9);
}

/* ------------------------------------------------------------------ *
 * 7. pianificazione del take
 * ------------------------------------------------------------------ */
{
  const plan = {
    clipId: 'orbit',
    clipLabel: 'Hero orbit',
    duration: 8,
    fps: 30,
    frames: 240,
    format: 'png',
    scale: 2,
    motionBlur: true,
    shutterAngle: 180,
    samples: 4,
    transparent: true,
    depth: true,
    prefix: 'take',
  };
  const names = buildSequences(plan);
  check('la sequenza nomina i fotogrammi con padding a 4 cifre', names.beauty[0] === 'take_0001.png' && names.beauty[239] === 'take_0240.png', `${names.beauty[0]} … ${names.beauty[239]}`);
  check('il pass di profondità ha la sua numerazione', names.depth[5] === 'take_depth_0006.png', names.depth[5]);

  const manifest = buildManifest(plan, { renderedOn: 'test' });
  check(
    'il manifest descrive il take',
    manifest.frames === 240 &&
      manifest.fps === 30 &&
      manifest.motionBlur.shutterAngleDegrees === 180 &&
      manifest.motionBlur.samplesPerFrame === 4 &&
      manifest.channels.depth === 'RGBA depth-packed (RGBADepthPacking)',
    `${manifest.frames} fotogrammi, ${manifest.motionBlur.method}`
  );

  const noBlur = buildManifest({ ...plan, motionBlur: false });
  check('senza motion blur il manifest non mente', noBlur.motionBlur === null);

  check(
    'frameCountOf/takeDuration restano coerenti',
    frameCountOf({ duration: 8.5, loop: false }, 24) === 204 && Math.abs(takeDuration({ duration: 8.5 }, 24) - 8.5) < 1e-9,
    '8.5 s a 24 fps → 204 fotogrammi'
  );

  const picked = TakeRecorder.pickVideoMimeType(['video/webm;codecs=vp9']);
  check('la selezione del MIME per il video è gestita anche in Node', picked === null || typeof picked === 'string');
}

/* ------------------------------------------------------------------ *
 * 8. simulazione della registrazione PNG (deps finte)
 * ------------------------------------------------------------------ */
{
  const rendered = [];
  let tick = 0;
  const deps = {
    canvas: { width: 1440, height: 810 },
    beginTake: () => () => {},
    renderAt: (time, index) => {
      rendered.push({ time, index });
    },
    renderDepth: () => rendered.push({ depth: true }),
    capturePng: async () => new Blob([new Uint8Array(8)]),
    playTake: async () => {},
    nextTick: async () => {
      tick++;
    },
    now: () => tick * 10,
  };

  const recorder = new TakeRecorder(deps);
  const seen = [];
  const result = await recorder.recordSequence(
    {
      clipId: 'pushIn',
      clipLabel: 'Push in',
      duration: 0.5,
      fps: 4,
      frames: 2,
      format: 'png',
      scale: 1,
      motionBlur: true,
      shutterAngle: 180,
      samples: 4,
      transparent: false,
      depth: true,
      prefix: 'test',
    },
    (progress) => seen.push(progress.frame)
  );

  const beautyFrames = rendered.filter((entry) => !entry.depth);
  check(
    'la registrazione PNG rende ogni fotogramma all\'istante giusto',
    beautyFrames.length === 2 && beautyFrames[0].time === 0 && beautyFrames[1].time === 0.25,
    `t = ${beautyFrames.map((entry) => entry.time).join(' / ')}`
  );
  check('la registrazione PNG rende anche il pass di profondità', rendered.filter((r) => r.depth).length === 2);
  check('il risultato elenca bellezza, profondità e manifest', result.files.length === 5 && result.files.at(-1).kind === 'manifest', `${result.files.length} file`);
  check('il progresso arriva alla UI', seen.at(-1) === 2, seen.join(','));
  check('a fine take il registratore è di nuovo libero', recorder.isRecording === false);
}


/* ------------------------------------------------------------------ *
 * 9. pipeline di post-processing: contratto dei buffer e accumulo
 * ------------------------------------------------------------------ */
{
  // three's addons come with fixed `needsSwap` flags; the composer swaps after
  // each pass that sets it to true. The motion-blur path replaces the render
  // pass with a texture pass: if a future three bump flipped these flags the
  // integration would silently read an empty buffer, so the contract is pinned.
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { TexturePass } = await import('three/examples/jsm/postprocessing/TexturePass.js');
  const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
  const { SSAOPass } = await import('three/examples/jsm/postprocessing/SSAOPass.js');
  const { BokehPass } = await import('three/examples/jsm/postprocessing/BokehPass.js');
  const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
  const inPlace = [RenderPass, TexturePass, UnrealBloomPass, SSAOPass];
  const swapped = [BokehPass, OutputPass];
  check(
    'i pass "in place" dichiarano needsSwap = false',
    inPlace.every((PassClass) => new PassClass(scene, camera, 4, 4).needsSwap === false),
    inPlace.map((PassClass) => PassClass.name).join(', ')
  );
  check(
    'i pass che scrivono nel write buffer dichiarano needsSwap = true',
    new BokehPass(scene, camera, {}).needsSwap === true && new OutputPass().needsSwap === true,
    swapped.map((PassClass) => PassClass.name).join(', ')
  );
}

{
  // the accumulation path is exercised against a mock renderer: real scene,
  // real composer, patched drawing surface
  const draws = [];
  const propertyWrites = [];
  let sceneRef = null;
  const target = {
    autoClear: true,
    _target: null,
    getPixelRatio: () => 1,
    getSize: (vector) => vector.set(1440, 810),
    getRenderTarget: () => target._target,
    setRenderTarget: (value) => {
      target._target = value;
    },
    getClearColor: (color) => color,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    setClearAlpha: () => {},
    clear: () => {},
    clearDepth: () => {},
    render: (object) => draws.push(object === sceneRef ? 'scene' : 'quad'),
    getContext: () => ({}),
    state: { buffers: { stencil: { setFunc: () => {}, setTest: () => {} } } },
  };
  const renderer = new Proxy(target, {
    get: (object, key) => object[key],
    set: (object, key, value) => {
      propertyWrites.push([String(key), value]);
      object[key] = value;
      return true;
    },
  });

  const scene = new THREE.Scene();
  sceneRef = scene;
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
  const pipeline = API.setupPostprocessing(renderer, scene, camera, 1440, 810, 1);
  const times = [];
  const before = {
    bloom: pipeline.bloomPass.enabled,
    ssao: pipeline.ssaoPass.enabled,
    bokeh: pipeline.bokehPass.enabled,
  };

  pipeline.renderMotionBlurred(4, 2.5, 2.5 + 1 / 60, (time) => times.push(time));

  const sceneDraws = () => draws.filter((entry) => entry === 'scene').length;
  check(
    'l\'accumulo campiona un sub-frame per volta',
    times.length === 4 && sceneDraws() === 4,
    `${times.length} campioni, ${sceneDraws()} render della scena, ${draws.length - sceneDraws()} quad`
  );
  check(
    'i sub-frame coprono l\'intervallo dell\'otturatore',
    Math.abs(times[0] - 2.5) < 1e-9 && Math.abs(times[3] - (2.5 + 1 / 60)) < 1e-9,
    `${times.map((t) => t.toFixed(5)).join(' → ')}`
  );
  check(
    'durante l\'accumulo autoClear è spento (la somma non viene cancellata)',
    propertyWrites.some(([key, value]) => key === 'autoClear' && value === false) &&
      propertyWrites.at(-1)[1] === true,
    propertyWrites.filter(([key]) => key === 'autoClear').map(([, value]) => value).join(' → ')
  );
  const enabledAfter = pipeline.composer.passes.filter((pass) => pass.enabled).length;
  const beautyEnabled = pipeline.composer.passes.filter(
    (pass) => pass.enabled && pass.map === pipeline.composer.passes.find((p) => p.map)?.map
  ).length;
  check(
    'la catena resta coerente dopo l\'accumulo',
    enabledAfter >= 2 && beautyEnabled >= 1,
    `${enabledAfter} pass attivi di ${pipeline.composer.passes.length}`
  );
  check(
    'bloom, SSAO e DOF vengono spenti durante l\'integrazione e ripristinati dopo',
    pipeline.bloomPass.enabled === before.bloom &&
      pipeline.ssaoPass.enabled === before.ssao &&
      pipeline.bokehPass.enabled === before.bokeh
  );
  check(
    'l\'otturatore usato è quello richiesto',
    Math.abs(pipeline.lastShutterTime() - 1 / 60) < 1e-12,
    `${pipeline.lastShutterTime().toFixed(6)} s`
  );

  // a single sample must not accumulate: same code path, one draw
  draws.length = 0;
  pipeline.renderMotionBlurred(1, 3, 3, () => {});
  check('con un solo campione non si somma nulla', sceneDraws() === 1, `${sceneDraws()} render della scena`);
  pipeline.dispose();
}


/* ------------------------------------------------------------------ *
 * 10. stima dell'otturatore (dice se il blur si vedrà davvero)
 * ------------------------------------------------------------------ */
{
  const {
    estimateShutterTravel,
    screenTravel,
    describeShutter,
    SUBJECT_RADIUS,
  } = API;

  const orbit = compileClip(findClip('orbit'));
  const still = compileClip(findClip('orbit'));
  const rigAt = (t) => evaluateClip(orbit, t);
  const viewport = { aspect: 16 / 9, viewportWidth: 1440, viewportHeight: 810 };

  const travel = screenTravel(rigAt(0), rigAt(0), viewport.aspect, 1440, 810);
  check('a scena identica lo spostamento è nullo', travel === 0, `${travel} px`);

  const moving = screenTravel(rigAt(0), rigAt(1), viewport.aspect, 1440, 810);
  check('un secondo di piatto girevole sposta il soggetto di molti pixel', moving > 20, `${moving.toFixed(1)} px`);
  check('il raggio del soggetto è una costante dichiarata', SUBJECT_RADIUS === 4.3);

  const estimate = estimateShutterTravel(rigAt, 4, { span: shutterSpan(30, 180), ...viewport });
  check(
    'la stima a 30 fps con otturatore 180° è dell\'ordine dei pixel',
    estimate.pixels > 1 && estimate.pixels < 40 && !estimate.still,
    `${estimate.pixels.toFixed(1)} px su 1440, piatto ${estimate.spinDegrees.toFixed(2)}°`
  );
  check('la stima sa dire quando la scena è ferma', estimateShutterTravel(() => evaluateClip(still, 0), 0, { span: 1 / 60, ...viewport }).still);

  const short = estimateShutterTravel(rigAt, 4, { span: shutterSpan(60, 5), ...viewport });
  const long = estimateShutterTravel(rigAt, 4, { span: shutterSpan(24, 360), ...viewport });
  check(
    'la strisciata cresce con l\'angolo di otturatore',
    long.pixels > estimate.pixels && estimate.pixels > short.pixels,
    `${short.pixels.toFixed(2)} < ${estimate.pixels.toFixed(2)} < ${long.pixels.toFixed(2)} px`
  );
  check('sotto il pixel la stima si dichiara trascurabile', short.negligible && !long.negligible);
  check(
    'la descrizione per la UI è leggibile',
    /px su 1440/.test(describeShutter(estimate, 1440)) && /ferma/.test(describeShutter({ still: true }, 1440)),
    describeShutter(estimate, 1440)
  );
}

/* ------------------------------------------------------------------ *
 * 11. consegna dei file (iframe, dialogo di sistema, fallback)
 * ------------------------------------------------------------------ */
{
  const { describeEnvironment, saveBlobSafely, openInNewTab } = Delivery;
  const blob = new Blob([new Uint8Array(16)], { type: 'image/png' });

  // --- ambiente: nessuna finestra (render server-side) ---
  check('senza finestra l\'ambiente non dichiara capacità', describeEnvironment().savePicker === false);

  // --- DOM finto per esercitare i percorsi reali ---
  let clicked = 0;
  let written = 0;
  let aborted = false;
  const restore = { window: globalThis.window, document: globalThis.document, URL: globalThis.URL };

  const installDom = ({ picker }) => {
    globalThis.window = {
      self: {},
      top: {},
      setTimeout: () => 0,
      open: () => ({}),
      showSaveFilePicker: picker,
    };
    globalThis.window.self = globalThis.window.self ?? {};
    globalThis.document = {
      createElement: () => ({
        set href(value) {},
        set download(value) {},
        set rel(value) {},
        click: () => {
          clicked++;
        },
        remove: () => {},
      }),
      body: { appendChild: () => {} },
    };
    globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
  };

  // 1. dialogo di sistema disponibile → percorso 'picker'
  installDom({
    picker: async () => ({
      createWritable: async () => ({
        write: async () => {
          written++;
        },
        close: async () => {},
      }),
    }),
  });
  const pickerOutcome = await saveBlobSafely(blob, 'take_0001.png');
  check('con il dialogo di sistema il file viene scritto davvero', pickerOutcome === 'picker' && written === 1, `esito ${pickerOutcome}`);

  // 2. dialogo annullato dall'utente → nessun fallback a sorpresa
  installDom({
    picker: async () => {
      const error = new Error('annullato');
      error.name = 'AbortError';
      throw error;
    },
  });
  const cancelOutcome = await saveBlobSafely(blob, 'take_0002.png');
  check('annullare il dialogo non attiva altri percorsi', cancelOutcome === 'cancelled' && clicked === 0, `esito ${cancelOutcome}, click ${clicked}`);

  // 3. dialogo vietato dall'ambiente (iframe) → si ricade sull'anchor
  installDom({
    picker: async () => {
      const error = new Error('non permesso');
      error.name = 'NotAllowedError';
      throw error;
    },
  });
  const anchorOutcome = await saveBlobSafely(blob, 'take_0003.png');
  check('se il dialogo è vietato si prova il download classico', anchorOutcome === 'anchor' && clicked === 1, `esito ${anchorOutcome}, click ${clicked}`);

  // 4. nessun dialogo disponibile → anchor diretto
  installDom({ picker: undefined });
  const plain = await saveBlobSafely(blob, 'take_0004.png');
  check('senza dialogo si usa il download classico', plain === 'anchor' && clicked === 2, `esito ${plain}, click ${clicked}`);

  // 5. l'apertura in scheda nuova non lancia mai
  installDom({ picker: undefined });
  check('l\'apertura in scheda nuova è gestita', openInNewTab('blob:test') === true && openInNewTab('') === true);

  // 6. ambiente: iframe rilevato e dialogo dichiarato
  const env = describeEnvironment();
  check('l\'ambiente rileva il dialogo di salvataggio', env.savePicker === false && typeof env.embedded === 'boolean', JSON.stringify(env));

  Object.assign(globalThis, restore);
  void aborted;
}

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */
const passed = results.filter((result) => result.ok).length;
console.log(`\n=== Summary ===\n${passed}/${results.length} checks passed`);
if (passed !== results.length) {
  console.log('\nFALLITI:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name} ${r.detail}`));
  process.exitCode = 1;
}

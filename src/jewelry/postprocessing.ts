import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export interface BokehOptions {
  /** distanza di messa a fuoco in unità di scena */
  focus: number;
  /** apertura: più alto = più sfocato fuori fuoco */
  aperture: number;
  /** raggio massimo di sfocatura */
  maxblur: number;
}

export interface PostprocessingPipeline {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  ssaoPass: SSAOPass;
  bokehPass: BokehPass;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  render: () => void;
  /**
   * Rende un fotogramma campionando `samples` sub-frame lungo l'intervallo
   * `[tStart, tEnd]` e sommandoli nel buffer di accumulo: è il motion blur
   * "vero" (integrazione sull'otturatore), non un blur applicato in post.
   * `setTime` deve riposizionare la scena all'istante richiesto.
   */
  renderMotionBlurred: (
    samples: number,
    tStart: number,
    tEnd: number,
    setTime: (time: number) => void
  ) => void;
  setBloom: (enabled: boolean) => void;
  setBloomStrength: (strength: number) => void;
  setSsao: (enabled: boolean) => void;
  setBokeh: (enabled: boolean) => void;
  setBokehOptions: (options: Partial<BokehOptions>) => void;
  /** ultimo tempo effettivamente usato dal campionamento dell'otturatore */
  lastShutterTime: () => number;
  /** usato dalla cattura trasparente: spegne gli effetti compositi */
  setTransientDisabled: (disabled: boolean) => void;
  dispose: () => void;
}

/**
 * Catena di post-processing.
 *
 * Ordine: [beauty] → SSAO → Bloom → DOF (bokeh) → Output (tone mapping ACES).
 * Il "beauty" può arrivare da due sorgenti: la scena renderizzata (normale) o
 * una texture di accumulo (motion blur). In entrambi i casi gli effetti
 * compositi restano a valle, quindi bloom e DOF si applicano al fotogramma già
 * integrato sull'otturatore, esattamente come in una pipeline di ripresa.
 */
export function setupPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  pixelRatio: number
): PostprocessingPipeline {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // NOTE: the render target is created in CSS pixels on purpose. EffectComposer
  // stores `_width/_height` from this target and multiplies them by the pixel
  // ratio on the next `setSize()`; allocating it in device pixels first would
  // create a transient (width * pixelRatio^2) buffer - 4x the memory.
  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width)),
    Math.max(1, Math.floor(height)),
    {
      // HalfFloat keeps the HDR range that ACES + transmission need, MSAA x4
      // replaces the FXAA the old pipeline applied on linear data.
      type: THREE.HalfFloatType,
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
    }
  );
  renderTarget.texture.name = 'ComposerMSAA';

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  // deterministic clear: the accumulation loop relies on it
  renderPass.clear = true;
  composer.addPass(renderPass);

  // Accumulation targets (motion blur) --------------------------------
  const targetOptions: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  };
  const beautyTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width * pixelRatio)),
    Math.max(1, Math.floor(height * pixelRatio)),
    targetOptions
  );
  beautyTarget.texture.name = 'SubFrameBeauty';

  const accumTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width * pixelRatio)),
    Math.max(1, Math.floor(height * pixelRatio)),
    { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
  );
  accumTarget.texture.name = 'ShutterAccumulation';

  const blendMaterial = new THREE.ShaderMaterial({
    name: 'ShutterBlend',
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      opacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        // premultiplied additive accumulation: keeps alpha meaningful when the
        // capture is exported with a transparent background
        gl_FragColor = texel * opacity;
      }
    `,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const blendQuad = new FullScreenQuad(blendMaterial);

  // the accumulated image is injected into the composer where the render pass sits
  const beautyPass = new TexturePass(accumTarget.texture);
  beautyPass.enabled = false;
  composer.addPass(beautyPass);

  // SSAO: opt-in only. `kernelRadius` is in world units, tuned for a ~9 unit
  // wide pendant so contact shadows stay subtle instead of drowning the
  // micro-facets in black.
  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 0.18;
  ssaoPass.minDistance = 0.002;
  ssaoPass.maxDistance = 0.12;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.22, // strength
    0.35, // radius
    1.1 // threshold (linear HDR, above diffuse white)
  );
  composer.addPass(bloomPass);

  // Depth of field: opt-in, off by default (it costs an extra depth pass)
  const bokehPass = new BokehPass(scene, camera, {
    focus: 12.5,
    aperture: 0.00035,
    maxblur: 0.008,
  });
  bokehPass.enabled = false;
  composer.addPass(bokehPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let accumulated = false;
  let lastShutter = 0;

  return {
    composer,
    bloomPass,
    ssaoPass,
    bokehPass,

    setSize: (nextWidth, nextHeight, nextPixelRatio) => {
      composer.setPixelRatio(nextPixelRatio);
      composer.setSize(nextWidth, nextHeight);
      const deviceWidth = Math.max(1, Math.floor(nextWidth * nextPixelRatio));
      const deviceHeight = Math.max(1, Math.floor(nextHeight * nextPixelRatio));
      beautyTarget.setSize(deviceWidth, deviceHeight);
      accumTarget.setSize(deviceWidth, deviceHeight);
      ssaoPass.setSize(deviceWidth, deviceHeight);
      bokehPass.setSize(deviceWidth, deviceHeight);
      // UnrealBloomPass.setSize already updates `resolution` internally
      bloomPass.setSize(deviceWidth, deviceHeight);
    },

    render: () => {
      // normal path: the scene is the beauty source
      renderPass.enabled = true;
      beautyPass.enabled = false;
      accumulated = false;
      composer.render();
    },

    renderMotionBlurred: (samples, tStart, tEnd, setTime) => {
      const count = Math.max(1, Math.round(samples));
      const span = tEnd - tStart;
      lastShutter = span;

      const clearColor = renderer.getClearColor(new THREE.Color());
      const clearAlpha = renderer.getClearAlpha();
      // FullScreenQuad.render() goes through renderer.render(), which would
      // auto-clear the accumulation target on every sample: it must stay off or
      // the additive integration is wiped frame after frame.
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      // stack of effects that must run *after* the shutter integration
      const post = [ssaoPass, bloomPass, bokehPass].map((pass) => pass.enabled);
      ssaoPass.enabled = false;
      bloomPass.enabled = false;
      bokehPass.enabled = false;

      // 1. integrate the sub-frames additively
      renderer.setRenderTarget(accumTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);

      for (let i = 0; i < count; i++) {
        const time = count === 1 ? tStart : tStart + (span * i) / (count - 1);
        setTime(time);

        renderer.setRenderTarget(beautyTarget);
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.clear(true, true, false);
        renderer.render(scene, camera);

        blendMaterial.uniforms.tDiffuse.value = beautyTarget.texture;
        blendMaterial.uniforms.opacity.value = 1 / count;
        renderer.setRenderTarget(accumTarget);
        blendQuad.render(renderer);
      }

      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.autoClear = previousAutoClear;

      // 2. composite (SSAO / bloom / DOF / tone mapping) over the integrated frame
      post.forEach((enabled, index) => {
        const pass = [ssaoPass, bloomPass, bokehPass][index];
        pass.enabled = enabled;
      });
      renderPass.enabled = false;
      beautyPass.map = accumTarget.texture;
      beautyPass.enabled = true;
      accumulated = true;
      composer.render();
    },

    lastShutterTime: () => lastShutter,

    setBloom: (enabled) => {
      bloomPass.enabled = enabled;
    },
    setBloomStrength: (strength) => {
      bloomPass.strength = THREE.MathUtils.clamp(strength, 0, 0.8);
    },
    setSsao: (enabled) => {
      ssaoPass.enabled = enabled;
    },
    setBokeh: (enabled) => {
      bokehPass.enabled = enabled;
    },
    setBokehOptions: ({ focus, aperture, maxblur }) => {
      const uniforms = bokehPass.uniforms as Record<string, { value: number }>;
      if (focus !== undefined) uniforms.focus.value = Math.max(0.5, focus);
      if (aperture !== undefined) uniforms.aperture.value = Math.max(0, aperture);
      if (maxblur !== undefined) uniforms.maxblur.value = Math.max(0, maxblur);
    },
    setTransientDisabled: (disabled) => {
      // used while capturing a transparent PNG: bloom/SSAO/DOF composite with
      // additive blending and would leave a halo on the alpha channel
      if (disabled) {
        ssaoPass.enabled = false;
        bloomPass.enabled = false;
        bokehPass.enabled = false;
      }
    },
    dispose: () => {
      renderPass.dispose?.();
      ssaoPass.dispose?.();
      bokehPass.dispose?.();
      bloomPass.dispose();
      outputPass.dispose();
      beautyPass.dispose?.();
      blendQuad.dispose();
      blendMaterial.dispose();
      beautyTarget.dispose();
      accumTarget.dispose();
      composer.dispose();
      renderTarget.dispose();
      void accumulated;
    },
  };
}

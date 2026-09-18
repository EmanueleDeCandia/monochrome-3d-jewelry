import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

export interface PostprocessingPipeline {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  ssaoPass: SSAOPass;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  render: () => void;
  setBloom: (enabled: boolean) => void;
  setBloomStrength: (strength: number) => void;
  setSsao: (enabled: boolean) => void;
  /** used by the high resolution capture */
  setTransientDisabled: (disabled: boolean) => void;
  dispose: () => void;
}

/**
 * Post-processing chain.
 *
 * Fixed compared to the original pipeline:
 * - The composer now renders into a multisampled (MSAA) half-float buffer.
 *   `EffectComposer` creates its own render target, so `antialias: true` on the
 *   WebGLRenderer had no effect at all and the old code patched the missing
 *   anti-aliasing with FXAA *before* the OutputPass (i.e. on linear HDR data,
 *   which is not what FXAA expects and washed out the edges).
 * - Bloom is intentional: the previous settings (strength 0.75, threshold 0.95
 *   on a linear HDR buffer lit by a 2.2x environment) made every highlight bleed,
 *   which is exactly the "the light hides the object" complaint. The threshold
 *   now sits above diffuse white so only genuine specular sparkle blooms.
 * - SSAO is opt-in and its parameters are expressed in world units that make
 *   sense for a piece that is ~9 units wide.
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

  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width * pixelRatio)),
    Math.max(1, Math.floor(height * pixelRatio)),
    {
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
  composer.addPass(renderPass);

  // SSAO: opt-in only. `kernelRadius` is in world units, the defaults are tuned
  // for a ~9 unit wide pendant so contact shadows stay subtle instead of
  // drowning the micro-facets in black.
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

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    bloomPass,
    ssaoPass,
    setSize: (nextWidth, nextHeight, nextPixelRatio) => {
      composer.setPixelRatio(nextPixelRatio);
      composer.setSize(nextWidth, nextHeight);
      ssaoPass.setSize(nextWidth * nextPixelRatio, nextHeight * nextPixelRatio);
      // UnrealBloomPass.setSize already updates `resolution` internally
      bloomPass.setSize(nextWidth * nextPixelRatio, nextHeight * nextPixelRatio);
    },
    render: () => composer.render(),
    setBloom: (enabled) => {
      bloomPass.enabled = enabled;
    },
    setBloomStrength: (strength) => {
      bloomPass.strength = THREE.MathUtils.clamp(strength, 0, 0.8);
    },
    setSsao: (enabled) => {
      ssaoPass.enabled = enabled;
    },
    setTransientDisabled: (disabled) => {
      // used while capturing a transparent PNG: bloom/SSAO composite with
      // additive blending and would leave a halo on the alpha channel
      if (disabled) {
        ssaoPass.enabled = false;
        bloomPass.enabled = false;
      }
    },
    dispose: () => {
      renderPass.dispose?.();
      ssaoPass.dispose?.();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderTarget.dispose();
    },
  };
}

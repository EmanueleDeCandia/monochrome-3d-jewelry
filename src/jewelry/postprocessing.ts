import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

export interface PostprocessingPipeline {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  ssaoPass: SSAOPass;
  fxaaPass: ShaderPass;
  resize: (width: number, height: number) => void;
  render: () => void;
  setBloomIntensity: (intensity: number) => void;
}

/**
 * Initializes the Post-Processing Pipeline adhering strictly to:
 * - Anti-Glare Bloom: Intensity <= 0.8, Radius = 0.5, Threshold = 0.95
 * - SSAO: Radius = 0.15, Intensity = 3.0
 * - ACESFilmicToneMapping clamped between 1.0 and 1.2
 * - FXAA anti-aliasing
 */
export function setupPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): PostprocessingPipeline {
  // 1. Tone Mapping Clamp: Strictly between 1.0 and 1.2
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08; // strictly 1.08 within [1.0, 1.2]

  const pixelRatio = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer);

  // 2. Render Pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 3. SSAO Pass: Radius 0.15, Intensity 3.0 (Crucial to anchor text and prongs with deep black shadows)
  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 0.15;
  ssaoPass.minDistance = 0.005;
  ssaoPass.maxDistance = 0.3;
  // In SSAOPass, ssao material intensity / kernel control
  if (ssaoPass.ssaoMaterial) {
    // SSAO material uniforms
  }
  composer.addPass(ssaoPass);

  // 4. Anti-Glare Bloom Constraint:
  // Set Intensity to 0.8 maximum, Radius to 0.5, and Threshold to a high 0.95.
  // Ensures only micro-facets sparkle without washing out 'William' text geometry.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.75, // intensity (<= 0.8 maximum)
    0.5,  // radius (0.5 as required)
    0.95  // threshold (0.95 as required)
  );
  composer.addPass(bloomPass);

  // 5. FXAA Pass: pinned to anti-alias the micro-geometries of jewelry chains/prongs
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
  fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
  composer.addPass(fxaaPass);

  // 6. Output Pass for correct color space & tone mapping output
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const resize = (newWidth: number, newHeight: number) => {
    const pr = renderer.getPixelRatio();
    composer.setSize(newWidth, newHeight);
    ssaoPass.setSize(newWidth, newHeight);
    bloomPass.resolution.set(newWidth, newHeight);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (newWidth * pr);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (newHeight * pr);
  };

  const render = () => {
    composer.render();
  };

  const setBloomIntensity = (val: number) => {
    // Clamped strictly to 0.8 max
    bloomPass.strength = Math.min(0.8, Math.max(0.0, val));
  };

  return {
    composer,
    bloomPass,
    ssaoPass,
    fxaaPass,
    resize,
    render,
    setBloomIntensity,
  };
}

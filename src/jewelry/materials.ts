import * as THREE from 'three';
import {
  findFinish,
  findGem,
  findMetal,
  type FinishId,
  type GemId,
  type MetalId,
} from './types';

/**
 * Monochrome PBR material library.
 *
 * Design notes
 * ------------
 * - One shared instance per "slot" (metal / dark metal / gem / accent gem).
 *   Materials are mutated in place, so a slider instantly updates every mesh
 *   using them. The previous implementation only swapped the material of the
 *   text mesh, which is why most of the UI produced no visible change.
 * - Everything stays strictly neutral: grey tones only, `dispersion` = 0.
 * - `transparent` is intentionally NOT enabled on gems: three.js renders
 *   transmission in a dedicated pass and alpha blending on top of it produces
 *   sorting artefacts (the old code enabled it).
 */
export interface MaterialLibrary {
  metal: THREE.MeshPhysicalMaterial;
  darkMetal: THREE.MeshPhysicalMaterial;
  gem: THREE.MeshPhysicalMaterial;
  accentGem: THREE.MeshPhysicalMaterial;
  /** clones used by the nameplate so it can be styled independently */
  textMetal: THREE.MeshPhysicalMaterial;
  textGem: THREE.MeshPhysicalMaterial;
  setMetal: (id: MetalId) => void;
  setFinish: (id: FinishId) => void;
  setGem: (id: GemId) => void;
  setWireframe: (enabled: boolean) => void;
  all: () => THREE.Material[];
  dispose: () => void;
}

const grey = (hex: string) => new THREE.Color(hex);

export function createMaterialLibrary(): MaterialLibrary {
  let metalId: MetalId = 'platinum';
  let finishId: FinishId = 'polished';
  let gemId: GemId = 'diamond';

  const metal = new THREE.MeshPhysicalMaterial({
    name: 'metal',
    color: grey('#f2f2f2'),
    metalness: 1,
    roughness: 0.06,
    clearcoat: 0.15,
    clearcoatRoughness: 0.08,
    // NOTE: three.js overrides envMapIntensity with scene.environmentIntensity
    // whenever `material.envMap === null`, so the global IBL control lives on
    // the Scene (see studioEnvironment.ts).
    envMapIntensity: 1,
  });

  const darkMetal = new THREE.MeshPhysicalMaterial({
    name: 'darkMetal',
    color: grey('#3a3a3a'),
    metalness: 0.9,
    roughness: 0.42,
    envMapIntensity: 1,
  });

  const gem = new THREE.MeshPhysicalMaterial({
    name: 'gem',
    color: grey('#ffffff'),
    metalness: 0,
    roughness: 0.005,
    transmission: 1,
    ior: 2.417,
    thickness: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationColor: grey('#ffffff'),
    attenuationDistance: 4,
    envMapIntensity: 1,
    // guarantees crisp micro-facets no matter how the geometry was cut
    flatShading: true,
  });

  const accentGem = new THREE.MeshPhysicalMaterial({
    name: 'accentGem',
    color: grey('#8a8a8a'),
    metalness: 0,
    roughness: 0.035,
    transmission: 0.7,
    ior: 2.417,
    thickness: 0.28,
    clearcoat: 1,
    attenuationColor: grey('#2a2a2a'),
    attenuationDistance: 0.6,
    envMapIntensity: 1,
    flatShading: true,
  });

  const textMetal = new THREE.MeshPhysicalMaterial({
    name: 'textMetal',
    color: grey('#f2f2f2'),
    metalness: 1,
    roughness: 0.06,
    clearcoat: 0.15,
    clearcoatRoughness: 0.08,
  });

  const textGem = new THREE.MeshPhysicalMaterial({
    name: 'textGem',
    color: grey('#ffffff'),
    metalness: 0,
    roughness: 0.005,
    transmission: 1,
    ior: 2.417,
    thickness: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationColor: grey('#ffffff'),
    attenuationDistance: 4,
    flatShading: true,
  });

  const applyMetal = () => {
    const preset = findMetal(metalId);
    metal.color.set(preset.color);
    metal.metalness = preset.metalness;
    metal.roughness = preset.roughness;
    textMetal.color.set(preset.color);
    textMetal.metalness = preset.metalness;
    textMetal.roughness = preset.roughness;

    // the under-gallery / azurage follows the chosen metal, darker and rougher
    darkMetal.color.copy(new THREE.Color(preset.color).multiplyScalar(0.32));
    darkMetal.metalness = Math.max(0.25, preset.metalness * 0.85);
    darkMetal.roughness = THREE.MathUtils.clamp(preset.roughness + 0.35, 0.3, 0.78);
  };

  const applyFinish = () => {
    const finish = findFinish(finishId);
    metal.roughness = finish.roughness;
    metal.clearcoat = finish.clearcoat;
    metal.clearcoatRoughness = Math.min(0.5, finish.roughness * 1.5);
    textMetal.roughness = finish.roughness;
    textMetal.clearcoat = finish.clearcoat;
    textMetal.clearcoatRoughness = metal.clearcoatRoughness;
    // a matte finish keeps the dark parts coherently matte
    darkMetal.roughness = THREE.MathUtils.clamp(finish.roughness + 0.3, 0.3, 0.82);
  };

  const applyGem = () => {
    const preset = findGem(gemId);
    gem.color.set(preset.color);
    gem.roughness = preset.roughness;
    gem.metalness = preset.metalness;
    gem.transmission = preset.transmission;
    gem.ior = preset.ior;
    gem.thickness = preset.thickness;
    gem.attenuationColor.set(preset.attenuationColor);
    gem.attenuationDistance = preset.attenuationDistance || 1;
    gem.clearcoat = preset.clearcoat;

    Object.assign(textGem, {
      roughness: preset.roughness,
      metalness: preset.metalness,
      transmission: preset.transmission,
      ior: preset.ior,
      thickness: preset.thickness,
      clearcoat: preset.clearcoat,
      attenuationDistance: preset.attenuationDistance || 1,
    });
    textGem.color.set(preset.color);
    textGem.attenuationColor.set(preset.attenuationColor);

    // accent baguettes: a darker, smokier companion stone
    accentGem.color.copy(new THREE.Color(preset.color).multiplyScalar(0.6));
    accentGem.roughness = Math.min(0.5, preset.roughness + 0.02);
    accentGem.metalness = preset.metalness;
    accentGem.transmission = Math.max(0, preset.transmission * 0.65);
    accentGem.ior = preset.ior;
    accentGem.thickness = Math.max(0.05, preset.thickness * 0.7);
    accentGem.attenuationColor.copy(
      new THREE.Color(preset.attenuationColor).lerp(new THREE.Color('#000000'), 0.55)
    );
    accentGem.attenuationDistance = Math.max(0.25, preset.attenuationDistance * 0.5);
    accentGem.clearcoat = preset.clearcoat;
  };

  const refresh = () => {
    applyMetal();
    applyFinish();
    applyGem();
    all().forEach((m) => (m.needsUpdate = true));
  };

  const all = () => [metal, darkMetal, gem, accentGem, textMetal, textGem];

  refresh();

  return {
    metal,
    darkMetal,
    gem,
    accentGem,
    textMetal,
    textGem,
    setMetal: (id) => {
      metalId = id;
      refresh();
    },
    setFinish: (id) => {
      finishId = id;
      refresh();
    },
    setGem: (id) => {
      gemId = id;
      refresh();
    },
    setWireframe: (enabled) => {
      all().forEach((material) => {
        material.wireframe = enabled;
      });
    },
    all,
    dispose: () => all().forEach((m) => m.dispose()),
  };
}

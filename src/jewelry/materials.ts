import * as THREE from 'three';

export interface JewelryMaterials {
  platinum: THREE.MeshStandardMaterial;
  matteDarkMetal: THREE.MeshStandardMaterial;
  pureDiamond: THREE.MeshPhysicalMaterial;
  obsidian: THREE.MeshPhysicalMaterial;
  rhodiumSilver: THREE.MeshStandardMaterial;
  goldWhite18k: THREE.MeshStandardMaterial;
}

/**
 * STRICT MONOCHROME PBR MATRIX
 * Guaranteed pure shades of gray / white / black. No color hues allowed.
 */
export function createMonochromeJewelryMaterials(): JewelryMaterials {
  // 1. Platinum / Polished Silver: #FFFFFF, Roughness: 0.02, Metalness: 1.0, Transmission: 0.0
  const platinum = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#FFFFFF'),
    roughness: 0.02,
    metalness: 1.0,
    envMapIntensity: 2.2,
  });

  // 2. Matte Dark Metal: #1A1A1A, Roughness: 0.40, Metalness: 1.0, Transmission: 0.0
  const matteDarkMetal = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1A1A1A'),
    roughness: 0.40,
    metalness: 1.0,
    envMapIntensity: 1.1,
  });

  // 3. Pure Diamond (Gemstone): #FFFFFF, Roughness: 0.00, Metalness: 0.0, Transmission: 1.0, IOR: 2.417, Clearcoat: 1.0, thickness: 0.8
  const pureDiamond = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#FFFFFF'),
    roughness: 0.0,
    metalness: 0.0,
    transmission: 1.0,
    ior: 2.417, // Crucial diamond refraction index
    thickness: 0.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    transparent: true,
    opacity: 1.0,
    reflectivity: 1.0,
    attenuationColor: new THREE.Color('#FFFFFF'),
    attenuationDistance: 2.0,
    envMapIntensity: 2.4,
  });

  // 4. Obsidian / Black Gem: #050505, Roughness: 0.05, Metalness: 0.0, Transmission: 0.0, IOR: 1.450, Clearcoat: 1.0
  const obsidian = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#050505'),
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.450,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 0.9,
    envMapIntensity: 1.8,
  });

  // Polished Rhodium White Silver (extra bright specular highlights)
  const rhodiumSilver = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#F0F0F0'),
    roughness: 0.04,
    metalness: 0.98,
    envMapIntensity: 2.0,
  });

  // High Polish Titanium (slightly deeper gunmetal monochrome)
  const goldWhite18k = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D8D8D8'),
    roughness: 0.06,
    metalness: 0.95,
    envMapIntensity: 1.9,
  });

  return {
    platinum,
    matteDarkMetal,
    pureDiamond,
    obsidian,
    rhodiumSilver,
    goldWhite18k,
  };
}

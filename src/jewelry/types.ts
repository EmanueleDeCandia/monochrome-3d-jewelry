import type { FontId } from './fonts';

/* ------------------------------------------------------------------ *
 * Material presets (strictly monochrome: every tone is a neutral grey)
 * ------------------------------------------------------------------ */

export type MetalId = 'platinum' | 'rhodium' | 'titanium' | 'gunmetal' | 'ceramic';

export interface MetalPreset {
  id: MetalId;
  label: string;
  /** base colour of the material (linear #rrggbb, neutral by design) */
  color: string;
  metalness: number;
  /** roughness used when the finish preset does not override it */
  roughness: number;
  envMapIntensity: number;
  hint: string;
}

export const METALS: MetalPreset[] = [
  {
    id: 'platinum',
    label: 'Platino 950',
    color: '#f2f2f2',
    metalness: 1,
    roughness: 0.05,
    envMapIntensity: 1.15,
    hint: 'Metallo nobile freddo, riflessi netti',
  },
  {
    id: 'rhodium',
    label: 'Rodio',
    color: '#ffffff',
    metalness: 1,
    roughness: 0.02,
    envMapIntensity: 1.3,
    hint: 'Brillantezza speculare, massima lucentezza',
  },
  {
    id: 'titanium',
    label: 'Titanio',
    color: '#cfcfcf',
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 1.0,
    hint: 'Grigio tecnico con riflessi morbidi',
  },
  {
    id: 'gunmetal',
    label: 'Gunmetal',
    color: '#6e6e6e',
    metalness: 0.95,
    roughness: 0.3,
    envMapIntensity: 0.9,
    hint: 'Metallo scuro satinato, look industriale',
  },
  {
    id: 'ceramic',
    label: 'Ceramica nera',
    color: '#0d0d0d',
    metalness: 0.1,
    roughness: 0.35,
    envMapIntensity: 1.4,
    hint: 'Nero profondo non metallico',
  },
];

export type FinishId = 'mirror' | 'polished' | 'satin' | 'matte';

export interface FinishPreset {
  id: FinishId;
  label: string;
  roughness: number;
  /** extra clearcoat for the mirror/polished finishes */
  clearcoat: number;
}

export const FINISHES: FinishPreset[] = [
  { id: 'mirror', label: 'Specchio', roughness: 0.015, clearcoat: 0.35 },
  { id: 'polished', label: 'Lucido', roughness: 0.06, clearcoat: 0.15 },
  { id: 'satin', label: 'Satinato', roughness: 0.24, clearcoat: 0 },
  { id: 'matte', label: 'Opaco', roughness: 0.55, clearcoat: 0 },
];

export type GemId = 'diamond' | 'blackDiamond' | 'obsidian' | 'smokyQuartz';

export interface GemPreset {
  id: GemId;
  label: string;
  color: string;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  thickness: number;
  attenuationColor: string;
  attenuationDistance: number;
  clearcoat: number;
  envMapIntensity: number;
  hint: string;
}

export const GEMS: GemPreset[] = [
  {
    id: 'diamond',
    label: 'Diamante',
    color: '#ffffff',
    roughness: 0.005,
    metalness: 0,
    transmission: 1,
    ior: 2.417,
    thickness: 0.6,
    attenuationColor: '#ffffff',
    attenuationDistance: 4,
    clearcoat: 1,
    envMapIntensity: 1.6,
    hint: 'IOR 2.417 • taglio brillante 57 facce',
  },
  {
    id: 'blackDiamond',
    label: 'Diamante nero',
    color: '#0b0b0b',
    roughness: 0.03,
    metalness: 0,
    transmission: 0.75,
    ior: 2.417,
    thickness: 0.4,
    attenuationColor: '#1c1c1c',
    attenuationDistance: 0.4,
    clearcoat: 1,
    envMapIntensity: 1.4,
    hint: 'Trasmissione 0.75 • assorbimento profondo',
  },
  {
    id: 'obsidian',
    label: 'Ossidiana',
    color: '#050505',
    roughness: 0.06,
    metalness: 0.15,
    transmission: 0,
    ior: 1.45,
    thickness: 0,
    attenuationColor: '#000000',
    attenuationDistance: 1,
    clearcoat: 1,
    envMapIntensity: 1.2,
    hint: 'Vetro vulcanico, IOR 1.450, clearcoat pieno',
  },
  {
    id: 'smokyQuartz',
    label: 'Quarzo fumé',
    color: '#8d8d8d',
    roughness: 0.02,
    metalness: 0,
    transmission: 0.95,
    ior: 1.54,
    thickness: 0.5,
    attenuationColor: '#6f6f6f',
    attenuationDistance: 0.8,
    clearcoat: 1,
    envMapIntensity: 1.35,
    hint: 'Trasmissione 0.95 • fumo grigio neutro',
  },
];

export type LightingPresetId = 'noir' | 'editorial' | 'jewelry' | 'flat';

export interface LightingPreset {
  id: LightingPresetId;
  label: string;
  hint: string;
  key: number;
  rim: number;
  top: number;
  envIntensity: number;
  /** environment softbox layout */
  envPreset: EnvPresetId;
  bloom: number;
}

export type EnvPresetId = 'studio' | 'softbox' | 'dome' | 'noir';

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'noir',
    label: 'Noir Contrast',
    hint: 'Chiaroscuro estremo, fondale nero, lens flare assente',
    key: 1.0,
    rim: 0.7,
    top: 0.35,
    envIntensity: 0.85,
    envPreset: 'noir',
    bloom: 0.25,
  },
  {
    id: 'editorial',
    label: 'Editorial Soft',
    hint: 'Luce morbida da still-life, ombre aperte',
    key: 0.75,
    rim: 0.45,
    top: 0.8,
    envIntensity: 1.15,
    envPreset: 'dome',
    bloom: 0.18,
  },
  {
    id: 'jewelry',
    label: 'Jewelry Box',
    hint: 'Due strip box laterali: scintillio sui tagli a brillante',
    key: 0.9,
    rim: 0.55,
    top: 0.5,
    envIntensity: 1.0,
    envPreset: 'softbox',
    bloom: 0.22,
  },
  {
    id: 'flat',
    label: 'Flat Catalog',
    hint: 'Illuminazione piatta e leggibile, ideale per il CAD',
    key: 0.6,
    rim: 0.3,
    top: 0.6,
    envIntensity: 1.35,
    envPreset: 'studio',
    bloom: 0.1,
  },
];

export type BackdropId = 'black' | 'charcoal' | 'cove' | 'halo';

export interface BackdropPreset {
  id: BackdropId;
  label: string;
  /** CSS colour used for the page background too */
  css: string;
  /** radial gradient stops drawn inside the 3D backdrop sphere */
  stops: [string, string, string];
}

export const BACKDROPS: BackdropPreset[] = [
  { id: 'black', label: 'Nero', css: '#000000', stops: ['#050505', '#000000', '#000000'] },
  { id: 'charcoal', label: 'Grigio', css: '#101010', stops: ['#2a2a2a', '#141414', '#070707'] },
  { id: 'cove', label: 'Cove', css: '#050505', stops: ['#4a4a4a', '#161616', '#020202'] },
  { id: 'halo', label: 'Halo', css: '#000000', stops: ['#6a6a6a', '#101010', '#000000'] },
];

export type CameraViewId = 'hero' | 'front' | 'macro' | 'back' | 'top' | 'profile';

export interface CameraViewPreset {
  id: CameraViewId;
  label: string;
  hint: string;
  /** unit vector from the target towards the camera */
  direction: [number, number, number];
  target: [number, number, number];
  /** portion of the scene that must stay visible on screen */
  fit: { width: number; height: number };
}

/**
 * Camera presets describe a *direction* and the region of interest; the actual
 * distance is derived from the viewport aspect ratio (see cameraFraming.ts) so
 * the piece is always fully framed, on desktop and on phones alike.
 */
export const CAMERA_VIEWS: CameraViewPreset[] = [
  {
    id: 'hero',
    label: '3/4 Hero',
    hint: 'Angolo commerciale da catalogo',
    direction: [0.3, 0.2, 0.93],
    target: [0, 0.35, 0],
    fit: { width: 9.8, height: 6.8 },
  },
  {
    id: 'front',
    label: 'Frontale',
    hint: 'Vista frontale sul nome inciso',
    direction: [0, 0.03, 1],
    target: [0, 0.35, 0],
    fit: { width: 9.8, height: 5.2 },
  },
  {
    id: 'macro',
    label: 'Macro nome',
    hint: 'Dettaglio ravvicinato dell\'incisione',
    direction: [0.08, 0.06, 1],
    target: [0, 0.15, 0],
    fit: { width: 7.6, height: 3.0 },
  },
  {
    id: 'back',
    label: 'Retro azurage',
    hint: 'Il retro traforato a nido d\'ape',
    direction: [0.06, 0.08, -1],
    target: [0, 0.2, 0],
    fit: { width: 9.8, height: 5.4 },
  },
  {
    id: 'top',
    label: 'Dall\'alto',
    hint: 'Flat-lay zenitale',
    direction: [0, 1, 0.42],
    target: [0, 0, -0.4],
    fit: { width: 9.8, height: 6.4 },
  },
  {
    id: 'profile',
    label: 'Profilo',
    hint: 'Spessore del castone e della maglia',
    direction: [1, 0.08, 0.12],
    target: [0, 0.35, 0],
    fit: { width: 3.4, height: 5.6 },
  },
];

export type QualityId = 'draft' | 'standard' | 'high';

export interface QualityPreset {
  id: QualityId;
  label: string;
  curveSegments: number;
  bevelSegments: number;
  maxPixelRatio: number;
  hint: string;
}

export const QUALITIES: QualityPreset[] = [
  { id: 'draft', label: 'Bozza', curveSegments: 4, bevelSegments: 1, maxPixelRatio: 1, hint: 'Massime prestazioni, bordi approssimati' },
  { id: 'standard', label: 'Standard', curveSegments: 8, bevelSegments: 3, maxPixelRatio: 1.75, hint: 'Equilibrio qualità/prestazioni' },
  { id: 'high', label: 'Alta', curveSegments: 14, bevelSegments: 5, maxPixelRatio: 2, hint: 'Massima definizione, più pesante' },
];

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export interface JewelrySettings {
  /** engraved name */
  text: string;
  font: FontId;
  /** multiplier on the auto-fitted size (1 = perfect fit) */
  textScale: number;
  /** plate thickness of the engraved letters (plate depth) */
  textDepth: number;
  /** letter spacing, in em */
  tracking: number;
  /** uppercase transformation */
  uppercase: boolean;
  /** nameplate material source */
  nameplateMaterial: 'metal' | 'gem';

  metal: MetalId;
  finish: FinishId;
  gem: GemId;

  lighting: LightingPresetId;
  envPreset: EnvPresetId;
  envIntensity: number;
  /** degrees */
  envRotation: number;
  lightIntensity: number;
  exposure: number;
  backdrop: BackdropId;

  bloom: boolean;
  bloomStrength: number;
  ssao: boolean;
  wireframe: boolean;
  quality: QualityId;

  autoRotate: boolean;
  autoRotateSpeed: number;
  pointerLight: boolean;
  cameraView: CameraViewId;

  /* --- regia: timeline, otturatore, ripresa --- */
  /** clip selezionato per la ripresa */
  clip: string;
  /** fotogrammi al secondo del take */
  takeFps: number;
  /** risoluzione della sequenza PNG */
  takeScale: number;
  /** integrazione sull'otturatore attiva (motion blur reale) */
  motionBlur: boolean;
  /** angolo di otturatore in gradi: 180 = mezzo fotogramma, come al cinema */
  shutterAngle: number;
  /** sub-frame campionati per fotogramma */
  shutterSamples: number;
  /** profondità di campo */
  dof: boolean;
  /** distanza di fuoco in unità di scena */
  focusDistance: number;
  dofAperture: number;
  dofMaxBlur: number;
  /** formato del take */
  takeFormat: 'webm' | 'png';
  /** sequenza PNG con canale alpha */
  takeTransparent: boolean;
  /** sequenza PNG con pass di profondità */
  takeDepth: boolean;
  /** riproduci il clip in loop */
  loopTake: boolean;
}

export const DEFAULT_SETTINGS: JewelrySettings = {
  text: 'William',
  font: 'bodoni',
  textScale: 1,
  textDepth: 0.34,
  tracking: 0.02,
  uppercase: false,
  nameplateMaterial: 'metal',

  metal: 'platinum',
  finish: 'polished',
  gem: 'diamond',

  lighting: 'jewelry',
  envPreset: 'softbox',
  envIntensity: 1.0,
  envRotation: 0,
  // deliberately conservative: the previous build used a 85 cd spotlight with
  // decay 2 and an exposure floor of 1.0, which blew out the whole piece
  lightIntensity: 0.8,
  exposure: 0.95,
  backdrop: 'black',

  bloom: true,
  bloomStrength: 0.22,
  ssao: false,
  wireframe: false,
  quality: 'standard',

  autoRotate: true,
  autoRotateSpeed: 0.6,
  pointerLight: false,
  cameraView: 'hero',

  clip: 'orbit',
  takeFps: 30,
  takeScale: 2,
  motionBlur: false,
  shutterAngle: 180,
  shutterSamples: 4,
  dof: false,
  focusDistance: 12.5,
  dofAperture: 0.00035,
  dofMaxBlur: 0.008,
  takeFormat: 'png',
  takeTransparent: false,
  takeDepth: false,
  loopTake: true,
};

export const SETTINGS_LIMITS = {
  textScale: { min: 0.4, max: 1.6, step: 0.01 },
  textDepth: { min: 0.08, max: 0.9, step: 0.01 },
  tracking: { min: -0.05, max: 0.25, step: 0.005 },
  envIntensity: { min: 0, max: 2.5, step: 0.01 },
  envRotation: { min: -180, max: 180, step: 1 },
  lightIntensity: { min: 0.2, max: 2.2, step: 0.01 },
  exposure: { min: 0.25, max: 2.2, step: 0.01 },
  bloomStrength: { min: 0, max: 0.8, step: 0.01 },
  autoRotateSpeed: { min: 0, max: 2, step: 0.01 },
  takeFps: { min: 12, max: 60, step: 1 },
  takeScale: { min: 1, max: 3, step: 1 },
  shutterAngle: { min: 0, max: 360, step: 5 },
  shutterSamples: { min: 1, max: 8, step: 1 },
  focusDistance: { min: 2, max: 30, step: 0.1 },
  dofAperture: { min: 0, max: 0.004, step: 0.00005 },
  dofMaxBlur: { min: 0, max: 0.05, step: 0.001 },
  text: { maxLength: 22 },
} as const;

export interface SceneStats {
  fps: number;
  triangles: number;
  stones: number;
  pieces: number;
  drawCalls: number;
  textWidth: number;
  textHeight: number;
  fittedSize: number;
  droppedChars: string[];
  renderScale: number;
}

export function findMetal(id: MetalId): MetalPreset {
  return METALS.find((m) => m.id === id) ?? METALS[0];
}
export function findFinish(id: FinishId): FinishPreset {
  return FINISHES.find((f) => f.id === id) ?? FINISHES[1];
}
export function findGem(id: GemId): GemPreset {
  return GEMS.find((g) => g.id === id) ?? GEMS[0];
}
export function findLighting(id: LightingPresetId): LightingPreset {
  return LIGHTING_PRESETS.find((l) => l.id === id) ?? LIGHTING_PRESETS[2];
}
export function findBackdrop(id: BackdropId): BackdropPreset {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}
export function findQuality(id: QualityId): QualityPreset {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES[1];
}
export function findCameraView(id: CameraViewId): CameraViewPreset {
  return CAMERA_VIEWS.find((c) => c.id === id) ?? CAMERA_VIEWS[0];
}

import * as THREE from 'three';
import { CAMERA_VIEWS, type CameraViewPreset } from './types';

/**
 * Motore della timeline ("motion control").
 *
 * Tutto ciò che riguarda la ripresa è una **funzione pura del tempo**: camera,
 * piatto girevole e rig luci sono tracce di keyframe valutate a un istante `t`.
 * Questo è il requisito che rende possibile la ripresa ripetibile: lo stesso
 * `t` produce sempre lo stesso fotogramma, quindi si possono accumulare più
 * sub-frame per il motion blur ed esportare una sequenza numerata montabile.
 *
 * Il modulo non tocca né il renderer né il DOM: è verificabile in Node
 * (vedi `tools/verify-motion.mjs`).
 */

/* ------------------------------------------------------------------ *
 * Easing
 * ------------------------------------------------------------------ */

export type EasingId = 'linear' | 'smooth' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

export const EASINGS: { id: EasingId; label: string }[] = [
  { id: 'linear', label: 'Lineare' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'easeIn', label: 'In' },
  { id: 'easeOut', label: 'Out' },
  { id: 'easeInOut', label: 'In-Out' },
  { id: 'hold', label: 'Stop' },
];

export function ease(id: EasingId, t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  switch (id) {
    case 'smooth':
      return x * x * (3 - 2 * x);
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'hold':
      return x >= 1 ? 1 : 0;
    case 'linear':
    default:
      return x;
  }
}

/* ------------------------------------------------------------------ *
 * Tracce
 * ------------------------------------------------------------------ */

export type TrackValue = number | number[] | boolean;

export interface Keyframe<T extends TrackValue> {
  /** istante in secondi */
  t: number;
  value: T;
  /** easing del tratto che *parte* da questo keyframe */
  ease: EasingId;
}

function lerpValue<T extends TrackValue>(a: T, b: T, u: number): T {
  if (typeof a === 'number' && typeof b === 'number') {
    return (a + (b - a) * u) as T;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((value, index) => value + ((b[index] as number) - value) * u) as T;
  }
  // booleans and mismatched shapes: step
  return (u >= 1 ? b : a) as T;
}

export class Track<T extends TrackValue> {
  private keys: Keyframe<T>[] = [];

  constructor(
    private readonly initial: T,
    keys: Keyframe<T>[] = []
  ) {
    keys.forEach((key) => this.add(key.t, key.value, key.ease));
  }

  /** Inserisce (o sostituisce) un keyframe e mantiene la traccia ordinata. */
  add(t: number, value: T, ease: EasingId = 'smooth'): Keyframe<T> {
    const key: Keyframe<T> = { t: Math.max(0, t), value, ease };
    const existing = this.keys.findIndex((k) => Math.abs(k.t - key.t) < 1e-3);
    if (existing >= 0) this.keys[existing] = key;
    else this.keys.push(key);
    this.keys.sort((a, b) => a.t - b.t);
    return key;
  }

  removeAt(index: number): boolean {
    if (index < 0 || index >= this.keys.length) return false;
    this.keys.splice(index, 1);
    return true;
  }

  clear() {
    this.keys = [];
  }

  get keyframes(): readonly Keyframe<T>[] {
    return this.keys;
  }

  get lastTime(): number {
    return this.keys.length ? this.keys[this.keys.length - 1].t : 0;
  }

  /** Valore della traccia all'istante `t` (clampato fuori dall'intervallo). */
  sample(t: number): T {
    if (this.keys.length === 0) return this.initial;
    if (t <= this.keys[0].t) return this.keys[0].value;

    const last = this.keys[this.keys.length - 1];
    if (t >= last.t) return last.value;

    for (let i = 0; i < this.keys.length - 1; i++) {
      const a = this.keys[i];
      const b = this.keys[i + 1];
      if (t >= a.t && t < b.t) {
        const span = b.t - a.t;
        const u = span <= 1e-6 ? 1 : (t - a.t) / span;
        return lerpValue(a.value, b.value, ease(a.ease, u));
      }
    }
    return last.value;
  }
}

/* ------------------------------------------------------------------ *
 * Stato del rig a un istante
 * ------------------------------------------------------------------ */

/** Posizione della camera descritta come nei preset (direzione + regione). */
export interface CameraKey {
  t: number;
  ease: EasingId;
  /** versore dal target verso la camera */
  direction: [number, number, number];
  target: [number, number, number];
  /** regione che deve restare inquadrata (la distanza la calcola il framing) */
  fit: { width: number; height: number };
}

export interface RigState {
  direction: THREE.Vector3;
  target: THREE.Vector3;
  fit: { width: number; height: number };
  /** rotazione del piatto girevole, in gradi */
  spin: number;
  /** moltiplicatore sulla scala dei faretti del preset */
  lightScale: number;
}

export interface RigKey extends CameraKey {}

export interface Clip {
  id: string;
  label: string;
  hint: string;
  duration: number;
  loop: boolean;
  camera: RigKey[];
  spin: { t: number; ease: EasingId; value: number }[];
  light: { t: number; ease: EasingId; value: number }[];
}

/* ------------------------------------------------------------------ *
 * Preset di ripresa
 * ------------------------------------------------------------------ */

const key = (
  t: number,
  easeId: EasingId,
  view: CameraViewPreset
): RigKey => ({
  t,
  ease: easeId,
  direction: [...view.direction] as [number, number, number],
  target: [...view.target] as [number, number, number],
  fit: { ...view.fit },
});

const view = (id: CameraViewPreset['id']) => {
  const preset = CAMERA_VIEWS.find((v) => v.id === id) ?? CAMERA_VIEWS[0];
  return preset;
};

export const CLIP_PRESETS: Clip[] = [
  {
    id: 'orbit',
    label: 'Hero orbit',
    hint: 'Piatto girevole a 360°, camera ferma: il ciak che si può far girare in loop',
    duration: 8,
    loop: true,
    camera: [key(0, 'linear', view('hero')), key(8, 'linear', view('hero'))],
    spin: [
      { t: 0, ease: 'linear', value: 0 },
      { t: 8, ease: 'linear', value: 360 },
    ],
    light: [
      { t: 0, ease: 'linear', value: 0.9 },
      { t: 8, ease: 'linear', value: 0.9 },
    ],
  },
  {
    id: 'pushIn',
    label: 'Push in',
    hint: 'Dal frontale al macro sul nome, con la luce che sale a fine carrellata',
    duration: 6,
    loop: false,
    camera: [key(0, 'easeInOut', view('front')), key(6, 'easeInOut', view('macro'))],
    spin: [
      { t: 0, ease: 'smooth', value: 0 },
      { t: 6, ease: 'smooth', value: 18 },
    ],
    light: [
      { t: 0, ease: 'smooth', value: 0.75 },
      { t: 6, ease: 'smooth', value: 1 },
    ],
  },
  {
    id: 'crane',
    label: 'Gru zenitale',
    hint: 'Discesa dall\'alto verso il 3/4: il classico movimento di gru',
    duration: 7,
    loop: false,
    camera: [key(0, 'easeInOut', view('top')), key(7, 'easeInOut', view('hero'))],
    spin: [
      { t: 0, ease: 'easeOut', value: -60 },
      { t: 7, ease: 'easeOut', value: 0 },
    ],
    light: [
      { t: 0, ease: 'smooth', value: 1.2 },
      { t: 7, ease: 'smooth', value: 0.85 },
    ],
  },
  {
    id: 'reveal',
    label: 'Reveal azurage',
    hint: 'Si parte dal retro traforato e si gira sul fronte, con la luce in controluce',
    duration: 8.5,
    loop: false,
    camera: [key(0, 'easeInOut', view('back')), key(8.5, 'easeInOut', view('hero'))],
    spin: [
      { t: 0, ease: 'smooth', value: 25 },
      { t: 8.5, ease: 'smooth', value: 0 },
    ],
    light: [
      { t: 0, ease: 'smooth', value: 1.25 },
      { t: 8.5, ease: 'smooth', value: 0.8 },
    ],
  },
  {
    id: 'profileSweep',
    label: 'Profilo tecnico',
    hint: 'Lettura di spessore e maglia, poi chiusura sul nome',
    duration: 7.5,
    loop: false,
    camera: [key(0, 'easeInOut', view('profile')), key(7.5, 'easeInOut', view('hero'))],
    spin: [
      { t: 0, ease: 'easeOut', value: -90 },
      { t: 7.5, ease: 'easeOut', value: 0 },
    ],
    light: [
      { t: 0, ease: 'linear', value: 1 },
      { t: 7.5, ease: 'linear', value: 1 },
    ],
  },
];

export function findClip(id: string): Clip {
  return CLIP_PRESETS.find((clip) => clip.id === id) ?? CLIP_PRESETS[0];
}

/* ------------------------------------------------------------------ *
 * Valutazione
 * ------------------------------------------------------------------ */

interface CompiledClip {
  direction: Track<number[]>;
  target: Track<number[]>;
  fit: Track<number[]>;
  spin: Track<number>;
  light: Track<number>;
}

/** Compila le tracce di un clip una volta sola. */
export function compileClip(clip: Clip): CompiledClip {
  return {
    direction: new Track<number[]>(clip.camera[0]?.direction ?? [0, 0, 1], clip.camera.map((k) => ({ t: k.t, ease: k.ease, value: k.direction }))),
    target: new Track<number[]>(clip.camera[0]?.target ?? [0, 0, 0], clip.camera.map((k) => ({ t: k.t, ease: k.ease, value: k.target }))),
    fit: new Track<number[]>(
      clip.camera[0] ? [clip.camera[0].fit.width, clip.camera[0].fit.height] : [9, 5],
      clip.camera.map((k) => ({ t: k.t, ease: k.ease, value: [k.fit.width, k.fit.height] }))
    ),
    spin: new Track<number>(clip.spin[0]?.value ?? 0, clip.spin),
    light: new Track<number>(clip.light[0]?.value ?? 1, clip.light),
  };
}

/** Valuta il rig (camera + piatto + luci) all'istante `t` del clip. */
export function evaluateClip(compiled: CompiledClip, t: number): RigState {
  const direction = new THREE.Vector3(...(compiled.direction.sample(t) as [number, number, number]));
  if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
  direction.normalize();

  const targetArray = compiled.target.sample(t) as [number, number, number];
  const fitArray = compiled.fit.sample(t) as [number, number];

  return {
    direction,
    target: new THREE.Vector3(targetArray[0], targetArray[1], targetArray[2]),
    fit: { width: Math.max(0.5, fitArray[0]), height: Math.max(0.5, fitArray[1]) },
    spin: compiled.spin.sample(t),
    lightScale: Math.max(0.05, compiled.light.sample(t)),
  };
}

/** Numero di fotogrammi che compongono il take. */
export function frameCountOf(clip: Clip, fps: number): number {
  return Math.max(2, Math.round(clip.duration * fps));
}

/** Durata reale del take dopo l'arrotondamento ai fotogrammi interi. */
export function takeDuration(clip: Clip, fps: number): number {
  return frameCountOf(clip, fps) / fps;
}

/**
 * Ricerca binaria del fotogramma più vicino all'istante richiesto: la usano lo
 * scrubbing e la verifica dei budget di durata.
 */
export function nearestFrame(t: number, fps: number, frames: number): number {
  return THREE.MathUtils.clamp(Math.round(t * fps), 0, frames - 1);
}

export function frameTime(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Intervallo di otturatore da campionare per il motion blur.
 * 180° => mezzo fotogramma, come una macchina da presa standard.
 */
export function shutterSpan(fps: number, shutterAngleDegrees: number): number {
  return (1 / fps) * THREE.MathUtils.clamp(shutterAngleDegrees, 0, 360) / 360;
}

import * as THREE from 'three';
import { computeFramingFov, computeViewDistance } from './cameraFraming';
import type { RigState } from './timeline';

/**
 * Stima dell'effetto dell'otturatore, in pixel sullo schermo.
 *
 * Serve a rispondere alla domanda "il motion blur si vede?" prima di
 * registrare: con un piatto che gira piano e un otturatore a 180° lo
 * spostamento può essere inferiore al pixel e l'integrazione, pur corretta,
 * non produce alcuna strisciata. Il calcolo è puro (nessun renderer) e misura
 * lo spostamento *relativo* del soggetto fra inizio e fine dell'otturatore,
 * proiettato sulla camera del fotogramma.
 */

/** raggio rappresentativo dei punti più esterni del ciondolo (in unità di scena) */
export const SUBJECT_RADIUS = 4.3;

export interface ShutterEstimate {
  /** durata dell'otturatore in secondi */
  span: number;
  /** spostamento massimo stimato sullo schermo, in pixel */
  pixels: number;
  /** rotazione del piatto durante l'otturatore, in gradi */
  spinDegrees: number;
  /** vero se lo spostamento è sotto il pixel: il blur non si vedrà */
  negligible: boolean;
  /** vero se la scena è completamente ferma durante l'otturatore */
  still: boolean;
}

const cameraFor = (
  rig: RigState,
  aspect: number,
  out: THREE.PerspectiveCamera
): THREE.PerspectiveCamera => {
  const fov = computeFramingFov(aspect, rig.fit);
  const distance = computeViewDistance(fov, aspect, rig.fit);
  out.fov = fov;
  out.aspect = aspect;
  out.position.copy(rig.target).addScaledVector(rig.direction, distance);
  out.lookAt(rig.target);
  out.updateMatrixWorld(true);
  out.updateProjectionMatrix();
  return out;
};

/** punti di campionamento sul bordo del soggetto, ruotati dal piatto */
const subjectPoints = (spinDegrees: number): THREE.Vector3[] => {
  const spin = THREE.MathUtils.degToRad(spinDegrees);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = spin + (i * Math.PI) / 4;
    points.push(
      new THREE.Vector3(
        Math.sin(angle) * SUBJECT_RADIUS,
        Math.cos(angle) * 1.4,
        Math.cos(angle) * SUBJECT_RADIUS
      )
    );
  }
  return points;
};

const project = (point: THREE.Vector3, camera: THREE.PerspectiveCamera): THREE.Vector3 | null => {
  const ndc = point.clone().project(camera);
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null;
  return ndc;
};

/**
 * Spostamento in pixel del soggetto fra due stati del rig.
 * La proiezione usa la camera dello stato `to`: è la camera che espone il
 * fotogramma, quindi la sua è la geometria dello schermo.
 */
export function screenTravel(
  from: RigState,
  to: RigState,
  aspect: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  const camera = cameraFor(to, aspect, new THREE.PerspectiveCamera());
  const before = subjectPoints(from.spin);
  const after = subjectPoints(to.spin);

  let max = 0;
  for (let i = 0; i < before.length; i++) {
    const a = project(before[i], camera);
    const b = project(after[i], camera);
    if (!a || !b) continue;
    const dx = ((b.x - a.x) * viewportWidth) / 2;
    const dy = ((b.y - a.y) * viewportHeight) / 2;
    max = Math.max(max, Math.hypot(dx, dy));
  }
  return max;
}

/**
 * Stima della strisciata prodotta dall'integrazione sull'otturatore:
 * `rigAt` è la funzione pura che campiona il rig a un istante arbitrario.
 */
export function estimateShutterTravel(
  rigAt: (time: number) => RigState,
  time: number,
  options: {
    span: number;
    aspect: number;
    viewportWidth: number;
    viewportHeight: number;
  }
): ShutterEstimate {
  const half = options.span / 2;
  const from = rigAt(Math.max(0, time - half));
  const to = rigAt(time + half);

  const pixels = screenTravel(
    from,
    to,
    options.aspect,
    options.viewportWidth,
    options.viewportHeight
  );
  const spinDegrees = Math.abs(to.spin - from.spin);
  const direction = from.direction.distanceTo(to.direction);
  const target = from.target.distanceTo(to.target);
  const still = spinDegrees < 1e-6 && direction < 1e-9 && target < 1e-9;

  return {
    span: options.span,
    pixels,
    spinDegrees,
    negligible: !still && pixels < 1,
    still,
  };
}

/** descrizione pronta per la UI */
export function describeShutter(estimate: ShutterEstimate, viewportWidth: number): string {
  if (estimate.still) return 'scena ferma: l\'otturatore non aggiunge blur a questo fotogramma';
  const travel = estimate.pixels < 1 ? '<1' : estimate.pixels.toFixed(1);
  const fraction = ((estimate.pixels / viewportWidth) * 100).toFixed(1);
  const base = `${travel} px su ${Math.round(viewportWidth)} (${fraction}%)`;
  if (estimate.negligible) {
    return `${base} — sotto il pixel: alza l'angolo di otturatore o rallenta gli fps per vederlo`;
  }
  return `${base} di strisciata`;
}

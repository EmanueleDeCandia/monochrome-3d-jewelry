import * as THREE from 'three';

/**
 * Responsive framing.
 *
 * The original build hard-coded a camera at ~8.4 units with a 36° FOV, which
 * crops the piece on wide viewports and crops it even more on portrait phones.
 * The helpers below derive the FOV and the per-view distance from the real size
 * of the assembly and the current viewport aspect ratio.
 */

export interface FitBox {
  /** horizontal extent that has to stay visible (world units) */
  width: number;
  /** vertical extent that has to stay visible (world units) */
  height: number;
}

export interface FramingParams {
  /** FOV used when the viewport is wide enough (degrees) */
  baseFov?: number;
  minFov?: number;
  maxFov?: number;
  /** distance that gives a pleasant perspective before fitting kicks in */
  preferredDistance?: number;
  /** safety margin, 1.08 = 8% of breathing room */
  margin?: number;
}

const DEFAULT_PARAMS: Required<FramingParams> = {
  baseFov: 34,
  minFov: 24,
  maxFov: 46,
  preferredDistance: 12.5,
  margin: 1.08,
};

const roundDown = (value: number) => Math.round(value * 100) / 100;

/**
 * Vertical FOV (degrees) that keeps `fit` inside the frustum at
 * `preferredDistance` for the given aspect ratio.
 */
export function computeFramingFov(aspect: number, fit: FitBox, params: FramingParams = {}): number {
  const { baseFov, minFov, maxFov, preferredDistance } = { ...DEFAULT_PARAMS, ...params };
  const halfHeight = fit.height / 2 / preferredDistance;
  const halfWidth = fit.width / 2 / preferredDistance;
  const halfVertical = Math.max(
    Math.atan(halfHeight),
    Math.atan(Math.tan(Math.atan(halfWidth)) / Math.max(0.2, aspect))
  );
  const degrees = THREE.MathUtils.radToDeg(halfVertical) * 2;
  return roundDown(THREE.MathUtils.clamp(Math.max(degrees, baseFov * 0.7), minFov, maxFov));
}

/** Distance at which `fit` exactly fills the frame for a given FOV/aspect. */
export function computeViewDistance(
  fovDegrees: number,
  aspect: number,
  fit: FitBox,
  params: FramingParams = {}
): number {
  const { margin } = { ...DEFAULT_PARAMS, ...params };
  const halfV = THREE.MathUtils.degToRad(fovDegrees) / 2;
  const tanV = Math.tan(halfV);
  const tanH = tanV * Math.max(0.2, aspect);
  const alongVertical = fit.height / 2 / tanV;
  const alongHorizontal = fit.width / 2 / tanH;
  return roundDown(Math.max(alongVertical, alongHorizontal) * margin);
}

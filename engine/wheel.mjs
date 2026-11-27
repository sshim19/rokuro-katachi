/** Positions → ω, centering, inBand, and wobble integration. No drawing. */

import {
  CENTERING_BAND_IN,
  CENTERING_BAND_OUT,
  CENTERING_FALLOFF,
  CENTERING_RADIAL_BONUS,
  E_MAX,
  OMEGA_DEAD,
  OMEGA_DECAY_TAU,
  OMEGA_FACTOR_FLOOR,
  OMEGA_MID_DROP,
  OMEGA_SMOOTH_TAU,
  SPEED_ERR_MAX,
  WHEEL_CX,
  WHEEL_CY,
  WOBBLE_CORR,
  WOBBLE_GROW,
  clayMaxRadius,
  clamp,
  spinWeight,
} from "./constants.mjs";

export { spinWeight };

export function foldPi(d) {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export function emptyLeft() {
  return { prevTheta: null, omega: 0, r: 0, prevR: null };
}

/**
 * Update wheel spin from a left-hand sample.
 * When inactive, out of the spin ring, or not landscape, ω decays with tau 0.22.
 */
export function updateLeft(left, pos, dt, active) {
  const next = {
    prevTheta: left?.prevTheta ?? null,
    omega: Number(left?.omega) || 0,
    r: Number(left?.r) || 0,
    prevR: left?.prevR ?? null,
  };
  const step = Math.max(0, Number(dt) || 0);
  if (!active || !pos) {
    next.omega = next.omega * Math.exp(-step / OMEGA_DECAY_TAU);
    next.prevTheta = null;
    next.prevR = null;
    return next;
  }
  const x = Number(pos.x);
  const y = Number(pos.y);
  const dx = x - WHEEL_CX;
  const dy = y - WHEEL_CY;
  const r = Math.hypot(dx, dy);
  const theta = Math.atan2(dy, dx);
  const weight = spinWeight(r);
  next.prevR = next.r;
  next.r = r;
  if (weight <= 0 || !(step > 0) || next.prevTheta == null) {
    if (weight <= 0) next.omega = next.omega * Math.exp(-step / OMEGA_DECAY_TAU);
    next.prevTheta = theta;
    return next;
  }
  const dTheta = foldPi(theta - next.prevTheta);
  let inst = Math.abs(dTheta) / step / (2 * Math.PI);
  inst *= weight;
  next.omega += (inst - next.omega) * (1 - Math.exp(-step / OMEGA_SMOOTH_TAU));
  next.prevTheta = theta;
  return next;
}

/** Side-of-clay quality 0–1, plus a small inward-press bonus. 0 if not contacting or ω is dead. */
export function computeCentering({ r, prevR, dt, omega, rings, active }) {
  if (!active || (Number(omega) || 0) < OMEGA_DEAD) return 0;
  const clayR = clayMaxRadius(rings);
  const lo = clayR + CENTERING_BAND_IN;
  const hi = clayR + CENTERING_BAND_OUT;
  const x = Number(r) || 0;
  let side = 0;
  if (x >= lo && x <= hi) side = 1;
  else if (x < lo) {
    const d = lo - x;
    side = d >= CENTERING_FALLOFF ? 0 : 1 - d / CENTERING_FALLOFF;
  } else {
    const d = x - hi;
    side = d >= CENTERING_FALLOFF ? 0 : 1 - d / CENTERING_FALLOFF;
  }
  let bonus = 0;
  const prev = prevR;
  const step = Number(dt) || 0;
  if (prev != null && step > 0 && x > clayR) {
    const vr = (x - Number(prev)) / step;
    // Gentle inward press: negative radial speed, not a jab.
    if (vr < 0 && vr > -40) bonus = CENTERING_RADIAL_BONUS * clamp((-vr) / 16, 0, 1);
  }
  return clamp(side + bonus, 0, 1);
}

/**
 * Live speed band. During a throw, as H / rMax grows past the starting aspect,
 * ω_mid drops by up to 0.16 rev/s. Width is held from the daily lo/hi pair.
 */
export function liveOmegaBand(params, H, rings) {
  const width = Math.max(
    1e-6,
    Number(params?.omegaWidth) || Number(params?.omegaHi) - Number(params?.omegaLo) || 0.3,
  );
  const rMax = Math.max(8, clayMaxRadius(rings));
  const aspect = (Number(H) || 0) / rMax;
  const aspect0 = Number(params?.aspect0);
  const start = Number.isFinite(aspect0) ? aspect0 : aspect;
  const drop = OMEGA_MID_DROP * clamp((aspect - start) / 3.5, 0, 1);
  const mid = Number(params?.omegaMid) - drop;
  return {
    omegaMid: mid,
    omegaLo: mid - width / 2,
    omegaHi: mid + width / 2,
    width,
  };
}

export function bandMetrics(omega, band) {
  const w = Number(omega) || 0;
  const lo = Number(band?.omegaLo) || 0;
  const hi = Number(band?.omegaHi) || 0;
  const width = Math.max(1e-6, Number(band?.width) || hi - lo);
  const half = 0.5 * width;
  let overflow = 0;
  if (w < lo) overflow = lo - w;
  else if (w > hi) overflow = w - hi;
  const speedErr = overflow <= 0 ? 0 : clamp(overflow / half, 0, SPEED_ERR_MAX);
  const inBand = overflow <= 0 ? 1 : clamp(1 - overflow / half, 0, 1);
  let omegaFactor;
  if (w < OMEGA_DEAD) omegaFactor = 0;
  else if (overflow <= 0) omegaFactor = 1;
  else {
    const t = clamp(overflow / half, 0, 1);
    omegaFactor = 1 - t * (1 - OMEGA_FACTOR_FLOOR);
  }
  return { speedErr, inBand, omegaFactor };
}

/**
 * One wobble step. `shaping` is 1 when the right hand is actually working the wall.
 * Coefficients default to the (possibly retuned) DESIGN values.
 */
export function stepWobble({
  e,
  dt,
  wobbleK = 1,
  speedErr = 0,
  shaping = 0,
  omega = 0,
  centering = 0,
  inBand = 0,
  growK = WOBBLE_GROW,
  corrK = WOBBLE_CORR,
} = {}) {
  const slow = (Number(omega) || 0) < OMEGA_DEAD ? 1 : 0;
  const grow =
    (Number(wobbleK) || 0) *
    (0.55 * speedErr + 0.35 * (shaping ? 1 : 0) * (0.25 + 0.75 * speedErr) + 0.12 * slow);
  const corr = corrK * (Number(centering) || 0) * (Number(inBand) || 0);
  const de = (growK * grow - corr) * (Number(dt) || 0);
  return clamp((Number(e) || 0) + de, 0, E_MAX);
}

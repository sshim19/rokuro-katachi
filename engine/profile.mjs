/** Rings, volume conservation, pulling, bake, collapse, and profileMatch. Pure functions. */

import {
  BAKE_SIGMA,
  E_CENTER_SCALE,
  H_MAX,
  H_MIN,
  IDLE_SINK,
  KERNEL_WIDTH,
  LUMP_H,
  MATCH_SAMPLES,
  R_MAX,
  R_MIN,
  RING_COUNT,
  RIM_MARGIN,
  SHAPE_RATE,
  SLUMP_E,
  SLUMP_E_JUMP,
  SLUMP_H_SCALE,
  SLUMP_VOL_LOSS,
  TAP_PATH,
  clamp,
  gradeForScore,
} from "./constants.mjs";
import { rngGauss } from "./rng.mjs";

export { gradeForScore };

export function ringHeight(i, H, n = RING_COUNT) {
  return ((i + 0.5) / n) * H;
}

export function volumeOf(rings, H, n = RING_COUNT) {
  const height = Number(H) || 0;
  if (!(height > 0) || !rings || !rings.length) return 0;
  const dh = height / n;
  let sum = 0;
  const count = Math.min(n, rings.length);
  for (let i = 0; i < count; i++) {
    const r = Number(rings[i]) || 0;
    sum += r * r;
  }
  return Math.PI * sum * dh;
}

/** Piecewise-linear radius at an absolute height. 0 above the rim. */
export function radiusAtHeight(rings, H, h) {
  const height = Number(H) || 0;
  if (!(height > 0) || h < 0 || h > height || !rings || !rings.length) return 0;
  const n = rings.length;
  const x = (h / height) * n - 0.5;
  if (x <= 0) return Number(rings[0]) || 0;
  if (x >= n - 1) return Number(rings[n - 1]) || 0;
  const i = Math.floor(x);
  const t = x - i;
  const a = Number(rings[i]) || 0;
  const b = Number(rings[i + 1]) || 0;
  return a + (b - a) * t;
}

export function resampleRings(rings, oldH, newH, n = RING_COUNT) {
  const next = new Array(n);
  const H = Math.max(0, Number(newH) || 0);
  for (let i = 0; i < n; i++) {
    const h = ringHeight(i, H, n);
    let r = radiusAtHeight(rings, oldH, h);
    if (h > oldH) r = Number(rings[rings.length - 1]) || R_MIN;
    next[i] = clamp(r, R_MIN, R_MAX);
  }
  return next;
}

export function resampleToN(rings, H, Hcmp, n = MATCH_SAMPLES) {
  const out = new Array(n);
  const cmp = Math.max(Number(Hcmp) || 0, 0);
  for (let j = 0; j < n; j++) {
    const h = ((j + 0.5) / n) * cmp;
    out[j] = h <= H ? radiusAtHeight(rings, H, h) : 0;
  }
  return out;
}

/**
 * Scale radii (and if needed a touch of height) so volume matches `targetV`.
 * `allowLoss` lets volume fall by up to `loss` (collapse only).
 */
export function restoreVolume(rings, H, targetV, allowLoss = 0) {
  let nextR = rings.slice();
  let nextH = clamp(Number(H) || LUMP_H, H_MIN, H_MAX);
  const want = Math.max(0, Number(targetV) || 0);
  const floor = want * (1 - Math.max(0, allowLoss));
  let v = volumeOf(nextR, nextH);
  if (!(v > 0) || !(want > 0)) return { rings: nextR, H: nextH, volume: v };
  const goal = allowLoss > 0 ? clamp(v, floor, want) : want;
  const scale = Math.sqrt(goal / v);
  for (let i = 0; i < nextR.length; i++) {
    nextR[i] = clamp(nextR[i] * scale, R_MIN, R_MAX);
  }
  v = volumeOf(nextR, nextH);
  if (Math.abs(v - goal) / goal > 0.002 && nextH > 0) {
    const h2 = clamp(nextH * (goal / v), H_MIN, H_MAX);
    nextR = resampleRings(nextR, nextH, h2);
    nextH = h2;
    v = volumeOf(nextR, nextH);
    if (v > 0 && Math.abs(v - goal) / goal > 0.002) {
      const s2 = Math.sqrt(goal / v);
      for (let i = 0; i < nextR.length; i++) nextR[i] = clamp(nextR[i] * s2, R_MIN, R_MAX);
      v = volumeOf(nextR, nextH);
    }
  }
  return { rings: nextR, H: nextH, volume: v };
}

export function makeLump(targetVolume, H = LUMP_H) {
  const n = RING_COUNT;
  const shape = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    // Mound: wider at the base, tapering toward the top.
    shape[i] = 1 - 0.42 * t * t;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += shape[i] * shape[i];
  const vShape = Math.PI * sum * (H / n);
  const s = vShape > 0 ? Math.sqrt((Number(targetVolume) || vShape) / vShape) : R_MIN;
  const rings = shape.map((k) => clamp(k * s, R_MIN, R_MAX));
  return restoreVolume(rings, H, targetVolume);
}

export function kernelWeight(h, hWork, width = KERNEL_WIDTH) {
  const d = Math.abs((Number(h) || 0) - (Number(hWork) || 0));
  const half = Math.max(1e-6, (Number(width) || KERNEL_WIDTH) / 2);
  if (d >= half) return 0;
  return 1 - d / half;
}

export function profileMatch(rings, H, targetR, targetH) {
  const Hcmp = Math.max(Number(H) || 0, Number(targetH) || 0);
  if (!(Hcmp > 0)) return 0;
  const a = resampleToN(rings, H, Hcmp);
  const b = resampleToN(targetR, targetH, Hcmp);
  let abs = 0;
  for (let i = 0; i < a.length; i++) abs += Math.abs(a[i] - b[i]);
  const meanAbs = abs / a.length;
  const heightPen = Math.abs((Number(H) || 0) - (Number(targetH) || 0)) / 80;
  const profileErr = meanAbs / 70 + 0.35 * heightPen;
  return Math.max(0, 1 - profileErr / 0.55);
}

export function scoreParts(rings, H, targetR, targetH, e) {
  const match = profileMatch(rings, H, targetR, targetH);
  const centerScore = 1 - clamp((Number(e) || 0) / E_CENTER_SCALE, 0, 1);
  const score = Math.round(100 * (0.72 * match + 0.28 * centerScore));
  return { profileMatch: match, centerScore, score, grade: gradeForScore(score) };
}

export function computeScore(rings, H, targetR, targetH, e) {
  return scoreParts(rings, H, targetR, targetH, e).score;
}

function clampOverhang(rings, H) {
  const next = rings.slice();
  const spacing = (Number(H) || 1) / next.length;
  const maxDr = 1.8 * Math.max(spacing, 2);
  for (let i = 1; i < next.length; i++) {
    if (next[i] > next[i - 1] + maxDr) next[i] = next[i - 1] + maxDr;
  }
  return next;
}

/**
 * Parametric vessel silhouette used by dailyParams.
 * Heights are in wu; key radii are foot / belly / mouth.
 */
export function makeTarget({ H, rFoot, rBelly, rMouth, bellyAt, footH }) {
  const height = clamp(Number(H) || 100, 64, 200);
  const n = RING_COUNT;
  const bellyT = clamp(Number(bellyAt) || 0.5, 0.2, 0.85);
  const footT = clamp(Number(footH) || 0.08, 0.03, 0.2);
  const foot = Math.max(R_MIN, Number(rFoot) || 20);
  const belly = Math.max(R_MIN, Number(rBelly) || 40);
  const mouth = Math.max(R_MIN, Number(rMouth) || 30);
  const rings = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    let r;
    if (t <= footT) {
      const u = t / Math.max(footT, 1e-6);
      const s = u * u * (3 - 2 * u);
      r = foot + (lerpToward(foot, belly, 0.35) - foot) * s;
    } else if (t <= bellyT) {
      const u = (t - footT) / Math.max(bellyT - footT, 1e-6);
      const s = u * u * (3 - 2 * u);
      r = lerpToward(lerpToward(foot, belly, 0.35), belly, s);
    } else {
      const u = (t - bellyT) / Math.max(1 - bellyT, 1e-6);
      const s = u * u * (3 - 2 * u);
      r = lerpToward(belly, mouth, s);
    }
    rings[i] = r;
  }
  let out = clampOverhang(rings, height);
  let maxR = 0;
  for (const r of out) if (r > maxR) maxR = r;
  if (maxR > 96 && maxR > 0) out = out.map((r) => r * (96 / maxR));
  if (maxR < 36 && maxR > 0) out = out.map((r) => r * (36 / maxR));
  out = out.map((r) => clamp(r, R_MIN, R_MAX));
  return { H: height, rings: out };
}

function lerpToward(a, b, t) {
  return a + (b - a) * t;
}

/** Volume of a starting mound with peak radius `rPeak` at H = 52. */
export function lumpCapacity(rPeak = 80) {
  const n = RING_COUNT;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = rPeak * (1 - 0.42 * t * t);
    sum += r * r;
  }
  return Math.PI * sum * (LUMP_H / n);
}

/** Lump stays H=52 with a throwable width. Shrink a too-large target if needed. */
export function fitTargetVolume(target) {
  const cap = lumpCapacity(80);
  let { H, rings } = target;
  const v = volumeOf(rings, H);
  if (v > cap * 0.98) {
    const s = Math.sqrt((cap * 0.98) / v);
    rings = rings.map((r) => clamp(r * s, R_MIN, R_MAX));
  }
  return { H, rings };
}

/**
 * After a local pull, put leftover volume into height when pulling up,
 * and borrow from neighbors / height when pulling out. Do not uniformly
 * rescale the whole wall (that would undo the pull).
 */
export function conserveShapingVolume(rings, H, targetV, { upward = false, hWork = 0 } = {}) {
  let next = rings.slice();
  let nextH = Number(H) || LUMP_H;
  const want = Math.max(0, Number(targetV) || 0);
  if (!(want > 0)) return { rings: next, H: nextH, volume: volumeOf(next, nextH) };

  const weights = next.map((_, i) => {
    const k = kernelWeight(ringHeight(i, nextH), hWork);
    return Math.max(0.05, 1 - k);
  });

  let v = volumeOf(next, nextH);
  if (v < want * 0.998) {
    if (upward || (Number(hWork) || 0) >= nextH - 14) {
      const rRim = Math.max(R_MIN, Number(next[next.length - 1]) || R_MIN);
      const dH = Math.min(0.45, (want - v) / (Math.PI * rRim * rRim));
      const taller = clamp(nextH + Math.max(0, dH), H_MIN, H_MAX);
      if (taller > nextH) {
        next = resampleRings(next, nextH, taller);
        nextH = taller;
        v = volumeOf(next, nextH);
      }
    }
    if (v < want * 0.998) {
      // Move leftover clay upward, never back into the foot below the work point.
      const upWeights = next.map((_, i) => {
        const h = ringHeight(i, nextH);
        if (h < (Number(hWork) || 0) - 4) return 0.02;
        return Math.max(0.08, 1 - 0.5 * kernelWeight(h, hWork));
      });
      next = addVolumeToRings(next, nextH, want - v, upWeights);
      v = volumeOf(next, nextH);
    }
  } else if (v > want * 1.002) {
    next = addVolumeToRings(next, nextH, want - v, weights);
    v = volumeOf(next, nextH);
    if (v > want * 1.005) {
      const shorter = clamp(nextH * (want / v), H_MIN, H_MAX);
      if (shorter < nextH) {
        next = resampleRings(next, nextH, shorter);
        nextH = shorter;
        v = volumeOf(next, nextH);
      }
    }
  }
  for (let i = 0; i < next.length; i++) next[i] = clamp(next[i], R_MIN, R_MAX);
  v = volumeOf(next, nextH);
  if (v > 0 && want > 0 && Math.abs(v - want) / want > 0.001) {
    const s = Math.sqrt(want / v);
    if (s > 0.93 && s < 1.07) {
      for (let i = 0; i < next.length; i++) next[i] = clamp(next[i] * s, R_MIN, R_MAX);
      v = volumeOf(next, nextH);
    }
  }
  return { rings: next, H: nextH, volume: v };
}

function addVolumeToRings(rings, H, dV, weights) {
  const next = rings.slice();
  const n = next.length;
  const dh = (Number(H) || LUMP_H) / n;
  if (!(dh > 0) || !Number.isFinite(dV) || Math.abs(dV) < 1e-9) return next;
  let wsum = 0;
  for (let i = 0; i < n; i++) wsum += weights[i] || 0;
  if (!(wsum > 0)) return next;
  for (let i = 0; i < n; i++) {
    const share = dV * ((weights[i] || 0) / wsum);
    // dV_i = π * 2 r * dr * dh  →  dr = share / (π * 2 r * dh)
    const r = Math.max(R_MIN, next[i]);
    const dr = share / (Math.PI * 2 * r * dh);
    next[i] = clamp(r + dr, R_MIN, R_MAX);
  }
  return next;
}

/**
 * Apply one shaping step while the right hand is in contact.
 * Returns updated rings, H, volume, and the next rng state (bake uses it).
 */
export function stepProfile({
  rings,
  H,
  volume,
  dt,
  clayK = 1,
  omegaFactor = 1,
  e = 0,
  hWork,
  rDes,
  upward = false,
  pathLen = 0,
  rngState,
  bake = BAKE_SIGMA,
  rateK = SHAPE_RATE,
} = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const rate = rateK * clayK * (Number(omegaFactor) || 0) * (1 - 0.7 * clamp((Number(e) || 0) / E_CENTER_SCALE, 0, 1));
  let next = rings.slice();
  let nextH = Number(H) || LUMP_H;
  let a = rngState >>> 0;
  if (!(step > 0) || rate <= 0) {
    return { rings: next, H: nextH, volume: volumeOf(next, nextH), rngState: a, moved: false };
  }

  const wantR = Math.max(0, Number(rDes) || 0);
  const movedDr = new Array(next.length).fill(0);
  let moved = false;
  for (let i = 0; i < next.length; i++) {
    const k = kernelWeight(ringHeight(i, nextH), hWork);
    if (k <= 0) continue;
    const blend = Math.min(1, rate * k * step);
    if (blend <= 0) continue;
    const before = next[i];
    next[i] = before + (wantR - before) * blend;
    movedDr[i] = next[i] - before;
    if (Math.abs(movedDr[i]) > 1e-9) moved = true;
  }

  const canStretch = upward && pathLen >= TAP_PATH && hWork >= nextH - RIM_MARGIN;
  if (canStretch) {
    const targetH = Math.max(nextH, Number(hWork) || nextH);
    const dH = (targetH - nextH) * Math.min(1, rate * step);
    if (dH > 0) {
      const taller = clamp(nextH + dH, H_MIN, H_MAX);
      if (taller !== nextH) {
        next = resampleRings(next, nextH, taller);
        nextH = taller;
        moved = true;
      }
    }
  }

  if (moved && (Number(e) || 0) > 0.05) {
    const eScale = clamp((Number(e) || 0) / E_CENTER_SCALE, 0, 1);
    for (let i = 0; i < next.length; i++) {
      const dr = movedDr[i];
      if (!(Math.abs(dr) > 1e-9)) continue;
      const g = rngGauss(a);
      a = g.a;
      next[i] += g.value * bake * eScale * Math.abs(dr);
    }
  }

  for (let i = 0; i < next.length; i++) next[i] = clamp(next[i], R_MIN, R_MAX);
  const restored = conserveShapingVolume(next, nextH, volume, { upward, hWork });
  return { rings: restored.rings, H: restored.H, volume: restored.volume, rngState: a, moved };
}

/** Soft clay sinks very slowly only while the wheel is nearly stopped. */
export function idleSink(rings, H, volume, dt, clay, omega) {
  if (clay !== "soft" || (Number(omega) || 0) >= 0.12) {
    return { rings, H, volume };
  }
  const nextH = clamp((Number(H) || LUMP_H) - IDLE_SINK * (Number(dt) || 0), H_MIN, H_MAX);
  if (Math.abs(nextH - H) < 1e-9) return { rings, H, volume };
  const next = resampleRings(rings, H, nextH);
  const restored = restoreVolume(next, nextH, volume);
  return { rings: restored.rings, H: restored.H, volume: restored.volume };
}

function isTallThin(H, rings) {
  const rMax = Math.max(8, ...rings.map((r) => Number(r) || 0));
  return (Number(H) || 0) / rMax >= 2.8;
}

function isOpenAboveBand(omega, band, rings, H) {
  if ((Number(omega) || 0) <= (Number(band?.omegaHi) || 0) + 0.08) return false;
  const n = rings.length;
  const mid = rings[Math.min(n - 1, Math.floor(n * 0.55))] || 0;
  const base = rings[Math.min(n - 1, Math.floor(n * 0.15))] || 0;
  return mid > base * 1.2 || (Number(H) || 0) > 120;
}

export function slumpRate({ e, slumpK, omega, band, H, rings }) {
  if ((Number(e) || 0) <= SLUMP_E) return 0;
  if (!isTallThin(H, rings) && !isOpenAboveBand(omega, band, rings, H)) return 0;
  const danger = clamp(((Number(e) || 0) - SLUMP_E) / 10, 0, 1);
  return (Number(slumpK) || 0) * (0.28 + 0.55 * danger);
}

/** Apply a collapse: shorter, wider belly, e jumps, up to 6% volume loss. */
export function applyCollapse({ rings, H, volume, e, rngState }) {
  let nextH = clamp((Number(H) || LUMP_H) * SLUMP_H_SCALE, H_MIN, H_MAX);
  let next = resampleRings(rings, H, nextH);
  const n = next.length;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const belly = Math.exp(-((t - 0.4) * (t - 0.4)) / (2 * 0.18 * 0.18));
    next[i] = clamp(next[i] * (1 + 0.22 * belly), R_MIN, R_MAX);
  }
  const lost = volume * (1 - SLUMP_VOL_LOSS);
  const restored = restoreVolume(next, nextH, lost, SLUMP_VOL_LOSS);
  return {
    rings: restored.rings,
    H: restored.H,
    volume: restored.volume,
    e: clamp((Number(e) || 0) + SLUMP_E_JUMP, 0, 28),
    rngState,
  };
}

/** dailyParams(rngState) → { params, rngState }. Idempotent daily vessel. */

import {
  BAND_WIDTH_MAX,
  BAND_WIDTH_MIN,
  CLAY_TABLE,
  E0_MAX,
  E0_MIN,
  FAMILIES,
  LUMP_H,
  OMEGA_MID_MAX,
  OMEGA_MID_MIN,
  clayMaxRadius,
} from "./constants.mjs";
import { fitTargetVolume, makeTarget, volumeOf } from "./profile.mjs";
import { rngRange, rngStep } from "./rng.mjs";

const FAMILY_RANGES = {
  wan: { h: [70, 110], foot: [18, 32], belly: [48, 80], mouth: [44, 78], bellyAt: [0.45, 0.7], footH: [0.06, 0.12] },
  yunomi: { h: [90, 130], foot: [16, 26], belly: [28, 42], mouth: [26, 40], bellyAt: [0.4, 0.65], footH: [0.05, 0.1] },
  hirabachi: { h: [64, 90], foot: [22, 40], belly: [64, 96], mouth: [62, 96], bellyAt: [0.45, 0.75], footH: [0.06, 0.12] },
  tsubo: { h: [100, 160], foot: [18, 32], belly: [46, 80], mouth: [22, 42], bellyAt: [0.4, 0.6], footH: [0.06, 0.12] },
  tokkuri: { h: [140, 200], foot: [14, 24], belly: [36, 58], mouth: [12, 22], bellyAt: [0.38, 0.55], footH: [0.06, 0.11] },
  hanaire: { h: [150, 200], foot: [16, 28], belly: [28, 48], mouth: [20, 36], bellyAt: [0.45, 0.7], footH: [0.05, 0.1] },
  kodaiwan: { h: [80, 120], foot: [16, 28], belly: [44, 74], mouth: [42, 76], bellyAt: [0.5, 0.72], footH: [0.12, 0.22] },
};

function pickRow(a, table) {
  const step = rngStep(a);
  const i = Math.min(table.length - 1, Math.floor(step.value * table.length));
  return { row: table[i], a: step.a };
}

function pickFamily(a) {
  const step = rngStep(a);
  const i = Math.min(FAMILIES.length - 1, Math.floor(step.value * FAMILIES.length));
  return { family: FAMILIES[i], a: step.a };
}

/**
 * Stream order: clay → family → size params → ω_mid base → band width → e0.
 */
export function dailyParams(rngState) {
  let a = rngState >>> 0;
  let picked = pickRow(a, CLAY_TABLE);
  a = picked.a;
  const clayRow = picked.row;

  const fam = pickFamily(a);
  a = fam.a;
  const family = fam.family;
  const rng = FAMILY_RANGES[family] || FAMILY_RANGES.wan;

  let r = rngRange(a, rng.h[0], rng.h[1]);
  a = r.a;
  const H = r.value;
  r = rngRange(a, rng.foot[0], rng.foot[1]);
  a = r.a;
  const rFoot = r.value;
  r = rngRange(a, rng.belly[0], rng.belly[1]);
  a = r.a;
  const rBelly = r.value;
  r = rngRange(a, rng.mouth[0], rng.mouth[1]);
  a = r.a;
  const rMouth = r.value;
  r = rngRange(a, rng.bellyAt[0], rng.bellyAt[1]);
  a = r.a;
  const bellyAt = r.value;
  r = rngRange(a, rng.footH[0], rng.footH[1]);
  a = r.a;
  const footH = r.value;

  const built = fitTargetVolume(makeTarget({ H, rFoot, rBelly, rMouth, bellyAt, footH }));
  const targetH = built.H;
  const targetR = built.rings;
  const rMax = Math.max(8, clayMaxRadius(targetR));
  const aspect = targetH / rMax;
  const tall = clamp01((aspect - 1) / 4);

  r = rngStep(a);
  a = r.a;
  const omegaMid = OMEGA_MID_MIN + (OMEGA_MID_MAX - OMEGA_MID_MIN) * Math.pow(r.value, 1.35 + tall);

  r = rngStep(a);
  a = r.a;
  const clayNarrow = clayRow.clay === "soft" ? 1.8 : clayRow.clay === "firm" ? 0.65 : 1;
  const omegaWidth = BAND_WIDTH_MIN + (BAND_WIDTH_MAX - BAND_WIDTH_MIN) * Math.pow(r.value, clayNarrow);

  r = rngRange(a, E0_MIN, E0_MAX);
  a = r.a;
  const e0 = r.value;

  const lump = volumeOf(targetR, targetH);
  // aspect0 is the starting lump's aspect, filled in by createInitialState once rings exist.
  // Here we store a placeholder based on a typical mound; sim overwrites with the real lump.
  const aspect0 = LUMP_H / Math.max(8, Math.sqrt(lump / (Math.PI * LUMP_H)));

  return {
    params: {
      clay: clayRow.clay,
      clayK: clayRow.clayK,
      wobbleK: clayRow.wobbleK,
      slumpK: clayRow.slumpK,
      omegaMid,
      omegaLo: omegaMid - omegaWidth / 2,
      omegaHi: omegaMid + omegaWidth / 2,
      omegaWidth,
      targetH,
      targetR,
      family,
      e0,
      aspect0,
    },
    rngState: a,
  };
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

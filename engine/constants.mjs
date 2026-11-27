/** Dimensions, zones, time constants, clay coefficients, grades, and storage keys. Y is down. */

export const VIEW_W = 844;
export const VIEW_H = 390;

export const LEFT_X0 = 0;
export const LEFT_X1 = 400;
export const LEFT_Y0 = 44;
export const LEFT_Y1 = 390;

export const RIGHT_X0 = 444;
export const RIGHT_X1 = 844;
export const RIGHT_Y0 = 44;
export const RIGHT_Y1 = 390;
/** After assignment only: play.mjs may keep the right pointer this far past the edge. */
export const RIGHT_EDGE_SLACK = 24;

export const WHEEL_CX = 248;
export const WHEEL_CY = 236;
export const WHEEL_VISUAL_R = 128;

/** Spin weight: 0 at 52, 1 on 68–132, 0 at 156; outside 156 decays. */
export const SPIN_R0 = 52;
export const SPIN_R1 = 68;
export const SPIN_R2 = 132;
export const SPIN_R3 = 156;

export const PROFILE_AXIS_X = 560;
export const RIGHT_AXIS_X = PROFILE_AXIS_X;
export const PROFILE_BASE_Y = 348;
export const RIGHT_BASE_Y = PROFILE_BASE_Y;
export const PROFILE_H_SCALE = 1.15;

/** Right hand holds a thin shaping stick (ヘラ). The thumb grips the far end; the tip sits at
 *  thumb + (TOOL_DX, TOOL_DY), about 80wu up-left, so the contact point is never under the finger.
 *  With the thumb at y ≤ 370 the tip still reaches height ≈ 0; the top (H_MAX) needs thumb y ≈ 107. */
export const TOOL_DX = -76;
export const TOOL_DY = -24;
/** Drawing only: the handle runs this far past the thumb, away from the tip. */
export const TOOL_TAIL = 22;
export const HEIGHT_SCALE = PROFILE_H_SCALE;

export const PLACE_TIME = 1.4;
export const THROW_TIME = 70;
export const FINISH_MIN = 18;
export const FINISH_MIN_TIME = FINISH_MIN;
export const REVEAL_TIME = 1.6;
export const DAILY_LINE_TIME = 2.5;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const OMEGA_SMOOTH_TAU = 0.12;
export const OMEGA_DECAY_TAU = 0.22;
export const OMEGA_DEAD = 0.12;

export const RING_COUNT = 24;
export const MATCH_SAMPLES = 48;
export const LUMP_H = 52;
export const H_MIN = 40;
export const H_MAX = 230;
export const R_MIN = 8;
export const R_MAX = 110;
export const TARGET_H_MIN = 64;
export const TARGET_H_MAX = 200;
export const TARGET_R_MIN = 36;
export const TARGET_R_MAX = 96;

export const KERNEL_WIDTH = 14;
export const TAP_PATH = 10;
export const RIM_MARGIN = 10;
export const CENTERING_BAND_IN = 8;
export const CENTERING_BAND_OUT = 32;
export const CENTERING_FALLOFF = 24;
export const CENTERING_RADIAL_BONUS = 0.15;

export const E_MAX = 28;
export const E_CENTER_SCALE = 22;
export const E0_MIN = 6;
export const E0_MAX = 10;
export const WOBBLE_CALLOUT_E = 8;
export const SETTLED_E = 4;

/** Tunable §3 coefficients. DESIGN table: grow 1.6, corr 2.4, rate 0.90, bake 5.5. Changes stay within ±35%.
 *  WOBBLE_CORR 2.95: §3 check (e0=16, centering=0.85, 4s → e≤6) fails at 2.4.
 *  WOBBLE_GROW 1.15 and SHAPE_RATE 1.21: needed for the §8 bot gates.
 *  BAKE_SIGMA 4.6: skilled profileMatch and finish time were on the gate edge; slightly less bake adds margin. */
export const WOBBLE_GROW = 1.15;
export const WOBBLE_CORR = 2.95;
export const SHAPE_RATE = 1.21;
export const BAKE_SIGMA = 4.6;
export const OMEGA_FACTOR_FLOOR = 0.35;
export const OMEGA_MID_DROP = 0.16;
export const SPEED_ERR_MAX = 1.5;

export const SLUMP_E = 18;
export const SLUMP_COOLDOWN = 2.5;
export const SLUMP_E_JUMP = 6;
export const SLUMP_H_SCALE = 0.85;
export const SLUMP_VOL_LOSS = 0.06;
export const IDLE_SINK = 0.2;

export const OMEGA_MID_MIN = 0.55;
export const OMEGA_MID_MAX = 1.05;
export const BAND_WIDTH_MIN = 0.22;
export const BAND_WIDTH_MAX = 0.36;

export const SCORE_EXACT = 88;
export const SCORE_GOOD = 72;
export const SCORE_CLOSE = 55;
export const SCORE_WOBBLY = 32;
export const SCORE_FINE = SCORE_EXACT;

export const JUDGE_BALLOON_OFFSET = 70;

export const STORAGE_BEST = "rokuro-katachi:bestScore";
export const STORAGE_DAILY_PREFIX = "rokuro-katachi:daily:";
export const STORAGE_MUTED = "rokuro-katachi:muted";
export const SEED_PREFIX = "rokuro-katachi:";

export const CLAY_TABLE = [
  { clay: "soft", clayK: 1.18, wobbleK: 1.28, slumpK: 1.25 },
  { clay: "normal", clayK: 1.0, wobbleK: 1.0, slumpK: 1.0 },
  { clay: "firm", clayK: 0.82, wobbleK: 0.8, slumpK: 0.78 },
];

export const FAMILIES = ["wan", "yunomi", "hirabachi", "tsubo", "tokkuri", "hanaire", "kodaiwan"];

export const CLAY_LABELS = { soft: "やわらかめ", normal: "ふつう", firm: "硬め" };

export const GRADE_LABELS = {
  exact: "見本どおり",
  good: "よい形",
  close: "おしい",
  wobbly: "いびつ",
  early: "まだ早い",
};

export const GRADE_BALLOONS = {
  exact: "見本どおり！",
  good: "よい形",
  close: "おしい",
  wobbly: "いびつ",
  early: "まだ早い",
};

/** Share line uses the grade as-is; no 「の形」 suffix. */
export const GRADE_SHARE = {
  exact: "見本どおり",
  good: "よい形",
  close: "おしい",
  wobbly: "いびつ",
  early: "まだ早い",
};

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  return STORAGE_DAILY_PREFIX + dateJst;
}

export function gradeForScore(score) {
  const s = Number(score) || 0;
  if (s >= SCORE_EXACT) return "exact";
  if (s >= SCORE_GOOD) return "good";
  if (s >= SCORE_CLOSE) return "close";
  if (s >= SCORE_WOBBLY) return "wobbly";
  return "early";
}

export function clamp(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function spinWeight(r) {
  const x = Number(r) || 0;
  if (x <= SPIN_R0 || x >= SPIN_R3) return 0;
  if (x < SPIN_R1) return (x - SPIN_R0) / (SPIN_R1 - SPIN_R0);
  if (x <= SPIN_R2) return 1;
  return (SPIN_R3 - x) / (SPIN_R3 - SPIN_R2);
}

export function heightFromY(y) {
  return (PROFILE_BASE_Y - Number(y)) / PROFILE_H_SCALE;
}

export function yFromHeight(h) {
  return PROFILE_BASE_Y - Number(h) * PROFILE_H_SCALE;
}

export function radiusFromX(x) {
  return Math.max(0, Number(x) - PROFILE_AXIS_X);
}

export function xFromRadius(r) {
  return PROFILE_AXIS_X + Number(r);
}

/** Stick tip for a right-thumb position. */
export function toolTip(x, y) {
  return { x: Number(x) + TOOL_DX, y: Number(y) + TOOL_DY };
}

/** Thumb position that puts the stick tip at (x, y). */
export function thumbForTip(x, y) {
  return { x: Number(x) - TOOL_DX, y: Number(y) - TOOL_DY };
}

export function clayMaxRadius(rings) {
  let m = R_MIN;
  const list = rings || [];
  for (let i = 0; i < list.length; i++) {
    const r = Number(list[i]) || 0;
    if (r > m) m = r;
  }
  return m;
}

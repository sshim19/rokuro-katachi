/** tick(state, input, dt) → state. Place, throw, reveal, finish. No DOM. */

import {
  DAILY_LINE_TIME,
  FINISH_MIN,
  FIXED_DT,
  LUMP_H,
  MAX_DT,
  PLACE_TIME,
  REVEAL_TIME,
  SLUMP_COOLDOWN,
  THROW_TIME,
  clayMaxRadius,
  heightFromY,
  radiusFromX,
  toolTip,
} from "./constants.mjs";
import { dailyParams } from "./daily.mjs";
import {
  applyCollapse,
  idleSink,
  makeLump,
  scoreParts,
  slumpRate,
  stepProfile,
  volumeOf,
} from "./profile.mjs";
import { hashSeed } from "./rng.mjs";
import {
  bandMetrics,
  computeCentering,
  emptyLeft,
  liveOmegaBand,
  stepWobble,
  updateLeft,
} from "./wheel.mjs";

export { scoreParts, volumeOf, liveOmegaBand };

function cloneState(s) {
  return {
    ...s,
    params: { ...s.params, targetR: (s.params?.targetR || []).slice() },
    left: { ...s.left },
    right: s.right ? { ...s.right } : { prevX: null, prevY: null, pathLen: 0 },
    rings: (s.rings || []).slice(),
  };
}

/** right.prevX / prevY hold the last stick-tip position (not the thumb). */
function emptyRight() {
  return { prevX: null, prevY: null, pathLen: 0 };
}

function hands(input) {
  const leftOn = !!input?.left?.active;
  const rightOn = !!input?.right?.active;
  return {
    leftOn,
    rightOn,
    leftPos: leftOn ? { x: Number(input.left.x), y: Number(input.left.y) } : null,
    rightPos: rightOn ? { x: Number(input.right.x), y: Number(input.right.y) } : null,
  };
}

function applyLeft(s, input, dt, active) {
  const h = hands(input);
  const leftPos = active && h.leftOn ? h.leftPos : null;
  const prevOmega = s.left.omega;
  s.left = updateLeft(s.left, leftPos, dt, !!(active && h.leftOn));
  s.wheelAngle = (Number(s.wheelAngle) || 0) + (Number(s.left.omega) || 0) * 2 * Math.PI * dt;
  if (active && h.leftOn && (Math.abs(s.left.omega - prevOmega) > 1e-6 || s.left.prevTheta != null) && s.left.omega > 0.04) {
    s.hintLeft = false;
  }
}

function updateRightTracker(s, input, dt, active) {
  const h = hands(input);
  const right = s.right || emptyRight();
  if (!(active && h.rightOn)) {
    s.right = emptyRight();
    return { contacting: false, hWork: 0, rDes: 0, upward: false, pathLen: 0 };
  }
  // input.right is the thumb; the stick tip does the shaping.
  const tip = toolTip(h.rightPos.x, h.rightPos.y);
  const x = tip.x;
  const y = tip.y;
  const hWork = heightFromY(y);
  const rDes = radiusFromX(x);
  let pathLen = Number(right.pathLen) || 0;
  let upward = false;
  if (right.prevX != null && right.prevY != null) {
    const dx = x - right.prevX;
    const dy = y - right.prevY;
    pathLen += Math.hypot(dx, dy);
    const vy = dt > 0 ? dy / dt : 0;
    upward = vy < -5;
  }
  s.right = { prevX: x, prevY: y, pathLen };
  return { contacting: true, hWork, rDes, upward, pathLen };
}

function refreshFeel(s, input, dt, active) {
  const h = hands(input);
  const band = liveOmegaBand(s.params, s.H, s.rings);
  const metrics = bandMetrics(s.left.omega, band);
  s.inBand = metrics.inBand;
  s.centering = computeCentering({
    r: s.left.r,
    prevR: s.left.prevR,
    dt,
    omega: s.left.omega,
    rings: s.rings,
    active: !!(active && h.leftOn),
  });
  s.ePhase = (Number(s.ePhase) || 0) + (Number(s.left.omega) || 0) * 2 * Math.PI * Math.max(0, dt);
  return { band, metrics, leftOn: h.leftOn, rightOn: h.rightOn };
}

function updateBests(s) {
  if (s.score <= 0) return;
  if (s.score > s.bestScore) s.bestScore = s.score;
  if (s.score > s.todayBestScore) s.todayBestScore = s.score;
}

function canFinish(s) {
  return s.status === "playing" && s.phase === "throw" && s.throwT + 1e-9 >= FINISH_MIN;
}

function finalizeFinish(s) {
  const parts = scoreParts(s.rings, s.H, s.params.targetR, s.params.targetH, s.e);
  s.profileMatch = parts.profileMatch;
  s.centerScore = parts.centerScore;
  s.score = parts.score;
  s.grade = parts.grade;
  s.finishedAt = s.throwT;
  s.phase = "reveal";
  s.phaseT = 0;
  s.showDailyLine = false;
  updateBests(s);
}

function stepThrowPhysics(s, rightInfo, feel, dt, shapingAllowed) {
  const { metrics, band } = feel;
  const shaping = shapingAllowed && rightInfo.contacting && metrics.omegaFactor > 0 ? 1 : 0;
  if (shapingAllowed && rightInfo.contacting) {
    const shaped = stepProfile({
      rings: s.rings,
      H: s.H,
      volume: s.volume,
      dt,
      clayK: s.params.clayK,
      omegaFactor: metrics.omegaFactor,
      e: s.e,
      hWork: rightInfo.hWork,
      rDes: rightInfo.rDes,
      upward: rightInfo.upward,
      pathLen: rightInfo.pathLen,
      rngState: s.rngState,
    });
    s.rings = shaped.rings;
    s.H = shaped.H;
    s.rngState = shaped.rngState;
    if (shaped.moved) s.hintRight = false;
  } else if (s.params.clay === "soft") {
    const sunk = idleSink(s.rings, s.H, s.volume, dt, s.params.clay, s.left.omega);
    s.rings = sunk.rings;
    s.H = sunk.H;
  }

  s.e = stepWobble({
    e: s.e,
    dt,
    wobbleK: s.params.wobbleK,
    speedErr: metrics.speedErr,
    shaping,
    omega: s.left.omega,
    centering: s.centering,
    inBand: metrics.inBand,
  });

  if (s.slumpWait > 0) {
    s.slumpWait = Math.max(0, s.slumpWait - dt);
  } else {
    const rate = slumpRate({
      e: s.e,
      slumpK: s.params.slumpK,
      omega: s.left.omega,
      band,
      H: s.H,
      rings: s.rings,
    });
    if (rate > 0) s.slumpT += rate * dt;
    else s.slumpT = Math.max(0, s.slumpT - 0.15 * dt);
    if (s.slumpT >= 1) {
      const fallen = applyCollapse({
        rings: s.rings,
        H: s.H,
        volume: s.volume,
        e: s.e,
        rngState: s.rngState,
      });
      s.rings = fallen.rings;
      s.H = fallen.H;
      s.volume = fallen.volume;
      s.e = fallen.e;
      s.slumpT = 0;
      s.slumpWait = SLUMP_COOLDOWN;
      s.slumped = true;
    }
  }

  const live = scoreParts(s.rings, s.H, s.params.targetR, s.params.targetH, s.e);
  s.profileMatch = live.profileMatch;
  s.centerScore = live.centerScore;
}

function stepPhase(s, input, rightInfo, feel, dt, active) {
  if (s.status !== "playing") return;
  if (s.phase === "place") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= PLACE_TIME) {
      s.phaseT = Math.max(0, s.phaseT - PLACE_TIME);
      s.phase = "throw";
      s.throwT = 0;
      s.showDailyLine = true;
    }
    return;
  }
  if (s.phase === "throw") {
    stepThrowPhysics(s, rightInfo, feel, dt, active);
    s.throwT += dt;
    s.phaseT += dt;
    s.showDailyLine = s.throwT < DAILY_LINE_TIME;
    if (s.throwT + 1e-9 >= THROW_TIME) {
      s.throwT = THROW_TIME;
      finalizeFinish(s);
    } else if (input?.finish && canFinish(s)) {
      finalizeFinish(s);
    }
    return;
  }
  if (s.phase === "reveal") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= REVEAL_TIME) s.status = "over";
  }
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps clay / phases at 1/60 + remainder.
 * Gestures are applied once per call with the frame dt (positions are samples, not per-substep).
 * When landscape is false, throw / finish are ignored and time does not advance; ω decays.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  const rawDt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  if (!input?.landscape) {
    applyLeft(s, input, rawDt, false);
    s.right = emptyRight();
    refreshFeel(s, input, rawDt, false);
    return s;
  }
  s.clock = (Number(s.clock) || 0) + rawDt;
  applyLeft(s, input, rawDt, true);
  const rightInfo = updateRightTracker(s, input, rawDt, true);
  const feel = refreshFeel(s, input, rawDt, true);
  let left = rawDt;
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhase(s, input, rightInfo, feel, stepDt, true);
    left -= stepDt;
  }
  return s;
}

/**
 * Shared by 「仕上げ」 and the time limit. No-op before 18s, during place / reveal, or when not playing.
 * Landscape is enforced by tick; a direct call assumes the caller already checked orientation.
 */
export function finishNow(state) {
  const s = cloneState(state);
  if (canFinish(s)) finalizeFinish(s);
  return s;
}

/** Fresh playing state. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  const rng0 = hashSeed(seed);
  const built = dailyParams(rng0);
  const params = built.params;
  const lump = makeLump(volumeOf(params.targetR, params.targetH), LUMP_H);
  params.aspect0 = lump.H / Math.max(8, clayMaxRadius(lump.rings));
  const parts = scoreParts(lump.rings, lump.H, params.targetR, params.targetH, params.e0);
  return {
    status: "playing",
    phase: "place",
    seed,
    dateJst: dateJst ?? null,
    phaseT: 0,
    throwT: 0,
    clock: 0,
    rngState: built.rngState,
    params,
    left: emptyLeft(),
    right: emptyRight(),
    e: params.e0,
    ePhase: 0,
    centering: 0,
    inBand: 0,
    rings: lump.rings,
    H: lump.H,
    volume: lump.volume,
    slumpT: 0,
    slumpWait: 0,
    slumped: false,
    profileMatch: parts.profileMatch,
    centerScore: parts.centerScore,
    score: 0,
    grade: null,
    finishedAt: null,
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hintLeft: true,
    hintRight: true,
    showDailyLine: false,
    wheelAngle: 0,
  };
}

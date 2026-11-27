/**
 * 重ねの開示、吹き出し、水気、振れの残像。
 * エンジンは触らず、state の差分から演出を進める。
 */

import * as constants from "../engine/constants.mjs";
import { dailyCondition, formatScore, gradeCallout } from "./share.mjs";

export const JUDGE_BALLOON_OFFSET = constants.JUDGE_BALLOON_OFFSET ?? 70;
export const WHEEL_CX = constants.WHEEL_CX ?? 248;
export const WHEEL_CY = constants.WHEEL_CY ?? 236;
export const PROFILE_AXIS_X = constants.PROFILE_AXIS_X ?? constants.RIGHT_AXIS_X ?? 560;
export const PROFILE_BASE_Y = constants.PROFILE_BASE_Y ?? constants.RIGHT_BASE_Y ?? 348;
export const PROFILE_H_SCALE = constants.PROFILE_H_SCALE ?? constants.HEIGHT_SCALE ?? 1.15;

const SPRAY_CAP = 22;
const TRAIL_CAP = 6;
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
const WOBBLE_E = constants.WOBBLE_CALLOUT_E ?? 8;
const SETTLED_E = constants.SETTLED_E ?? 4;

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#f5f0e6").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(245, 240, 230, ${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function createFx() {
  return {
    clock: 0,
    wheelAngle: 0,
    spray: [],
    trails: [],
    floats: [],
    revealZoom: 1,
    placeT: 0,
    dailyAlpha: 0,
    statusAlpha: 0,
    statusText: "",
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.clock = 0;
  fx.wheelAngle = 0;
  fx.spray.length = 0;
  fx.trails.length = 0;
  fx.floats.length = 0;
  fx.revealZoom = 1;
  fx.placeT = 0;
  fx.dailyAlpha = 0;
  fx.statusAlpha = 0;
  fx.statusText = "";
  fx.prev = null;
}

function spawnBalloons(fx, state) {
  const grade = state?.grade || "early";
  const score = Math.max(0, Math.floor(Number(state?.score) || 0));
  fx.floats.length = 0;
  fx.floats.push({
    kind: "grade",
    text: gradeCallout(grade),
    age: 0,
    color: "#1c2430",
  });
  fx.floats.push({
    kind: "score",
    text: `${formatScore(score)}点`,
    age: 0,
    color: "#1c2430",
  });
}

function addSpray(fx, state, reduced) {
  const cap = reduced ? 8 : SPRAY_CAP;
  if (fx.spray.length >= cap) return;
  if (Math.random() > 0.55) return;
  const H = Number(state?.H) || 52;
  const handY = state?._handY;
  const x = PROFILE_AXIS_X + 18 + Math.random() * 36;
  const y =
    Number.isFinite(handY)
      ? handY
      : PROFILE_BASE_Y - (0.2 + Math.random() * 0.6) * H * PROFILE_H_SCALE;
  fx.spray.push({
    x,
    y,
    vx: 12 + Math.random() * 28,
    vy: -(18 + Math.random() * 30),
    r: 1.4 + Math.random() * 2.2,
    life: 0.35 + Math.random() * 0.35,
    max: 0.7,
  });
}

function statusFrom(state) {
  if (state?.status !== "playing" || state?.phase !== "throw") return "";
  const e = Number(state?.e) || 0;
  const inBand = Number(state?.inBand) || 0;
  if (e >= WOBBLE_E) return "振れている";
  if (e < SETTLED_E && inBand >= 0.99) return "おさまった";
  return "";
}

/**
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean, right?: object }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.max(0, Number(dt) || 0);
  fx.clock += t;

  const omega = Number(state?.left?.omega) || 0;
  if (Number.isFinite(state?.wheelAngle)) {
    fx.wheelAngle = Number(state.wheelAngle);
  } else if (state?.status === "playing") {
    fx.wheelAngle += omega * Math.PI * 2 * t;
  }

  const phase = state?.phase;
  const playing = state?.status === "playing";
  fx.placeT = phase === "place" && playing ? Number(state?.phaseT) || 0 : 0;

  const wantDaily = !!(playing && state?.showDailyLine);
  fx.dailyAlpha += ((wantDaily ? 1 : 0) - fx.dailyAlpha) * (1 - Math.exp(-t / 0.2));

  const nextStatus = statusFrom(state);
  if (nextStatus) fx.statusText = nextStatus;
  const wantStatus = nextStatus ? 1 : 0;
  // Clear immediately on reveal/end so おさまった does not sit under the grade balloon.
  if (!playing || phase === "reveal") {
    fx.statusAlpha = 0;
    if (!nextStatus) fx.statusText = "";
  } else {
    fx.statusAlpha += (wantStatus - fx.statusAlpha) * (1 - Math.exp(-t / 0.16));
    if (fx.statusAlpha < 0.02 && !nextStatus) fx.statusText = "";
  }

  const zoomTarget = playing && phase === "reveal" ? (reduced ? 1.04 : 1.1) : 1;
  fx.revealZoom += (zoomTarget - fx.revealZoom) * (1 - Math.exp(-t / (reduced ? 0.2 : 0.35)));

  const prevPhase = fx.prev?.phase;
  const prevStatus = fx.prev?.status;
  if (
    (prevPhase !== "reveal" && phase === "reveal") ||
    (prevStatus !== "over" && state?.status === "over" && fx.floats.length === 0)
  ) {
    spawnBalloons(fx, state);
  }

  // 水飛沫は右が引いているときだけ。描画側から right を渡す。
  const rightActive = !!(opts.right?.active);
  if (playing && phase === "throw" && rightActive && !reduced) {
    const rate = 14 + Math.min(10, omega * 8);
    const steps = Math.max(1, Math.round(rate * t));
    const handY = Number(opts.right?.y);
    const stamped = { ...state, _handY: handY };
    for (let i = 0; i < steps; i++) addSpray(fx, stamped, reduced);
  }

  for (let i = fx.spray.length - 1; i >= 0; i--) {
    const p = fx.spray[i];
    p.life -= t;
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.vy += 80 * t;
    p.vx *= Math.exp(-t / 0.5);
    if (p.life <= 0) fx.spray.splice(i, 1);
  }
  if (fx.spray.length > SPRAY_CAP) fx.spray.splice(0, fx.spray.length - SPRAY_CAP);

  const e = Number(state?.e) || 0;
  const ePhase = Number(state?.ePhase) || 0;
  if (playing && (phase === "throw" || phase === "place") && !reduced && (omega > 0.15 || e > 3)) {
    const gap = 0.05 + 0.04 * Math.min(1, e / 12);
    const last = fx.trails[fx.trails.length - 1];
    if (!last || fx.clock - last.at >= gap) {
      fx.trails.push({
        at: fx.clock,
        angle: fx.wheelAngle,
        e,
        ePhase,
        life: 0.22 + Math.min(0.18, e / 40),
        max: 0.4,
      });
    }
  } else if (reduced) {
    fx.trails.length = 0;
  }
  for (let i = fx.trails.length - 1; i >= 0; i--) {
    const tr = fx.trails[i];
    tr.life -= t;
    if (tr.life <= 0) fx.trails.splice(i, 1);
  }
  if (fx.trails.length > TRAIL_CAP) fx.trails.splice(0, fx.trails.length - TRAIL_CAP);

  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i];
    f.age = (Number(f.age) || 0) + t;
  }

  fx.prev = {
    status: state?.status,
    phase: state?.phase,
    grade: state?.grade,
    score: state?.score,
  };
}

export function revealZoom(fx, reduced) {
  if (!fx) return 1;
  const z = Number(fx.revealZoom) || 1;
  if (reduced) return Math.min(z, 1.04);
  return z;
}

export function overlayCenterY(state) {
  const H = Number(state?.H) || 52;
  const tH = Number(state?.params?.targetH) || H;
  const vis = Math.max(H, tH) * PROFILE_H_SCALE;
  return PROFILE_BASE_Y - vis / 2;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fx
 * @param {{ sx: Function, sy: Function, px: Function, reducedMotion?: boolean }} view
 * @param {object} [state]
 */
export function drawFx(ctx, fx, view, state) {
  if (!fx) return;
  const reduced = !!view.reducedMotion;
  const sx = (x) => view.sx(x);
  const sy = (y) => view.sy(y);
  const px = (w) => view.px(w);

  for (const p of fx.spray) {
    const u = Math.max(0, Math.min(1, p.life / (p.max || 1)));
    ctx.fillStyle = rgba("#d8ecec", 0.18 + 0.35 * u);
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y), px(p.r * (1 + (1 - u) * 0.4)), px(p.r * 1.3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fx.dailyAlpha > 0.04 && state?.showDailyLine !== false) {
    const text = dailyCondition(state?.params);
    const x = sx(WHEEL_CX);
    const y = sy(WHEEL_CY + 44);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.dailyAlpha));
    ctx.font = `700 ${Math.max(11, px(11))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = rgba("#f5f0e6", 0.9);
    const padX = 8;
    const padY = 4;
    const h = Math.max(16, px(14));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  if (fx.statusAlpha > 0.05 && fx.statusText) {
    const text = fx.statusText;
    const x = sx(WHEEL_CX);
    const y = sy(WHEEL_CY - 150);
    const pulse =
      reduced || text !== "おさまった"
        ? 1
        : 1 + 0.03 * Math.sin((Number(fx.clock) || 0) * Math.PI * 2 * 2.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.statusAlpha));
    ctx.font = `700 ${Math.max(13, px(14))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const padX = 9;
    const padY = 5;
    const h = Math.max(18, px(16));
    ctx.fillStyle = rgba("#f5f0e6", 0.96);
    ctx.strokeStyle = rgba("#1c2430", 0.16);
    ctx.lineWidth = Math.max(1, px(1));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  const cy = overlayCenterY(state);
  const bx = PROFILE_AXIS_X + 48;
  const by = cy - JUDGE_BALLOON_OFFSET;
  const showBalloons = state?.status === "playing" && state?.phase === "reveal";
  for (let i = 0; showBalloons && i < fx.floats.length; i++) {
    const f = fx.floats[i];
    const age = Number(f.age) || 0;
    let pop = 1;
    if (!reduced) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = Math.min(1, age / 0.08);
    const lift = reduced ? 0 : Math.min(8, age * 10);
    const row = f.kind === "grade" ? 0 : 22;
    const x = sx(bx);
    const y = sy(by + row) - px(lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = f.kind === "grade" ? Math.max(16, px(20)) : Math.max(13, px(15));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = rgba("#f5f0e6", 0.92);
    const padX = 8;
    const padY = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = f.color || "#1c2430";
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}

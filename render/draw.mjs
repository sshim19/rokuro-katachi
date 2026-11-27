/**
 * 工房・ろくろ・土・右の断面・見本の線・左右の域。844×390 論理座標。Y は下向き。
 * 画像アセットは使わない。定数の意味は書き換えない。
 */

import * as constants from "../engine/constants.mjs";
import { drawFx, revealZoom } from "./fx.mjs";

export const VIEW_W = constants.VIEW_W ?? 844;
export const VIEW_H = constants.VIEW_H ?? 390;

export const LEFT_X0 = constants.LEFT_X0 ?? 0;
export const LEFT_X1 = constants.LEFT_X1 ?? 400;
export const LEFT_Y0 = constants.LEFT_Y0 ?? 44;
export const LEFT_Y1 = constants.LEFT_Y1 ?? 390;

export const RIGHT_X0 = constants.RIGHT_X0 ?? 444;
export const RIGHT_X1 = constants.RIGHT_X1 ?? 844;
export const RIGHT_Y0 = constants.RIGHT_Y0 ?? 44;
export const RIGHT_Y1 = constants.RIGHT_Y1 ?? 390;
export const RIGHT_EDGE_SLACK = constants.RIGHT_EDGE_SLACK ?? 24;

export const WHEEL_CX = constants.WHEEL_CX ?? 248;
export const WHEEL_CY = constants.WHEEL_CY ?? 236;
export const WHEEL_R = constants.WHEEL_VISUAL_R ?? constants.WHEEL_R ?? 128;

export const PROFILE_AXIS_X = constants.PROFILE_AXIS_X ?? constants.RIGHT_AXIS_X ?? 560;
export const PROFILE_BASE_Y = constants.PROFILE_BASE_Y ?? constants.RIGHT_BASE_Y ?? 348;
export const PROFILE_H_SCALE = constants.PROFILE_H_SCALE ?? constants.HEIGHT_SCALE ?? 1.15;
export const RING_COUNT = constants.RING_COUNT ?? constants.RINGS ?? 24;

export const THUMB_GUIDE_R = 22; // 直径 44wu

// 右手は細い木のヘラを持つ。先端 = 親指 + (TOOL_DX, TOOL_DY)。エンジンと同じ値を使う。
export const TOOL_DX = constants.TOOL_DX ?? -76;
export const TOOL_DY = constants.TOOL_DY ?? -24;
export const TOOL_TAIL = constants.TOOL_TAIL ?? 22;
const TOOL_WOOD = "#c99a62";
const TOOL_WOOD_DARK = "#7c5530";
const TOOL_TIP = "#5b3d22";

const WALL_A = "#efe8dc";
const WALL_B = "#e4d9c8";
const BENCH_A = "#b08960";
const BENCH_B = "#9a7048";
const BENCH_C = "#7a5838";
const BASIN = "#4a4540";
const WHEEL = "#c4a070";
const WHEEL_LIGHT = "#d4b48a";
const WHEEL_DARK = "#a07c50";
const INK = "#1c2430";
const SAMPLE = "#2c2824";
const HUD_BG = "#f5f0e6";
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

const WHEEL_DISK_RY = 16;
const LEFT_BASE_Y = WHEEL_CY - WHEEL_DISK_RY;
const LEFT_H_SCALE = (LEFT_BASE_Y - 50) / 230;

const PLACE_TIME = constants.PLACE_TIME ?? constants.PLACE_DURATION ?? 1.4;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function clamp01(n) {
  return clamp(Number(n) || 0, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function u32(n) {
  return n >>> 0;
}

function hashSeed(state) {
  const s = String(state?.seed || state?.dateJst || "rokuro-katachi");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return u32(h);
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 高さに合わせて 844×390 を伸ばし、幅が足りなければ contain する。
 * 余った部分は同じ壁色で埋める。
 */
export function makeView(cssW, cssH) {
  let scale = cssH / VIEW_H;
  if (VIEW_W * scale > cssW + 0.5) scale = cssW / VIEW_W;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..844, 0..390, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

export function inLeftZone(x, y) {
  return x >= LEFT_X0 && x <= LEFT_X1 && y >= LEFT_Y0 && y <= LEFT_Y1;
}

export function inRightZone(x, y, slack = 0) {
  return (
    x >= RIGHT_X0 - slack &&
    x <= RIGHT_X1 + slack &&
    y >= RIGHT_Y0 - slack &&
    y <= RIGHT_Y1 + slack
  );
}

function clayColors(clay) {
  if (clay === "soft") {
    return { body: "#8a6a52", deep: "#6e5240", hi: "#b08a6a", wet: 0.42 };
  }
  if (clay === "firm") {
    return { body: "#6a4e3a", deep: "#4e3a2c", hi: "#86644c", wet: 0.12 };
  }
  return { body: "#7a5a44", deep: "#5a4234", hi: "#9a7558", wet: 0.26 };
}

function ringList(src, fallbackH = 52) {
  const n = RING_COUNT;
  if (Array.isArray(src) && src.length) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const at = t * (src.length - 1);
      const i0 = Math.floor(at);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const u = at - i0;
      const a = Number(src[i0]);
      const b = Number(src[i1]);
      const v = (Number.isFinite(a) ? a : 28) * (1 - u) + (Number.isFinite(b) ? b : 28) * u;
      out.push(Math.max(0, v));
    }
    return out;
  }
  const r = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    r.push(30 + 14 * (1 - t) * (1 - 0.3 * t));
  }
  return r;
}

function maxRing(rings) {
  let m = 8;
  for (const r of rings) if (r > m) m = r;
  return m;
}

function fillWall(ctx, view) {
  const g = ctx.createLinearGradient(0, view.sy(0), 0, view.sy(VIEW_H));
  g.addColorStop(0, WALL_A);
  g.addColorStop(0.55, WALL_B);
  g.addColorStop(1, WALL_B);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
}

function drawWindow(ctx, view) {
  const x = view.sx(86);
  const y = view.sy(8);
  const w = view.px(156);
  const h = view.px(86);
  ctx.save();
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, "#f7efe0");
  sky.addColorStop(1, "#ead9b8");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(BENCH_C, 0.55);
  ctx.lineWidth = Math.max(1.4, view.px(3));
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.5);
  ctx.lineTo(x + w, y + h * 0.5);
  ctx.stroke();
  const glow = ctx.createRadialGradient(x + w * 0.5, y + h * 0.7, view.px(4), x + w * 0.5, y + h, view.px(130));
  glow.addColorStop(0, "rgba(245, 232, 200, 0.18)");
  glow.addColorStop(1, "rgba(245, 232, 200, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - view.px(40), y, w + view.px(80), h + view.px(80));
  ctx.restore();
}

function drawBench(ctx, view) {
  const y = view.sy(304);
  const top = view.px(18);
  const g = ctx.createLinearGradient(0, y, 0, y + view.px(86));
  g.addColorStop(0, BENCH_A);
  g.addColorStop(0.18, BENCH_B);
  g.addColorStop(1, BENCH_C);
  ctx.fillStyle = g;
  ctx.fillRect(0, y, view.cssW, view.cssH - y + 2);
  ctx.fillStyle = rgba("#c4a070", 0.55);
  ctx.fillRect(0, y, view.cssW, top);
  ctx.fillStyle = rgba(BENCH_C, 0.45);
  ctx.fillRect(0, y + top - 1, view.cssW, 2);
  // 木目
  ctx.strokeStyle = rgba(BENCH_C, 0.18);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const yy = y + top + view.px(8 + i * 9);
    ctx.moveTo(0, yy);
    ctx.lineTo(view.cssW, yy + view.px((i % 2) * 2));
  }
  ctx.stroke();
}

function drawBasin(ctx, view) {
  const cx = view.sx(40);
  const cy = view.sy(300);
  const rx = view.px(28);
  const ry = view.px(10);
  ctx.save();
  ctx.fillStyle = BASIN;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy - view.px(5), rx * 0.82, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2e2c2a";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - view.px(4), cy - view.px(6), rx * 0.4, ry * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba("#7a9aaa", 0.28);
  ctx.fill();
  ctx.restore();
}

function drawRib(ctx, view) {
  // 右域側の作業台に、小さなへら（人物は出さない）
  const x = view.sx(408);
  const y = view.sy(298);
  ctx.save();
  ctx.fillStyle = "#c4a070";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + view.px(36), y - view.px(6));
  ctx.lineTo(x + view.px(38), y - view.px(2));
  ctx.lineTo(x + view.px(4), y + view.px(5));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BENCH_C;
  ctx.fillRect(x - view.px(14), y - view.px(2), view.px(16), view.px(5));
  ctx.restore();
}

function drawWheelStand(ctx, view) {
  const cx = view.sx(WHEEL_CX);
  const cy = view.sy(WHEEL_CY);
  ctx.save();
  ctx.strokeStyle = BENCH_C;
  ctx.lineWidth = Math.max(2.4, view.px(5));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, view.sy(332));
  ctx.stroke();
  ctx.strokeStyle = rgba(BENCH_C, 0.85);
  ctx.lineWidth = Math.max(2, view.px(3.4));
  ctx.beginPath();
  ctx.moveTo(cx, view.sy(300));
  ctx.lineTo(view.sx(WHEEL_CX - 46), view.sy(334));
  ctx.moveTo(cx, view.sy(300));
  ctx.lineTo(view.sx(WHEEL_CX + 46), view.sy(334));
  ctx.stroke();
  ctx.fillStyle = WHEEL_DARK;
  ctx.beginPath();
  ctx.ellipse(cx, view.sy(318), view.px(34), view.px(8), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlatter(ctx, view, angle) {
  const cx = view.sx(WHEEL_CX);
  const cy = view.sy(WHEEL_CY);
  const rx = view.px(WHEEL_R);
  const ry = view.px(WHEEL_DISK_RY);
  ctx.save();
  ctx.fillStyle = WHEEL_DARK;
  ctx.beginPath();
  ctx.ellipse(cx, cy + view.px(6), rx * 1.01, ry * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, WHEEL_LIGHT);
  g.addColorStop(0.45, WHEEL);
  g.addColorStop(1, WHEEL_DARK);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(BENCH_C, 0.45);
  ctx.lineWidth = Math.max(1, view.px(1.4));
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = rgba(BENCH_C, 0.28);
  ctx.lineWidth = Math.max(1, view.px(1.1));
  for (const k of [0.38, 0.62, 0.82]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(BENCH_C, 0.22);
  for (let i = 0; i < 8; i++) {
    const a = angle + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(cx, cy - view.px(2), rx * 0.18, ry * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(BENCH_C, 0.55);
  ctx.fill();
  ctx.restore();
}

function wobbleOffset(e, ePhase) {
  const amp = Math.max(0, Number(e) || 0);
  const ph = Number(ePhase) || 0;
  // Slight visual exaggeration so 振れている is readable, without changing engine e.
  return { x: amp * 1.4 * Math.cos(ph), lean: amp * Math.sin(ph) * 0.01 };
}

function pathSolid(ctx, view, rings, H, cx, baseY, scale, eX, lift) {
  const n = rings.length;
  const base = view.sy(baseY - lift);
  ctx.beginPath();
  ctx.moveTo(view.sx(cx + eX + Math.max(6, rings[0] * 0.7)), base);
  for (let i = 0; i < n; i++) {
    const h = ((i + 0.5) / n) * H;
    const y = view.sy(baseY - lift - h * scale);
    ctx.lineTo(view.sx(cx + eX + rings[i]), y);
  }
  const top = view.sy(baseY - lift - H * scale);
  const rim = rings[n - 1] || 8;
  ctx.lineTo(view.sx(cx + eX + Math.max(4, rim * 0.45)), top);
  ctx.lineTo(view.sx(cx + eX - Math.max(4, rim * 0.45)), top);
  for (let i = n - 1; i >= 0; i--) {
    const h = ((i + 0.5) / n) * H;
    const y = view.sy(baseY - lift - h * scale);
    ctx.lineTo(view.sx(cx + eX - rings[i]), y);
  }
  ctx.lineTo(view.sx(cx + eX - Math.max(6, rings[0] * 0.7)), base);
  ctx.closePath();
}

function drawClaySolid(ctx, view, rings, H, colors, e, ePhase, angle, lift, alpha, ghost) {
  const off = wobbleOffset(e, ePhase);
  const cx = WHEEL_CX;
  const baseY = LEFT_BASE_Y;
  const scale = LEFT_H_SCALE;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (off.lean && !ghost) {
    const py = view.sy(baseY - lift);
    ctx.translate(view.sx(cx), py);
    ctx.rotate(off.lean);
    ctx.translate(-view.sx(cx), -py);
  }
  pathSolid(ctx, view, rings, H, cx, baseY, scale, off.x, lift);
  if (ghost) {
    ctx.strokeStyle = rgba(SAMPLE, 0.62);
    ctx.lineWidth = Math.max(1.2, view.px(1.6));
    ctx.setLineDash([view.px(4), view.px(3.5)]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const g = ctx.createLinearGradient(
      view.sx(cx + off.x - 50),
      view.sy(baseY),
      view.sx(cx + off.x + 70),
      view.sy(baseY - H * scale),
    );
    g.addColorStop(0, colors.deep);
    g.addColorStop(0.42, colors.body);
    g.addColorStop(0.72, colors.hi);
    g.addColorStop(1, colors.body);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(colors.deep, 0.55);
    ctx.lineWidth = Math.max(1, view.px(1.1));
    ctx.stroke();

    // 湿りのハイライト
    if (colors.wet > 0.05) {
      ctx.save();
      pathSolid(ctx, view, rings, H, cx, baseY, scale, off.x, lift);
      ctx.clip();
      const hg = ctx.createLinearGradient(
        view.sx(cx + off.x - 20),
        view.sy(baseY - H * scale * 0.7),
        view.sx(cx + off.x + 10),
        view.sy(baseY - H * scale * 0.15),
      );
      hg.addColorStop(0, rgba("#efe4d4", colors.wet * 0.55));
      hg.addColorStop(1, rgba("#efe4d4", 0));
      ctx.fillStyle = hg;
      ctx.fillRect(view.sx(cx - 120), view.sy(baseY - H * scale - 10), view.px(240), view.px(H * scale + 20));
      ctx.restore();
    }

    // 回転のリング（軽い）
    ctx.strokeStyle = rgba(colors.deep, 0.18);
    ctx.lineWidth = Math.max(0.8, view.px(0.9));
    const n = rings.length;
    for (let i = 2; i < n; i += 3) {
      const h = ((i + 0.5) / n) * H;
      const y = view.sy(baseY - lift - h * scale);
      const r = rings[i];
      ctx.beginPath();
      ctx.ellipse(view.sx(cx + off.x), y, view.px(r), view.px(Math.max(2.2, r * 0.08)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawProfileFill(ctx, view, rings, H, colors) {
  const n = rings.length;
  const axis = PROFILE_AXIS_X;
  const base = PROFILE_BASE_Y;
  const sc = PROFILE_H_SCALE;
  ctx.beginPath();
  ctx.moveTo(view.sx(axis), view.sy(base));
  for (let i = 0; i < n; i++) {
    const h = ((i + 0.5) / n) * H;
    ctx.lineTo(view.sx(axis + rings[i]), view.sy(base - h * sc));
  }
  ctx.lineTo(view.sx(axis + (rings[n - 1] || 8)), view.sy(base - H * sc));
  ctx.lineTo(view.sx(axis), view.sy(base - H * sc));
  ctx.closePath();
  const g = ctx.createLinearGradient(view.sx(axis), view.sy(base), view.sx(axis + 90), view.sy(base - H * sc));
  g.addColorStop(0, colors.deep);
  g.addColorStop(0.55, colors.body);
  g.addColorStop(1, colors.hi);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(colors.deep, 0.5);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.stroke();
}

function drawProfileLine(ctx, view, rings, H, alpha) {
  if (!rings || !rings.length || !(H > 0)) return;
  const n = rings.length;
  const axis = PROFILE_AXIS_X;
  const base = PROFILE_BASE_Y;
  const sc = PROFILE_H_SCALE;
  ctx.save();
  ctx.strokeStyle = rgba(SAMPLE, alpha);
  ctx.lineWidth = Math.max(1.8, view.px(2.3));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([view.px(5), view.px(3.5)]);
  ctx.beginPath();
  ctx.moveTo(view.sx(axis), view.sy(base));
  for (let i = 0; i < n; i++) {
    const h = ((i + 0.5) / n) * H;
    const x = view.sx(axis + rings[i]);
    const y = view.sy(base - h * sc);
    if (i === 0) ctx.lineTo(x, view.sy(base));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(view.sx(axis + (rings[n - 1] || 0)), view.sy(base - H * sc));
  ctx.lineTo(view.sx(axis), view.sy(base - H * sc));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSectionBoard(ctx, view) {
  const x = view.sx(RIGHT_X0 + 4);
  const y = view.sy(RIGHT_Y0 + 4);
  const w = view.px(RIGHT_X1 - RIGHT_X0 - 10);
  const h = view.px(RIGHT_Y1 - RIGHT_Y0 - 10);
  ctx.save();
  ctx.fillStyle = rgba("#f3eadc", 0.35);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(BENCH_C, 0.16);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.strokeRect(x, y, w, h);
  // 軸と底
  ctx.strokeStyle = rgba(INK, 0.22);
  ctx.setLineDash([view.px(3), view.px(3)]);
  ctx.beginPath();
  ctx.moveTo(view.sx(PROFILE_AXIS_X), view.sy(RIGHT_Y0 + 10));
  ctx.lineTo(view.sx(PROFILE_AXIS_X), view.sy(PROFILE_BASE_Y));
  ctx.moveTo(view.sx(PROFILE_AXIS_X), view.sy(PROFILE_BASE_Y));
  ctx.lineTo(view.sx(RIGHT_X1 - 16), view.sy(PROFILE_BASE_Y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSampleInset(ctx, view, rings, H) {
  if (!rings || !rings.length || !(H > 0)) return;
  const boxX = 742;
  const boxY = 54;
  const boxW = 86;
  const boxH = 96;
  ctx.save();
  ctx.fillStyle = rgba(HUD_BG, 0.82);
  ctx.strokeStyle = rgba(BENCH_C, 0.35);
  ctx.lineWidth = Math.max(1, view.px(1));
  const x = view.sx(boxX);
  const y = view.sy(boxY);
  const w = view.px(boxW);
  const h = view.px(boxH);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 5);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = rgba(INK, 0.78);
  ctx.font = `700 ${Math.max(10, view.px(10))}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("見本", view.sx(boxX + boxW / 2), view.sy(boxY + 4));

  const maxR = Math.max(20, maxRing(rings));
  const scale = Math.min((boxH - 26) / Math.max(H, 40), ((boxW / 2) - 10) / maxR);
  const cx = boxX + boxW / 2;
  const base = boxY + boxH - 8;
  const n = rings.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const hh = ((i + 0.5) / n) * H;
    const px = view.sx(cx + rings[i] * scale);
    const py = view.sy(base - hh * scale);
    if (i === 0) ctx.moveTo(px, view.sy(base));
    ctx.lineTo(px, py);
  }
  ctx.lineTo(view.sx(cx + (rings[n - 1] || 0) * scale), view.sy(base - H * scale));
  ctx.lineTo(view.sx(cx - (rings[n - 1] || 0) * scale), view.sy(base - H * scale));
  for (let i = n - 1; i >= 0; i--) {
    const hh = ((i + 0.5) / n) * H;
    ctx.lineTo(view.sx(cx - rings[i] * scale), view.sy(base - hh * scale));
  }
  ctx.closePath();
  ctx.strokeStyle = rgba(SAMPLE, 0.7);
  ctx.lineWidth = Math.max(1.1, view.px(1.3));
  ctx.stroke();
  ctx.restore();
}

function leftThumbPos(left, rings) {
  const clayR = maxRing(rings);
  const minR = clayR + THUMB_GUIDE_R + 2;
  const maxR = Math.max(minR, WHEEL_R * 0.92);
  let ang;
  let r;
  let active = false;
  if (left?.active && Number.isFinite(left.x) && Number.isFinite(left.y)) {
    const dx = left.x - WHEEL_CX;
    const dy = left.y - WHEEL_CY;
    const d = Math.hypot(dx, dy) || 1;
    ang = Math.atan2(dy, dx);
    r = clamp(d, minR, maxR);
    active = true;
  } else {
    ang = 2.55;
    r = clamp((minR + Math.min(maxR, WHEEL_R * 0.92)) / 2, 70, 110);
  }
  // The platter is a flat ellipse; keep the guide on the rim, not on the stand.
  const ry = WHEEL_DISK_RY * (r / WHEEL_R) + 8;
  return { x: WHEEL_CX + Math.cos(ang) * r, y: WHEEL_CY + Math.sin(ang) * ry, active };
}

function rightThumbPos(right, rings, H) {
  if (right?.active && Number.isFinite(right.x) && Number.isFinite(right.y)) {
    return {
      x: clamp(right.x, RIGHT_X0 + 8, RIGHT_X1 - 8),
      y: clamp(right.y, RIGHT_Y0 + 8, VIEW_H - 4),
      active: true,
    };
  }
  // 待機中: 先端が壁の中ほどの少し外に来る位置に親指の目安を置く。
  const midR = rings[Math.floor(rings.length * 0.55)] || 36;
  const midH = (Number(H) || 52) * 0.5;
  return {
    x: PROFILE_AXIS_X + midR + 14 - TOOL_DX,
    y: PROFILE_BASE_Y - midH * PROFILE_H_SCALE - TOOL_DY,
    active: false,
  };
}

/** 親指から左上へ伸びる細い木のヘラ。持ち手は親指の後ろへ少し出し、先端を濃く細くする。 */
function drawStick(ctx, view, thumb, active, hint) {
  const tipX = thumb.x + TOOL_DX;
  const tipY = thumb.y + TOOL_DY;
  const len = Math.hypot(TOOL_DX, TOOL_DY) || 1;
  const ux = TOOL_DX / len;
  const uy = TOOL_DY / len;
  const nx = -uy;
  const ny = ux;
  const tailX = thumb.x - ux * TOOL_TAIL;
  const tailY = thumb.y - uy * TOOL_TAIL;
  const alpha = active ? 1 : hint ? 0.7 : 0.45;
  const wTail = 3.4;
  const wTip = 1.3;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 影
  ctx.fillStyle = rgba("#2a1d12", 0.18);
  ctx.beginPath();
  ctx.moveTo(view.sx(tailX + nx * wTail + 2), view.sy(tailY + ny * wTail + 3));
  ctx.lineTo(view.sx(tipX + nx * wTip + 2), view.sy(tipY + ny * wTip + 3));
  ctx.lineTo(view.sx(tipX - nx * wTip + 2), view.sy(tipY - ny * wTip + 3));
  ctx.lineTo(view.sx(tailX - nx * wTail + 2), view.sy(tailY - ny * wTail + 3));
  ctx.closePath();
  ctx.fill();
  // 木の柄（先へ向かって細くなる）
  const grad = ctx.createLinearGradient(
    view.sx(tailX + nx * wTail),
    view.sy(tailY + ny * wTail),
    view.sx(tailX - nx * wTail),
    view.sy(tailY - ny * wTail),
  );
  grad.addColorStop(0, "#e2bd8a");
  grad.addColorStop(0.5, TOOL_WOOD);
  grad.addColorStop(1, "#a37444");
  ctx.fillStyle = grad;
  ctx.strokeStyle = rgba(TOOL_WOOD_DARK, 0.9);
  ctx.lineWidth = Math.max(1, view.px(0.9));
  ctx.beginPath();
  ctx.moveTo(view.sx(tailX + nx * wTail), view.sy(tailY + ny * wTail));
  ctx.lineTo(view.sx(tipX + nx * wTip), view.sy(tipY + ny * wTip));
  ctx.lineTo(view.sx(tipX - nx * wTip), view.sy(tipY - ny * wTip));
  ctx.lineTo(view.sx(tailX - nx * wTail), view.sy(tailY - ny * wTail));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 先端の削り面
  const edge = 12;
  const ex = tipX - ux * edge;
  const ey = tipY - uy * edge;
  const wEdge = wTip + (wTail - wTip) * (edge / (len + TOOL_TAIL));
  ctx.fillStyle = TOOL_TIP;
  ctx.beginPath();
  ctx.moveTo(view.sx(ex + nx * wEdge), view.sy(ey + ny * wEdge));
  ctx.lineTo(view.sx(tipX + nx * wTip), view.sy(tipY + ny * wTip));
  ctx.lineTo(view.sx(tipX - nx * wTip), view.sy(tipY - ny * wTip));
  ctx.lineTo(view.sx(ex - nx * wEdge), view.sy(ey - ny * wEdge));
  ctx.closePath();
  ctx.fill();
  // 当たり点
  ctx.beginPath();
  ctx.arc(view.sx(tipX), view.sy(tipY), view.px(active ? 3.2 : 2.6), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#fff6e6", active ? 0.95 : 0.7);
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, view.px(1.4));
  ctx.strokeStyle = rgba(INK, active ? 0.85 : 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawThumbGuide(ctx, view, x, y, active, hint) {
  const r = view.px(THUMB_GUIDE_R);
  const cx = view.sx(x);
  const cy = view.sy(y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, active ? 0.42 : hint ? 0.34 : 0.2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, active ? 0.64 : hint ? 0.52 : 0.34);
  ctx.lineWidth = Math.max(1.5, view.px(1.8));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = rgba(INK, active ? 0.36 : 0.2);
  ctx.fill();
  ctx.restore();
}

function placeLift(state, fx) {
  if (state?.status !== "playing" || state?.phase !== "place") return 0;
  const t = Number(fx?.placeT ?? state?.phaseT) || 0;
  const u = clamp01(t / PLACE_TIME);
  const ease = 1 - Math.pow(1 - u, 3);
  return (1 - ease) * 46;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean, fx?: object, left?: object, right?: object }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const base = makeView(cssW, cssH);
  const reduced = !!opts.reducedMotion;
  const fx = opts.fx;
  const zoom = revealZoom(fx, reduced);
  const view =
    zoom === 1
      ? base
      : {
          ...base,
          sx(x) {
            const focus = PROFILE_AXIS_X + 40;
            return base.sx(focus + (x - focus) * zoom);
          },
          sy(y) {
            const focus = overlayFocusY(state);
            return base.sy(focus + (y - focus) * zoom);
          },
          px(wu) {
            return base.px(wu * zoom);
          },
        };

  fillWall(ctx, base);
  drawWindow(ctx, view);
  drawBench(ctx, view);
  drawBasin(ctx, view);
  drawRib(ctx, view);
  drawWheelStand(ctx, view);

  const rings = ringList(state?.rings);
  const H = Math.max(8, Number(state?.H) || 52);
  const targetR = ringList(state?.params?.targetR, Number(state?.params?.targetH) || H);
  const targetH = Math.max(8, Number(state?.params?.targetH) || H);
  const colors = clayColors(state?.params?.clay);
  const angle = Number(fx?.wheelAngle) || Number(state?.wheelAngle) || 0;
  const lift = placeLift(state, fx);
  const e = Number(state?.e) || 0;
  const ePhase = Number(state?.ePhase) || 0;

  if (fx?.trails?.length && !reduced) {
    for (const tr of fx.trails) {
      const u = Math.max(0, Math.min(1, tr.life / (tr.max || 0.4)));
      drawClaySolid(ctx, view, rings, H, colors, tr.e, tr.ePhase, tr.angle, lift, 0.08 + 0.1 * u, false);
    }
  }

  drawPlatter(ctx, view, angle);
  // 見本のゴーストは土の下に薄く
  if (state?.params?.targetR) {
    drawClaySolid(ctx, view, targetR, targetH, colors, 0, 0, 0, 0, 0.9, true);
  }
  drawClaySolid(ctx, view, rings, H, colors, e, ePhase, angle, lift, 1, false);

  drawSectionBoard(ctx, view);
  drawProfileFill(ctx, view, rings, H, colors);

  const leftPos = leftThumbPos(opts.left, rings);
  const rightPos = rightThumbPos(opts.right, rings, H);
  const showGuides =
    state?.status === "playing" && (state?.phase === "place" || state?.phase === "throw");
  if (showGuides) {
    drawThumbGuide(ctx, view, leftPos.x, leftPos.y, leftPos.active, !!state?.hintLeft);
    drawThumbGuide(ctx, view, rightPos.x, rightPos.y, rightPos.active, !!state?.hintRight);
  }

  // 見本の線は指の上に描き、途切れないようにする
  drawProfileLine(ctx, view, targetR, targetH, 0.78);
  // ヘラは見本の線のさらに上。先端と当たりが常に見える。
  if (showGuides) drawStick(ctx, view, rightPos, rightPos.active, !!state?.hintRight);
  drawSampleInset(ctx, view, targetR, targetH);

  drawFx(ctx, fx, { ...view, reducedMotion: reduced }, state);
}

function overlayFocusY(state) {
  const H = Number(state?.H) || 52;
  const tH = Number(state?.params?.targetH) || H;
  const vis = Math.max(H, tH) * PROFILE_H_SCALE;
  return PROFILE_BASE_Y - vis / 2;
}

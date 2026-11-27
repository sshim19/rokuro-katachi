/** ろくろの形: 左手は皿のまわりをなぞり、右手は棒の先で上下に削る。 */
import * as C from "../engine/constants.mjs";
import {
  drawTravelGuide,
  guideNow,
  pathCircle,
  pathLine,
  prefersReducedMotion,
} from "./motion-guide.mjs";

const WHEEL_CX = C.WHEEL_CX ?? 248;
const WHEEL_CY = C.WHEEL_CY ?? 236;
const WHEEL_R = C.WHEEL_VISUAL_R ?? C.WHEEL_R ?? 128;
const PROFILE_AXIS_X = C.PROFILE_AXIS_X ?? C.RIGHT_AXIS_X ?? 560;
const PROFILE_BASE_Y = C.PROFILE_BASE_Y ?? C.RIGHT_BASE_Y ?? 348;
const PROFILE_H_SCALE = C.PROFILE_H_SCALE ?? C.HEIGHT_SCALE ?? 1.15;
const TOOL_DX = C.TOOL_DX ?? -76;
const TOOL_DY = C.TOOL_DY ?? -24;
const DISK_RY = 16;

export function drawMotionGuides(ctx, view, state, rings, H) {
  if (state?.status !== "playing") return;
  if (state.phase !== "place" && state.phase !== "throw") return;
  const reduced = prefersReducedMotion();
  const t = guideNow();
  if (state.hintLeft !== false) {
    const r = 96;
    const ry = DISK_RY * (r / WHEEL_R) + 8;
    drawTravelGuide(ctx, view, pathCircle(WHEEL_CX, WHEEL_CY, r, ry, 56, 0.2, Math.PI * 2), t, {
      period: 2.6,
      loop: "cycle",
      reduced,
      alpha: 0.48,
    });
  }
  if (state.hintRight !== false) {
    const midR = Number(rings?.[Math.floor((rings?.length || 1) * 0.55)]) || 36;
    const height = Number(H) || 52;
    const tipX = PROFILE_AXIS_X + midR + 8;
    const y0 = PROFILE_BASE_Y - height * 0.18 * PROFILE_H_SCALE;
    const y1 = PROFILE_BASE_Y - height * 0.82 * PROFILE_H_SCALE;
    const pts = pathLine(tipX - TOOL_DX, y0 - TOOL_DY, tipX - TOOL_DX, y1 - TOOL_DY, 18);
    drawTravelGuide(ctx, view, pts, t, { period: 2.4, loop: "pingpong", reduced, alpha: 0.46 });
  }
}

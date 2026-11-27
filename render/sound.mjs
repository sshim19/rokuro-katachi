/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から鳴らす音を決める。工房らしい、落ち着いた音にする。
 */

import * as constants from "../engine/constants.mjs";

export const MUTE_KEY = constants.STORAGE_MUTED ?? "rokuro-katachi:muted";
const MASTER_GAIN = 0.36;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

function snapshot(state) {
  return {
    status: state?.status || "title",
    phase: state?.phase || "place",
    e: Number(state?.e) || 0,
    omega: Number(state?.left?.omega) || 0,
    slumped: !!state?.slumped,
    rightActive: !!state?.right?.active,
    grade: state?.grade ?? null,
    score: Math.max(0, Math.floor(Number(state?.score) || 0)),
  };
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき単発の音を決める。純関数。
 * @returns {{ type: "place"|"wobble"|"slump"|"reveal", grade?: string, amount?: number } | null}
 */
export function soundEvent(prev, state) {
  if (!state) return null;
  const now = snapshot(state);
  const before = prev || { status: "idle", phase: "none", e: 0, slumped: false };
  if (
    now.status === "playing" &&
    now.phase === "place" &&
    (before.status !== "playing" || before.phase !== "place")
  ) {
    return { type: "place" };
  }
  if (before.phase !== "reveal" && now.phase === "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (before.status !== "over" && now.status === "over" && before.phase !== "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (!before.slumped && now.slumped) {
    return { type: "slump" };
  }
  if (
    now.status === "playing" &&
    now.phase === "throw" &&
    now.e > (Number(before.e) || 0) + 0.45
  ) {
    return { type: "wobble", amount: now.e - (Number(before.e) || 0) };
  }
  return null;
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
    humOsc: null,
    humOsc2: null,
    humGain: null,
    scrapeSrc: null,
    scrapeFilter: null,
    scrapeGain: null,
    lastWobbleAt: 0,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
  sfx.lastWobbleAt = 0;
  stopLoops(sfx, true);
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.92 + white * 0.08;
    data[i] = last * 2.2;
  }
  sfx.noiseBuf = buf;
  return buf;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function playNoise(sfx, dest, { t0, dur, peak, attack = 0.008, freq = 1200, type = "lowpass", q = 0.7, endFreq }) {
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** 土が盤に着く、短い柔らかい音。 */
function playPlace(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.01;
  playNoise(sfx, dest, {
    t0,
    dur: 0.22,
    peak: 0.09,
    attack: 0.012,
    freq: 320,
    type: "lowpass",
    q: 0.7,
    endFreq: 120,
  });
  playTone(ctx, dest, {
    freq: 118,
    endFreq: 72,
    type: "sine",
    t0,
    dur: 0.28,
    peak: 0.08,
    attack: 0.01,
  });
}

/** 振れが増えるとき。少しだけ周期のずれた、低い揺れ。 */
function playWobble(sfx, ev) {
  const now = sfx.ctx.currentTime;
  if (now - (sfx.lastWobbleAt || 0) < 0.32) return;
  sfx.lastWobbleAt = now;
  const amount = Math.max(0.3, Math.min(2.2, Number(ev?.amount) || 0.5));
  const peak = 0.03 + Math.min(0.05, amount * 0.02);
  playTone(sfx.ctx, sfx.master, {
    freq: 86,
    endFreq: 70,
    type: "sine",
    t0: now + 0.002,
    dur: 0.22,
    peak,
    attack: 0.02,
  });
  playTone(sfx.ctx, sfx.master, {
    freq: 93,
    endFreq: 76,
    type: "sine",
    t0: now + 0.01,
    dur: 0.24,
    peak: peak * 0.7,
    attack: 0.025,
  });
}

/** 短い、湿った崩れ。 */
function playSlump(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playNoise(sfx, dest, {
    t0,
    dur: 0.28,
    peak: 0.12,
    attack: 0.016,
    freq: 380,
    type: "lowpass",
    q: 0.6,
    endFreq: 90,
  });
  playTone(ctx, dest, {
    freq: 110,
    endFreq: 58,
    type: "triangle",
    t0,
    dur: 0.26,
    peak: 0.06,
    attack: 0.02,
  });
}

/** ろくろが減速して盤を置く音のあと、等級に応じた穏やかな余韻。 */
function playReveal(sfx, ev) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.004;
  playTone(ctx, dest, {
    freq: 160,
    endFreq: 88,
    type: "sine",
    t0,
    dur: 0.28,
    peak: 0.09,
    attack: 0.01,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.12,
    peak: 0.05,
    attack: 0.006,
    freq: 520,
    type: "lowpass",
    q: 0.6,
    endFreq: 160,
  });

  const grade = ev?.grade || "early";
  if (grade === "exact" || grade === "good") {
    const root = grade === "exact" ? 698 : 523;
    playTone(ctx, dest, {
      freq: root,
      type: "sine",
      t0: t0 + 0.12,
      dur: 0.46,
      peak: 0.09,
      attack: 0.02,
    });
    playTone(ctx, dest, {
      freq: root * 1.5,
      type: "sine",
      t0: t0 + 0.18,
      dur: 0.54,
      peak: 0.05,
      attack: 0.03,
    });
    if (grade === "exact") {
      playTone(ctx, dest, {
        freq: root * 2,
        type: "sine",
        t0: t0 + 0.24,
        dur: 0.5,
        peak: 0.035,
        attack: 0.04,
      });
    }
  } else if (grade === "close") {
    playTone(ctx, dest, {
      freq: 294,
      type: "sine",
      t0: t0 + 0.1,
      dur: 0.3,
      peak: 0.06,
      attack: 0.02,
    });
  } else {
    playNoise(sfx, dest, {
      t0: t0 + 0.08,
      dur: 0.11,
      peak: 0.045,
      attack: 0.01,
      freq: 400,
      type: "bandpass",
      q: 0.7,
      endFreq: 160,
    });
    playTone(ctx, dest, {
      freq: 150,
      endFreq: 90,
      type: "sine",
      t0: t0 + 0.08,
      dur: 0.13,
      peak: 0.04,
      attack: 0.012,
    });
  }
}

function ensureLoops(sfx) {
  if (!sfx.ctx || !sfx.master) return;
  if (sfx.humOsc) return;
  const ctx = sfx.ctx;

  const hum = ctx.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 62;
  const hum2 = ctx.createOscillator();
  hum2.type = "triangle";
  hum2.frequency.value = 93;
  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  hum.connect(humGain);
  hum2.connect(humGain);
  humGain.connect(sfx.master);
  hum.start();
  hum2.start();
  sfx.humOsc = hum;
  sfx.humOsc2 = hum2;
  sfx.humGain = humGain;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sfx.master);
  src.start();
  sfx.scrapeSrc = src;
  sfx.scrapeFilter = filter;
  sfx.scrapeGain = gain;
}

function stopLoops(sfx, hard = false) {
  if (!sfx) return;
  const t = sfx.ctx?.currentTime ?? 0;
  if (sfx.humGain) {
    try {
      sfx.humGain.gain.cancelScheduledValues(t);
      sfx.humGain.gain.setTargetAtTime(0, t, 0.06);
    } catch {
      /* ignore */
    }
  }
  if (sfx.scrapeGain) {
    try {
      sfx.scrapeGain.gain.cancelScheduledValues(t);
      sfx.scrapeGain.gain.setTargetAtTime(0, t, 0.05);
    } catch {
      /* ignore */
    }
  }
  if (!hard) return;
  try {
    sfx.humOsc?.stop();
    sfx.humOsc2?.stop();
    sfx.humOsc?.disconnect();
    sfx.humOsc2?.disconnect();
    sfx.humGain?.disconnect();
  } catch {
    /* already gone */
  }
  try {
    sfx.scrapeSrc?.stop();
    sfx.scrapeSrc?.disconnect();
    sfx.scrapeFilter?.disconnect();
    sfx.scrapeGain?.disconnect();
  } catch {
    /* already gone */
  }
  sfx.humOsc = null;
  sfx.humOsc2 = null;
  sfx.humGain = null;
  sfx.scrapeSrc = null;
  sfx.scrapeFilter = null;
  sfx.scrapeGain = null;
}

function syncLoops(sfx, state, opts = {}) {
  if (!sfx.ctx || sfx.muted) {
    if (sfx.humGain) stopLoops(sfx, false);
    return;
  }
  const playing = state?.status === "playing" && (state?.phase === "place" || state?.phase === "throw");
  const omega = Math.max(0, Number(state?.left?.omega) || 0);
  // ヘラの先が土に当たっているときだけ、湿った削り音を乗せる。
  const rightOn = !!(opts.contact ?? state?.right?.active) && state?.phase === "throw";
  if (!playing || omega < 0.04) {
    if (sfx.humGain) {
      const t = sfx.ctx.currentTime;
      sfx.humGain.gain.setTargetAtTime(0, t, 0.1);
      if (sfx.scrapeGain) sfx.scrapeGain.gain.setTargetAtTime(0, t, 0.08);
    }
    return;
  }
  ensureLoops(sfx);
  const t = sfx.ctx.currentTime;
  const hum = Math.min(0.07, 0.012 + omega * 0.045);
  sfx.humGain.gain.setTargetAtTime(hum, t, 0.1);
  const f = 48 + Math.min(70, omega * 42);
  sfx.humOsc.frequency.setTargetAtTime(f, t, 0.12);
  sfx.humOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.14);
  const scrape = rightOn ? 0.018 + Math.min(0.04, omega * 0.03) : 0;
  sfx.scrapeGain.gain.setTargetAtTime(scrape, t, 0.08);
  sfx.scrapeFilter.frequency.setTargetAtTime(700 + Math.min(900, omega * 400), t, 0.12);
}

/**
 * state の差分を見て効果音を鳴らす。成形中のハミングはループで追従する。
 * @param {object} sfx
 * @param {object} state
 * @param {{ contact?: boolean }} [opts]
 */
export function syncSound(sfx, state, opts = {}) {
  if (!sfx) return null;
  const ev = soundEvent(sfx.prev, state);
  sfx.prev = snapshot(state);
  if (sfx.ctx && !sfx.muted) {
    try {
      syncLoops(sfx, state, opts);
      if (ev?.type === "place") playPlace(sfx);
      else if (ev?.type === "wobble") playWobble(sfx, ev);
      else if (ev?.type === "slump") playSlump(sfx);
      else if (ev?.type === "reveal") {
        stopLoops(sfx, false);
        playReveal(sfx, ev);
      }
    } catch {
      /* audio graph failed; ignore */
    }
  } else if (ev?.type === "reveal") {
    stopLoops(sfx, false);
  }
  return ev;
}

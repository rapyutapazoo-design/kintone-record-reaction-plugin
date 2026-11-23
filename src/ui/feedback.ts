// 音（Web Audio）と振動（navigator.vibrate）の層。設定がオフのときは何もしない。
// 「動きを減らす」設定の影響は受けない（設定どおりに動く）。

import type { Effects } from "../lib/effects";

export interface Feedback {
  clickDown(): void;
  clickUp(): void;
  chime(): void;
  buzz(): void;
  haptic(ms?: number): void;
}

type AudioCtor = new () => AudioContext;

export function createFeedback(effects: Effects): Feedback {
  let audio: AudioContext | null = null;

  function context(): AudioContext | null {
    if (audio) return audio;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
    return audio;
  }

  function tone(freqFrom: number, freqTo: number, peak: number, len: number, type: OscillatorType = "triangle", at = 0): void {
    if (!effects.sound) return;
    try {
      const ctx = context();
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freqFrom, t);
      o.frequency.exponentialRampToValueAtTime(freqTo, t + len * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + len + 0.02);
    } catch {
      // 音が出せない環境では何もしない。
    }
  }

  return {
    clickDown() {
      if (!effects.sound) return;
      try {
        // iOS ではユーザー操作（pointerdown）の中でしか AudioContext を開始できない。
        const ctx = context();
        if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      } catch {
        // 無視
      }
      tone(2400, 900, 0.16, 0.035);
    },
    clickUp() {
      tone(1500, 700, 0.07, 0.04);
    },
    chime() {
      tone(880, 880, 0.09, 0.12, "sine");
      tone(1320, 1320, 0.08, 0.18, "sine", 0.08);
    },
    buzz() {
      tone(220, 180, 0.08, 0.12, "square");
    },
    haptic(ms = 10) {
      if (effects.haptic !== true) return;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
      } catch {
        // 無視
      }
    },
  };
}

// ボタン演出の「判断」と「数値」を純粋関数として集めたモジュール。
// DOM / window / document は参照しない（vitest の node 環境でテストできるようにするため）。
// 実際に DOM を動かすのは src/ui/motion.ts と src/ui/feedback.ts。

export type Frame = Record<string, string | number | null | undefined>;

export interface Timing {
  duration?: number;
  delay?: number;
  easing?: string;
  fill?: string;
  iterations?: number;
}

const TRANSFORM_KEYS = ["transform", "translate", "scale", "rotate"] as const;
const NON_VISUAL_KEYS = ["offset", "easing", "composite"] as const;
export const REDUCED_MAX_MS = 100;

// 「動きを減らす」設定のとき、transform 系を取り除き、色・不透明度だけを短く再生する形に変える。
// 動かすものが残らなければ null。入力は書き換えない。
export function reduceAnimation(
  kf: readonly Frame[],
  opts: Timing,
  reduced: boolean
): { keyframes: Frame[]; options: Timing } | null {
  if (!reduced) {
    return { keyframes: kf.map((f) => ({ ...f })), options: { ...opts } };
  }
  const keyframes = kf.map((f) => {
    const g: Frame = { ...f };
    for (const key of TRANSFORM_KEYS) delete g[key];
    return g;
  });
  const meaningful = keyframes.some((f) => Object.keys(f).some((k) => !(NON_VISUAL_KEYS as readonly string[]).includes(k)));
  if (!meaningful) return null;
  return { keyframes, options: { ...opts, duration: Math.min(opts.duration ?? 0, REDUCED_MAX_MS), delay: 0 } };
}

// タブが裏に回るとアニメーションが進まず finished が解決しないため、所要時間＋余裕で打ち切る。
export function finishTimeoutMs(endTime: unknown, fallback = 1000, margin = 80): number {
  return (typeof endTime === "number" && Number.isFinite(endTime) ? endTime : fallback) + margin;
}

// ---- 押し込み（P2） ----
// mockup の :active scale(.93) と transform .12s に合わせる。

export const PRESS_P2 = {
  scale: 0.93,
  down: 70,
  up: 120,
  cancel: 160,
  easing: "cubic-bezier(.2,0,0,1)",
} as const;

export function pressDownFrames(): Frame[] {
  return [{ transform: "none" }, { transform: `scale(${PRESS_P2.scale})` }];
}

export function pressDownTiming(): Timing {
  return { duration: PRESS_P2.down, easing: PRESS_P2.easing, fill: "forwards" };
}

export function pressUpFrames(from: string, _cancelled: boolean): Frame[] {
  return [{ transform: from }, { transform: "none" }];
}

export function pressUpTiming(cancelled: boolean): Timing {
  return cancelled ? { duration: PRESS_P2.cancel, easing: "ease-out" } : { duration: PRESS_P2.up, easing: PRESS_P2.easing };
}

// ---- 選択演出（keyframes は desktop.css） ----

// krx-is-bursting を外すまでの時間。floatUp(.75s) より長くする。
export const BURST_MS = 760;

// 付けたとき（取り消しではないとき）だけ、かつ動きを減らす設定でないときに選択演出を出す。
export function shouldBurst(reacted: boolean, reduced: boolean): boolean {
  return reacted && !reduced;
}

function countValue(s: string): number | null {
  if (s === "") return null;
  if (s === "999+") return 1000;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// カウンターのスロット演出の向き。増えたら up、減ったら down。比較できないときは null。
export function slotDirection(prev: string, next: string): "up" | "down" | null {
  const a = countValue(prev);
  const b = countValue(next);
  if (a === null || b === null || a === b) return null;
  return b > a ? "up" : "down";
}

// ---- 紙吹雪 ----

export const CONFETTI_PALETTE: readonly string[] = ["#2e7d32", "#43a047", "#fbc02d", "#1976d2", "#e53935", "#8e24aa"];

export interface ConfettiParticle {
  w: number;
  h: number;
  color: string;
  dx: number;
  dy: number;
  rot: number;
  duration: number;
}

export function confettiParticles(count: number, rand: () => number, palette: readonly string[]): ConfettiParticle[] {
  const result: ConfettiParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const w = 5 + rand() * 4;
    const dx = (rand() - 0.5) * 260;
    const dy = -70 - rand() * 120;
    const rot = (rand() - 0.5) * 720;
    const duration = 1000 + rand() * 400;
    result.push({
      w,
      h: w * 1.6,
      color: palette.length > 0 ? (palette[i % palette.length] as string) : "#000",
      dx,
      dy,
      rot,
      duration,
    });
  }
  return result;
}

// ---- 演出の判定 ----

// 付けたとき（取り消しではないとき）だけ、かつ動きを減らす設定でないときに紙吹雪を出す。
export function shouldConfetti(defConfetti: boolean, reacted: boolean, reduced: boolean): boolean {
  return defConfetti && reacted && !reduced;
}

// ---- キーボード ----

export const ENTER_RELEASE_MS = 90;

// Space は keydown で沈み keyup で戻る。Enter は沈んで一定時間後に戻る。長押しの繰り返しは無視。
export function keyPressPhase(key: string, repeat: boolean): "hold" | "tap" | null {
  if (repeat) return null;
  if (key === " ") return "hold";
  if (key === "Enter") return "tap";
  return null;
}

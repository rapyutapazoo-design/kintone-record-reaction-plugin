// ボタン・トースト・ダイアログの演出（CSS ＋ Web Animations API）の DOM 層。
// 判断や数値は src/lib/motionPlan.ts の純粋関数に置き、ここでは DOM を動かすだけにする。
// HTML 文字列の直接挿入は使わない（SVG は createElementNS で組み立てる）。
// dom.ts と循環 import にならないよう、このファイルは dom.ts を import しない。

import type { Effects } from "../lib/effects";
import type { ReactionTheme } from "../lib/reactionConfig";
import {
  CONFETTI_PALETTE,
  ENTER_RELEASE_MS,
  confettiParticles,
  finishTimeoutMs,
  keyPressPhase,
  pressDownFrames,
  pressDownTiming,
  pressUpFrames,
  pressUpTiming,
  reduceAnimation,
  BURST_MS,
  shouldBurst,
  slotDirection,
  type Frame,
  type Timing,
} from "../lib/motionPlan";
import type { Feedback } from "./feedback";

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

// transform を動かすアニメーションが重なって、傾いたまま・沈んだままにならないよう、
// 要素ごとに1本だけ持ち、新しく始めるときに前のものを cancel() する。
const transformAnimations = new WeakMap<Element, Animation>();

function run(node: Element, keyframes: Frame[], options: Timing, reduced: boolean, exclusive: boolean): Animation | null {
  if (typeof (node as { animate?: unknown }).animate !== "function") return null;
  const plan = reduceAnimation(keyframes, options, reduced);
  if (!plan) return null;
  try {
    if (exclusive) {
      const previous = transformAnimations.get(node);
      if (previous) previous.cancel();
    }
    const a = node.animate(plan.keyframes as unknown as Keyframe[], plan.options as unknown as KeyframeAnimationOptions);
    if (exclusive) transformAnimations.set(node, a);
    return a;
  } catch {
    return null;
  }
}

export function animate(node: Element, keyframes: Frame[], options: Timing): Animation | null {
  return run(node, keyframes, options, prefersReducedMotion(), false);
}

// アニメーションの完了を待つ。タブが裏に回ると finished が解決しないため、所要時間＋余裕のタイマーと競争させる。
export function settle(a: Animation | null): Promise<void> {
  if (!a) return Promise.resolve();
  let endTime: unknown;
  try {
    endTime = a.effect?.getComputedTiming().endTime;
  } catch {
    endTime = undefined;
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, finishTimeoutMs(endTime));
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    a.finished.then(finish, finish);
  });
}

// 並べ替え・追加・削除で動いた子要素を、元の位置から滑らせる（FLIP）。
export function flip(container: Element, mutate: () => void): void {
  const before = new Map<Element, number>();
  for (const child of Array.from(container.children)) before.set(child, child.getBoundingClientRect().top);
  mutate();
  for (const child of Array.from(container.children)) {
    const top = before.get(child);
    if (top === undefined) continue;
    const dy = top - child.getBoundingClientRect().top;
    if (dy) {
      animate(child, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: 220,
        easing: "cubic-bezier(.2,.9,.3,1)",
      });
    }
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(doc: Document, tag: string, attrs: Record<string, string>): SVGElement {
  const n = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// mockup と同じアイコン。heart / helpful は線画（選択済みで塗り）、confirm は円とチェック。
const ICON_PATHS = {
  heart: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  helpful: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
} as const;

// テーマごとのアイコン要素を作る（読み上げは aria-label に任せるので aria-hidden）。
export function createThemeIcon(doc: Document, theme: ReactionTheme, emoji: string): Element {
  if (theme === "heart" || theme === "helpful" || theme === "confirm") {
    const svg = svgEl(doc, "svg", { class: "krx-icon", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
    if (theme === "confirm") {
      svg.appendChild(svgEl(doc, "circle", { class: "krx-icon-circle", cx: "12", cy: "12", r: "9", stroke: "currentColor", "stroke-width": "2", fill: "none" }));
      svg.appendChild(svgEl(doc, "path", { class: "krx-icon-check", d: "M8.5 12.5l2.5 2.5 5-5", stroke: "currentColor", "stroke-width": "2", fill: "none" }));
    } else {
      svg.appendChild(svgEl(doc, "path", { d: ICON_PATHS[theme] }));
    }
    return svg;
  }
  const s = doc.createElement("span");
  s.setAttribute("class", theme === "thanks" ? "krx-bow" : "krx-emoji");
  s.setAttribute("aria-hidden", "true");
  s.textContent = emoji;
  return s;
}

// 選択演出用の粒（パーティクル）。thanks だけ 💖✨ も浮かべる。
export function createBurstLayer(doc: Document, theme: ReactionTheme): Node[] {
  const particles = doc.createElement("span");
  particles.setAttribute("class", "krx-particles");
  particles.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i += 1) {
    const p = doc.createElement("span");
    p.setAttribute("class", "krx-particle");
    particles.appendChild(p);
  }
  const nodes: Node[] = [particles];
  if (theme === "thanks") {
    const sp = doc.createElement("span");
    sp.setAttribute("class", "krx-sparkles");
    sp.setAttribute("aria-hidden", "true");
    sp.textContent = "💖✨";
    nodes.push(sp);
  }
  return nodes;
}

// 件数を差し替え、増減に応じてスロット式に転がす。
// reduced は呼び出し元（Motion.isReduced）の判定を受け取り、createMotion の設定と食い違わないようにする。
export function rollCount(countEl: HTMLElement, next: string, reduced: boolean): void {
  const prev = countEl.textContent ?? "";
  if (prev === next) return;
  countEl.textContent = next;
  if (reduced) return;
  const dir = slotDirection(prev, next);
  countEl.classList.remove("krx-slide-up", "krx-slide-down");
  if (dir === null) return;
  void countEl.offsetWidth; // reflow して animation を再始動する
  countEl.classList.add(`krx-slide-${dir}`);
}

export interface Motion {
  attachPress(btn: HTMLButtonElement, onDown?: () => void): () => void;
  success(btn: HTMLElement, row: HTMLElement): Promise<void>;
  error(btn: HTMLElement): Promise<void>;
  confetti(btn: HTMLElement): Promise<void>;
  isReduced(): boolean;
}

export interface MotionOptions {
  effects: Effects;
  feedback: Feedback;
  doc?: Document;
  isReduced?: () => boolean;
}

export function createMotion(options: MotionOptions): Motion {
  const { feedback } = options;
  const doc = options.doc ?? document;
  const isReduced = options.isReduced ?? prefersReducedMotion;
  let confettiRunning = false;

  const play = (node: Element, kf: Frame[], opts: Timing, exclusive = false) => run(node, kf, opts, isReduced(), exclusive);

  function span(className: string): HTMLSpanElement {
    const s = doc.createElement("span");
    s.className = className;
    return s;
  }

  function attachPress(btn: HTMLButtonElement, onDown?: () => void): () => void {
    let isDown = false;
    let downAnim: Animation | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    function down(e: PointerEvent | null): void {
      if (btn.disabled) return;
      if (releaseTimer !== null) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      isDown = true;
      if (e && e.pointerType !== "mouse") {
        // タッチでは暗黙のポインタキャプチャを外し、指を外へずらしたら pointerleave で静かに戻す。
        try {
          btn.releasePointerCapture(e.pointerId);
        } catch {
          // 無視
        }
      }
      btn.classList.add("krx-is-down");
      feedback.clickDown();
      feedback.haptic(10);
      if (!isReduced()) {
        downAnim = play(btn, pressDownFrames(), pressDownTiming(), true);
      }
      onDown?.();
    }

    function up(cancelled: boolean): void {
      if (!isDown) return;
      isDown = false;
      btn.classList.remove("krx-is-down");
      if (!cancelled) feedback.clickUp();
      if (!downAnim) return;
      let from = "none";
      try {
        from = getComputedStyle(btn).transform || "none";
      } catch {
        // 無視
      }
      downAnim.cancel();
      downAnim = null;
      play(btn, pressUpFrames(from, cancelled), pressUpTiming(cancelled), true);
    }

    const onPointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.button === 0) down(pe);
    };
    const onPointerUp = () => up(false);
    const onPointerLeave = () => up(true);
    const onBlur = () => {
      // Enter のタップ中（遅延戻しタイマーあり）はタイマーに任せ、Space 押しっぱなしのときだけ取り消す。
      if (isDown && releaseTimer === null) up(true);
    };
    const onKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      const phase = keyPressPhase(ke.key, ke.repeat);
      if (phase === null) return;
      down(null);
      if (phase === "tap") {
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          up(false);
        }, ENTER_RELEASE_MS);
      }
    };
    const onKeyUp = (e: Event) => {
      if ((e as KeyboardEvent).key === " ") up(false);
    };

    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("pointerup", onPointerUp);
    btn.addEventListener("pointerleave", onPointerLeave);
    btn.addEventListener("pointercancel", onPointerLeave);
    btn.addEventListener("keydown", onKeyDown);
    btn.addEventListener("keyup", onKeyUp);
    btn.addEventListener("blur", onBlur);
    return () => {
      btn.removeEventListener("pointerdown", onPointerDown);
      btn.removeEventListener("pointerup", onPointerUp);
      btn.removeEventListener("pointerleave", onPointerLeave);
      btn.removeEventListener("pointercancel", onPointerLeave);
      btn.removeEventListener("keydown", onKeyDown);
      btn.removeEventListener("keyup", onKeyUp);
      btn.removeEventListener("blur", onBlur);
      if (releaseTimer !== null) clearTimeout(releaseTimer);
    };
  }

  // 連続呼び出しで前の Promise が残らないよう、タイマーと resolve を組で保持する。
  const burstTimers = new WeakMap<Element, { timer: ReturnType<typeof setTimeout>; resolve: () => void }>();

  // 付けた状態のとき、保存成功後に krx-is-bursting を付けて CSS の演出を始める（外すのは BURST_MS 後）。
  async function success(btn: HTMLElement, _row: HTMLElement): Promise<void> {
    if (!shouldBurst(btn.getAttribute("aria-pressed") === "true", isReduced())) return;
    const prev = burstTimers.get(btn);
    if (prev !== undefined) {
      clearTimeout(prev.timer);
      prev.resolve();
    }
    btn.classList.remove("krx-is-bursting");
    void btn.offsetWidth; // reflow して animation を再始動する
    btn.classList.add("krx-is-bursting");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        btn.classList.remove("krx-is-bursting");
        resolve();
      }, BURST_MS);
      burstTimers.set(btn, { timer, resolve });
    });
  }

  async function error(btn: HTMLElement): Promise<void> {
    feedback.buzz();
    feedback.haptic(30);
    await settle(
      play(
        btn,
        [
          { transform: "none" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(-1px)" },
          { transform: "none" },
        ],
        { duration: 380, easing: "ease-out" },
        true
      )
    );
  }

  async function confetti(btn: HTMLElement): Promise<void> {
    if (isReduced() || confettiRunning) return;
    if (typeof (btn as { animate?: unknown }).animate !== "function") return;
    confettiRunning = true;
    try {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const jobs: Promise<void>[] = [];
      for (const p of confettiParticles(30, Math.random, CONFETTI_PALETTE)) {
        const node = span("krx-confetti");
        node.style.left = `${cx}px`;
        node.style.top = `${cy}px`;
        node.style.width = `${p.w}px`;
        node.style.height = `${p.h}px`;
        node.style.background = p.color;
        doc.body.appendChild(node);
        const a = play(
          node,
          [
            { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
            { transform: `translate(${p.dx}px,${p.dy}px) rotate(${p.rot}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${p.dx * 1.25}px,${p.dy + 160}px) rotate(${p.rot * 1.6}deg)`, opacity: 0 },
          ],
          { duration: p.duration, easing: "cubic-bezier(.15,.6,.35,1)", fill: "forwards" }
        );
        if (!a) {
          node.remove();
          continue;
        }
        jobs.push(settle(a).then(() => node.remove()));
      }
      await Promise.all(jobs);
    } finally {
      confettiRunning = false;
    }
  }

  return { attachPress, success, error, confetti, isReduced };
}

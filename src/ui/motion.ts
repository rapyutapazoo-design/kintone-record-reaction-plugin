// ボタン・トースト・ダイアログの演出（CSS ＋ Web Animations API）の DOM 層。
// 判断や数値は src/lib/motionPlan.ts の純粋関数に置き、ここでは DOM を動かすだけにする。
// HTML 文字列の直接挿入は使わない（SVG は createElementNS で組み立てる）。
// dom.ts と循環 import にならないよう、このファイルは dom.ts を import しない。

import type { Effects } from "../lib/effects";
import {
  CONFETTI_PALETTE,
  ENTER_RELEASE_MS,
  burstScale,
  confettiParticles,
  finishTimeoutMs,
  keyPressPhase,
  pressDownFrames,
  pressDownTiming,
  pressUpFrames,
  pressUpTiming,
  reduceAnimation,
  rippleGeometry,
  staggerDelay,
  PRESS_P2,
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

function checkSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M3 8.6l3.2 3.1L13 4.9");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("pathLength", "1");
  svg.appendChild(path);
  return svg;
}

export type IconKind = "check" | "spin";

// ボタン内の .krx-ic span の中身を差し替える。ラベル（.krx-lbl）には触らない。
export function setIcon(btn: HTMLElement, kind: IconKind | null): void {
  const doc = btn.ownerDocument;
  const ic = btn.querySelector<HTMLElement>(".krx-ic");
  if (!ic) return;
  ic.setAttribute("aria-hidden", "true");
  if (kind === null) {
    ic.dataset.kind = "";
    btn.classList.remove("krx-has-ic");
    // 幅が閉じ終わってから中身を空にする（閉じる途中で中身が消えないように）。
    setTimeout(() => {
      if (ic.dataset.kind === "") ic.textContent = "";
    }, 260);
    return;
  }
  if (ic.dataset.kind !== kind) {
    ic.textContent = "";
    if (kind === "spin") {
      const spin = doc.createElement("span");
      spin.className = "krx-spin";
      ic.appendChild(spin);
    } else {
      ic.appendChild(checkSvg(doc));
    }
    ic.dataset.kind = kind;
  }
  btn.classList.add("krx-has-ic");
}

function iconKind(btn: HTMLElement): IconKind | null {
  const kind = btn.querySelector<HTMLElement>(".krx-ic")?.dataset.kind;
  return kind === "check" || kind === "spin" ? kind : null;
}

export interface SendingHandle {
  stop(ok: boolean): Promise<void>;
  release(): void;
}

export interface Motion {
  attachPress(btn: HTMLButtonElement, onDown?: () => void): () => void;
  reveal(buttons: HTMLElement[]): void;
  startSending(btn: HTMLButtonElement, others: HTMLButtonElement[]): SendingHandle;
  success(btn: HTMLElement, row: HTMLElement): Promise<void>;
  burst(row: HTMLElement, btn: HTMLElement): Promise<void>;
  error(btn: HTMLElement): Promise<void>;
  nudge(btn: HTMLElement): Promise<void>;
  confetti(btn: HTMLElement): Promise<void>;
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

  function ripple(btn: HTMLElement, e: PointerEvent | null): void {
    if (isReduced()) return;
    const rect = btn.getBoundingClientRect();
    const geom = rippleGeometry(rect, e ? { x: e.clientX, y: e.clientY } : null);
    const node = span("krx-ripple");
    node.style.width = `${geom.size}px`;
    node.style.height = `${geom.size}px`;
    node.style.left = `${geom.left}px`;
    node.style.top = `${geom.top}px`;
    btn.appendChild(node);
    const a = play(node, [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1)", opacity: 0 }], {
      duration: 560,
      easing: "cubic-bezier(.2,.7,.3,1)",
    });
    if (!a) {
      node.remove();
      return;
    }
    void settle(a).then(() => node.remove());
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
      btn.style.setProperty("--krx-shade", String(PRESS_P2.shade));
      btn.classList.add("krx-is-down");
      feedback.clickDown();
      feedback.haptic(10);
      ripple(btn, e);
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

  function reveal(buttons: HTMLElement[]): void {
    buttons.forEach((b, i) => {
      play(
        b,
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 240, delay: staggerDelay(i), easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" },
        true
      );
    });
  }

  function startSending(btn: HTMLButtonElement, others: HTMLButtonElement[]): SendingHandle {
    const row = btn.parentElement;
    const prevKind = iconKind(btn) === "check" ? "check" : null;
    for (const o of others) {
      o.disabled = true;
      o.classList.add("krx-is-dim");
    }
    btn.disabled = true;
    btn.classList.add("krx-is-busy");
    btn.setAttribute("aria-busy", "true");
    row?.setAttribute("aria-busy", "true");
    setIcon(btn, "spin");
    return {
      async stop(ok: boolean): Promise<void> {
        // 成功時は呼び出し側（success）が ✓ を出すので、スピナーだけを外す。
        setIcon(btn, ok ? null : prevKind);
      },
      release(): void {
        for (const o of others) {
          o.disabled = false;
          o.classList.remove("krx-is-dim");
        }
        btn.disabled = false;
        btn.classList.remove("krx-is-busy");
        btn.removeAttribute("aria-busy");
        row?.removeAttribute("aria-busy");
      },
    };
  }

  async function burst(row: HTMLElement, btn: HTMLElement): Promise<void> {
    const node = span("krx-burst");
    const pad = 3;
    node.style.left = `${btn.offsetLeft - pad}px`;
    node.style.top = `${btn.offsetTop - pad}px`;
    node.style.width = `${btn.offsetWidth + pad * 2}px`;
    node.style.height = `${btn.offsetHeight + pad * 2}px`;
    try {
      const c = getComputedStyle(btn).getPropertyValue("--krx-c").trim();
      if (c) node.style.setProperty("--krx-c", c);
    } catch {
      // 無視
    }
    row.appendChild(node);
    const { sx, sy } = burstScale(btn.offsetWidth, btn.offsetHeight);
    const a = play(
      node,
      [
        { transform: "none", opacity: 0.9 },
        { transform: `scale(${sx},${sy})`, opacity: 0 },
      ],
      { duration: 480, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" }
    );
    if (!a) {
      node.remove();
      return;
    }
    await settle(a);
    node.remove();
  }

  async function success(btn: HTMLElement, row: HTMLElement): Promise<void> {
    setIcon(btn, "check");
    const path = btn.querySelector("path");
    const drawn = path
      ? settle(
          play(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: 300,
            easing: "cubic-bezier(.65,0,.35,1)",
            fill: "both",
          })
        )
      : Promise.resolve();
    await Promise.all([drawn, burst(row, btn)]);
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

  async function nudge(btn: HTMLElement): Promise<void> {
    await settle(
      play(
        btn,
        [
          { transform: "none" },
          { transform: "translateX(-3px) rotate(-1deg)" },
          { transform: "translateX(3px) rotate(1deg)" },
          { transform: "translateX(-1px)" },
          { transform: "none" },
        ],
        { duration: 320, easing: "ease-in-out" },
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

  return { attachPress, reveal, startSending, success, burst, error, nudge, confetti };
}

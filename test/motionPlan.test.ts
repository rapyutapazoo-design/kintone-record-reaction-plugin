import { describe, expect, it } from "vitest";
import {
  CONFETTI_PALETTE,
  ENTER_RELEASE_MS,
  PRESS_P2,
  confettiParticles,
  finishTimeoutMs,
  keyPressPhase,
  pressDownFrames,
  pressUpFrames,
  pressUpTiming,
  reduceAnimation,
  shouldBurst,
  shouldConfetti,
  slotDirection,
  type Frame,
} from "../src/lib/motionPlan";

describe("reduceAnimation", () => {
  it("reduced=false なら同じ内容を返す", () => {
    const kf: Frame[] = [{ transform: "none", opacity: 0 }, { transform: "scale(2)", opacity: 1 }];
    const out = reduceAnimation(kf, { duration: 500, delay: 40 }, false);
    expect(out).toEqual({ keyframes: kf, options: { duration: 500, delay: 40 } });
  });

  it("transform 系だけなら null", () => {
    const kf: Frame[] = [
      { transform: "none", offset: 0, easing: "ease" },
      { translate: "1px", scale: 2, rotate: "3deg", transform: "x" },
    ];
    expect(reduceAnimation(kf, { duration: 300 }, true)).toBeNull();
  });

  it("opacity が残れば 100ms 以下・delay 0 になり、transform 系は消える", () => {
    const kf: Frame[] = [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "none" }];
    const out = reduceAnimation(kf, { duration: 320, delay: 80, easing: "ease" }, true)!;
    expect(out.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(out.options.duration).toBe(100);
    expect(out.options.delay).toBe(0);
    expect(out.options.easing).toBe("ease");
    expect(reduceAnimation(kf, { duration: 60 }, true)!.options.duration).toBe(60);
    expect(reduceAnimation(kf, {}, true)!.options.duration).toBe(0);
  });

  it("入力を書き換えない", () => {
    const kf: Frame[] = [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1 }];
    const opts = { duration: 320, delay: 80 };
    const kfCopy = JSON.parse(JSON.stringify(kf));
    reduceAnimation(kf, opts, true);
    reduceAnimation(kf, opts, false);
    expect(kf).toEqual(kfCopy);
    expect(opts).toEqual({ duration: 320, delay: 80 });
  });
});

describe("finishTimeoutMs", () => {
  it("有限の endTime には余裕を足す", () => {
    expect(finishTimeoutMs(300)).toBe(380);
    expect(finishTimeoutMs(300, 1000, 10)).toBe(310);
  });
  it("Infinity・NaN・undefined・数値以外は fallback を使う", () => {
    expect(finishTimeoutMs(Infinity)).toBe(1080);
    expect(finishTimeoutMs(NaN)).toBe(1080);
    expect(finishTimeoutMs(undefined)).toBe(1080);
    expect(finishTimeoutMs("300")).toBe(1080);
    expect(finishTimeoutMs(undefined, 500, 20)).toBe(520);
  });
});

describe("押し込み（P2）", () => {
  it("沈み込みのフレームは none → scale(.93)", () => {
    expect(pressDownFrames()).toEqual([{ transform: "none" }, { transform: "scale(0.93)" }]);
  });
  it("通常の戻りは2フレームで 120ms、easing は PRESS_P2.easing", () => {
    const kf = pressUpFrames("matrix(1,0,0,1,0,1)", false);
    expect(kf).toEqual([{ transform: "matrix(1,0,0,1,0,1)" }, { transform: "none" }]);
    expect(pressUpTiming(false)).toEqual({ duration: 120, easing: PRESS_P2.easing });
  });
  it("キャンセル時は2フレームで 160ms ease-out", () => {
    expect(pressUpFrames("x", true)).toEqual([{ transform: "x" }, { transform: "none" }]);
    expect(pressUpTiming(true)).toEqual({ duration: 160, easing: "ease-out" });
  });
});

describe("shouldBurst", () => {
  it("付けたとき、かつ動きを減らさないときだけ true", () => {
    expect(shouldBurst(true, false)).toBe(true);
    expect(shouldBurst(true, true)).toBe(false);
    expect(shouldBurst(false, false)).toBe(false);
    expect(shouldBurst(false, true)).toBe(false);
  });
});

describe("slotDirection", () => {
  it("増減の向きを返し、比較できないときは null", () => {
    expect(slotDirection("12", "13")).toBe("up");
    expect(slotDirection("13", "12")).toBe("down");
    expect(slotDirection("", "3")).toBeNull();
    expect(slotDirection("3", "")).toBeNull();
    expect(slotDirection("5", "5")).toBeNull();
    expect(slotDirection("999", "999+")).toBe("up");
    expect(slotDirection("999+", "999+")).toBeNull();
    expect(slotDirection("a", "1")).toBeNull();
  });
});

describe("confettiParticles", () => {
  it("rand を固定すると決まった値になり、数・範囲・色の巡回が正しい", () => {
    const ps = confettiParticles(8, () => 0.5, CONFETTI_PALETTE);
    expect(ps).toHaveLength(8);
    for (const p of ps) {
      expect(p.w).toBeCloseTo(7);
      expect(p.h).toBeCloseTo(7 * 1.6);
      expect(p.dx).toBeCloseTo(0);
      expect(p.dy).toBeCloseTo(-130);
      expect(p.rot).toBeCloseTo(0);
      expect(p.duration).toBeCloseTo(1200);
    }
    expect(ps.map((p) => p.color)).toEqual([...CONFETTI_PALETTE, CONFETTI_PALETTE[0], CONFETTI_PALETTE[1]]);
  });
  it("rand の両端でも範囲内", () => {
    for (const r of [0, 0.999999]) {
      const [p] = confettiParticles(1, () => r, CONFETTI_PALETTE);
      expect(p!.w).toBeGreaterThanOrEqual(5);
      expect(p!.w).toBeLessThanOrEqual(9);
      expect(p!.duration).toBeGreaterThanOrEqual(1000);
      expect(p!.duration).toBeLessThanOrEqual(1400);
      expect(p!.dy).toBeLessThan(-70 + 1e-9);
    }
  });
  it("count=0 は空", () => {
    expect(confettiParticles(0, Math.random, CONFETTI_PALETTE)).toEqual([]);
  });
});

describe("shouldConfetti", () => {
  it("付けたときだけ、動きを減らす設定でなければ true", () => {
    expect(shouldConfetti(true, true, false)).toBe(true);
    expect(shouldConfetti(true, false, false)).toBe(false);
    expect(shouldConfetti(true, true, true)).toBe(false);
    expect(shouldConfetti(false, true, false)).toBe(false);
  });
});

describe("keyPressPhase", () => {
  it("Space は hold、Enter は tap", () => {
    expect(keyPressPhase(" ", false)).toBe("hold");
    expect(keyPressPhase("Enter", false)).toBe("tap");
    expect(ENTER_RELEASE_MS).toBe(90);
  });
  it("repeat とそれ以外のキーは null", () => {
    expect(keyPressPhase(" ", true)).toBeNull();
    expect(keyPressPhase("Enter", true)).toBeNull();
    expect(keyPressPhase("a", false)).toBeNull();
    expect(keyPressPhase("Tab", false)).toBeNull();
  });
});

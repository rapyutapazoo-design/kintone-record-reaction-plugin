import { describe, expect, it } from "vitest";
import { HEADER_SPACE } from "../src/lib/reactionConfig";
import { mergeBarsByPlacement, resolvePlacements } from "../src/lib/placement";
import type { BarView, ChipView } from "../src/lib/view";

const ch = (key: string): ChipView => ({ key, emoji: "x", label: key, color: "blue", theme: "emoji", reacted: false, count: null, users: null, confetti: false });

describe("placement", () => {
  it("見つからないスペースは '' に置き換わる", () => {
    const m = resolvePlacements(["a", "b", ""], (id) => id === "a");
    expect(m.get("a")).toBe("a");
    expect(m.get("b")).toBe("");
    expect(m.get("")).toBe("");
  });
  it("HEADER_SPACE は常に ''（ヘッダー）に解決される", () => {
    expect(resolvePlacements([HEADER_SPACE], () => true).get(HEADER_SPACE)).toBe("");
  });
  it("同じ配置のバーがまとまる（順序維持）", () => {
    const bars: BarView[] = [
      { spaceId: "a", chips: [ch("1")] },
      { spaceId: "", chips: [ch("2")] },
      { spaceId: "b", chips: [ch("3")] },
    ];
    const merged = mergeBarsByPlacement(bars, resolvePlacements(["a", "", "b"], (id) => id === "a"));
    expect(merged.map((b) => b.spaceId)).toEqual(["a", ""]);
    expect(merged[1]!.chips.map((c) => c.key)).toEqual(["2", "3"]);
  });
});

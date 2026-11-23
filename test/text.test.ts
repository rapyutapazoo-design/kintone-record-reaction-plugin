import { describe, expect, it } from "vitest";
import { countGraphemes, hasControlChars, truncateGraphemes } from "../src/lib/text";

describe("text", () => {
  it("絵文字は1書記素", () => {
    expect(countGraphemes("👍")).toBe(1);
    expect(countGraphemes("👨‍👩‍👧")).toBe(1);
    expect(countGraphemes("🇯🇵")).toBe(1);
  });
  it("結合文字", () => {
    expect(countGraphemes("é")).toBe(1);
    expect(countGraphemes("abc")).toBe(3);
  });
  it("truncate は書記素を壊さない", () => {
    expect(truncateGraphemes("👍👨‍👩‍👧🇯🇵abc", 3)).toBe("👍👨‍👩‍👧🇯🇵");
    expect(truncateGraphemes("abc", 5)).toBe("abc");
  });
  it("制御文字の検出", () => {
    expect(hasControlChars("a\nb")).toBe(true);
    expect(hasControlChars("a\u0000")).toBe(true);
    expect(hasControlChars("👍 ok")).toBe(false);
  });
});

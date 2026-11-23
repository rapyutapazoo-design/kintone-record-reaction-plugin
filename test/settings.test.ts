import { describe, expect, it } from "vitest";
import { buildRecordGetUrl, normalizeRecordApiUrl, resolveSpaceOptions, validateApiToken } from "../src/lib/settings";

describe("normalizeRecordApiUrl", () => {
  it(".s.cybozu.com を .cybozu.com に置換する", () => {
    expect(normalizeRecordApiUrl("https://example.s.cybozu.com/k/v1/record.json")).toBe(
      "https://example.cybozu.com/k/v1/record.json"
    );
  });

  it("通常ドメインは変更しない", () => {
    expect(normalizeRecordApiUrl("https://example.cybozu.com/k/v1/record.json")).toBe(
      "https://example.cybozu.com/k/v1/record.json"
    );
  });

  it("ゲストスペースのパスは維持する", () => {
    expect(normalizeRecordApiUrl("https://example.cybozu.com/k/guest/1/v1/record.json")).toBe(
      "https://example.cybozu.com/k/guest/1/v1/record.json"
    );
  });

  it("クエリ・ハッシュは除去する", () => {
    expect(normalizeRecordApiUrl("https://example.cybozu.com/k/v1/record.json?app=1#frag")).toBe(
      "https://example.cybozu.com/k/v1/record.json"
    );
  });

  it("record.json 以外は例外を投げる", () => {
    expect(() => normalizeRecordApiUrl("https://example.cybozu.com/k/v1/records.json")).toThrow();
  });

  it("不正なURLは例外を投げる", () => {
    expect(() => normalizeRecordApiUrl("not a url")).toThrow();
  });
});

describe("validateApiToken", () => {
  it("有効なトークンを受理する", () => {
    expect(validateApiToken("abcDEF1234567890")).toEqual({ ok: true, value: "abcDEF1234567890" });
  });

  it("trimして受理する", () => {
    expect(validateApiToken("  token123  ")).toEqual({ ok: true, value: "token123" });
  });

  it("空文字は拒否", () => {
    expect(validateApiToken("").ok).toBe(false);
    expect(validateApiToken("   ").ok).toBe(false);
  });

  it("空白・カンマを含む場合は拒否（複数トークン非対応）", () => {
    expect(validateApiToken("token1,token2").ok).toBe(false);
    expect(validateApiToken("token1 token2").ok).toBe(false);
  });

  it("制御文字は拒否", () => {
    expect(validateApiToken("token\u0000abc").ok).toBe(false);
  });

  it("長さ上限(1000)を超えると拒否", () => {
    expect(validateApiToken("a".repeat(1000)).ok).toBe(true);
    expect(validateApiToken("a".repeat(1001)).ok).toBe(false);
  });
});

describe("buildRecordGetUrl", () => {
  it("app と id をクエリに付与する", () => {
    expect(buildRecordGetUrl("https://example.cybozu.com/k/v1/record.json", 10, 5)).toBe(
      "https://example.cybozu.com/k/v1/record.json?app=10&id=5"
    );
  });
});

describe("resolveSpaceOptions", () => {
  it("既定行（ヘッダーメニュー）を先頭に含む", () => {
    const options = resolveSpaceOptions([], null);
    expect(options[0]).toEqual({ value: "", label: "ヘッダーメニュー（既定）" });
  });

  it("スペーサーを選択肢として列挙する", () => {
    const options = resolveSpaceOptions([{ elementId: "sp1" }, { elementId: "sp2" }], null);
    expect(options).toHaveLength(3);
    expect(options[1]).toEqual({ value: "sp1", label: "sp1" });
  });

  it("保存済みIDが見つからない場合は missing 行を追加する", () => {
    const options = resolveSpaceOptions([{ elementId: "sp1" }], "sp-missing");
    const missing = options.find((o) => o.missing);
    expect(missing).toEqual({ value: "sp-missing", label: "（見つかりません: sp-missing）", missing: true });
  });

  it("保存済みIDが見つかる場合は missing 行を追加しない", () => {
    const options = resolveSpaceOptions([{ elementId: "sp1" }], "sp1");
    expect(options.some((o) => o.missing)).toBe(false);
  });
});

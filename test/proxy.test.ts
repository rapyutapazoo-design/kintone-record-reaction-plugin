import { describe, expect, it } from "vitest";
import { classifyProxyResponse, KintoneConflictError } from "../src/kintone/proxy";
import { AppError } from "../src/lib/errors";

describe("classifyProxyResponse", () => {
  it("200: JSONをパースして返す", () => {
    const result = classifyProxyResponse(200, JSON.stringify({ record: {}, revision: "1" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json).toEqual({ record: {}, revision: "1" });
    }
  });

  it("200だが不正JSON: UPSTREAM", () => {
    const result = classifyProxyResponse(200, "not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AppError);
      expect((result.error as AppError).code).toBe("UPSTREAM");
    }
  });

  it("409: KintoneConflictError", () => {
    const result = classifyProxyResponse(409, JSON.stringify({ code: "GAIA_CO02" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(KintoneConflictError);
    }
  });

  it("200番台以外でも body.code が GAIA_CO02 なら競合扱い", () => {
    const result = classifyProxyResponse(400, JSON.stringify({ code: "GAIA_CO02" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(KintoneConflictError);
    }
  });

  it("400 + CB_VA01: CONFIG_MISMATCH", () => {
    const result = classifyProxyResponse(400, JSON.stringify({ code: "CB_VA01" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("CONFIG_MISMATCH");
    }
  });

  it("400 + GAIA_IQ11（フィールドが存在しない）: CONFIG_MISMATCH", () => {
    const result = classifyProxyResponse(400, JSON.stringify({ code: "GAIA_IQ11" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("CONFIG_MISMATCH");
    }
  });

  it("400 + その他コード: UPSTREAM", () => {
    const result = classifyProxyResponse(400, JSON.stringify({ code: "CB_XX99" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("UPSTREAM");
    }
  });

  it("404: NOT_FOUND", () => {
    const result = classifyProxyResponse(404, JSON.stringify({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("NOT_FOUND");
    }
  });

  it("body.code が GAIA_RE01 なら NOT_FOUND", () => {
    const result = classifyProxyResponse(400, JSON.stringify({ code: "GAIA_RE01" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("NOT_FOUND");
    }
  });

  it("401: TOKEN", () => {
    const result = classifyProxyResponse(401, JSON.stringify({ code: "CB_IL02" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("TOKEN");
    }
  });

  it("403: TOKEN", () => {
    const result = classifyProxyResponse(403, JSON.stringify({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("TOKEN");
    }
  });

  it("500: UPSTREAM", () => {
    const result = classifyProxyResponse(500, JSON.stringify({ code: "GAIA_IL90", message: "internal detail" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("UPSTREAM");
    }
  });

  it("エラーメッセージに応答本文（kintoneの内部メッセージ）が含まれない", () => {
    const result = classifyProxyResponse(500, JSON.stringify({ code: "GAIA_IL90", message: "secret internal detail" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain("secret internal detail");
    }
  });

  it("不正JSON かつ非2xx: UPSTREAM", () => {
    const result = classifyProxyResponse(500, "not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as AppError).code).toBe("UPSTREAM");
    }
  });
});

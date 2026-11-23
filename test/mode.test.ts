import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import { decideMode, isProxyAvailable, MOBILE_READONLY_MESSAGE } from "../src/lib/mode";

describe("decideMode", () => {
  it("正常なら interactive", () => {
    expect(decideMode({ isMobile: false, proxyAvailable: true, loadError: null })).toEqual({ kind: "interactive" });
    expect(decideMode({ isMobile: true, proxyAvailable: true, loadError: null })).toEqual({ kind: "interactive" });
  });
  it("モバイルでプロキシが無い、または UPSTREAM なら readonly / info", () => {
    const expected = { kind: "readonly", message: MOBILE_READONLY_MESSAGE, level: "info" };
    expect(decideMode({ isMobile: true, proxyAvailable: false, loadError: null })).toEqual(expected);
    expect(decideMode({ isMobile: true, proxyAvailable: true, loadError: new AppError("UPSTREAM") })).toEqual(expected);
  });
  it("PC で UPSTREAM なら warning", () => {
    const m = decideMode({ isMobile: false, proxyAvailable: true, loadError: new AppError("UPSTREAM") });
    expect(m).toMatchObject({ kind: "readonly", level: "warning" });
  });
  it("TOKEN と CONFIG_MISMATCH のメッセージ", () => {
    const t = decideMode({ isMobile: false, proxyAvailable: true, loadError: new AppError("TOKEN") });
    expect(t).toMatchObject({ level: "warning", message: expect.stringContaining("APIトークン") });
    const c = decideMode({ isMobile: true, proxyAvailable: true, loadError: new AppError("CONFIG_MISMATCH") });
    expect(c).toMatchObject({ level: "warning", message: expect.stringContaining("プラグイン設定を見直して") });
  });
  it("isProxyAvailable", () => {
    expect(isProxyAvailable({ plugin: { app: { proxy: () => undefined } } })).toBe(true);
    expect(isProxyAvailable({ plugin: { app: {} } })).toBe(false);
    expect(isProxyAvailable({})).toBe(false);
    expect(isProxyAvailable(undefined)).toBe(false);
  });
});

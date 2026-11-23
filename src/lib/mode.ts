import { AppError, toUserMessage } from "./errors";

export type Mode = { kind: "interactive" } | { kind: "readonly"; message: string; level: "info" | "warning" };

export const MOBILE_READONLY_MESSAGE = "モバイル版ではリアクションを付けられませんでした。PC 版の画面から操作してください。";

export function decideMode(input: { isMobile: boolean; proxyAvailable: boolean; loadError: unknown | null }): Mode {
  const { isMobile, proxyAvailable, loadError } = input;
  if (isMobile && (!proxyAvailable || (loadError instanceof AppError && loadError.code === "UPSTREAM"))) {
    return { kind: "readonly", message: MOBILE_READONLY_MESSAGE, level: "info" };
  }
  if (loadError !== null && loadError !== undefined) {
    return { kind: "readonly", message: toUserMessage(loadError), level: "warning" };
  }
  if (!proxyAvailable) {
    return { kind: "readonly", message: toUserMessage(new AppError("UPSTREAM")), level: "warning" };
  }
  return { kind: "interactive" };
}

export function isProxyAvailable(k: unknown): boolean {
  const proxy = (k as { plugin?: { app?: { proxy?: unknown } } } | null | undefined)?.plugin?.app?.proxy;
  return typeof proxy === "function";
}

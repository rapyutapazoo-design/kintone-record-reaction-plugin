// 設定画面用の純粋関数（テスト対象）。

// eslint-disable-next-line no-control-regex
const CONTROL_OR_WHITESPACE = /[\u0000-\u001F\u007F\s,]/;

export function normalizeRecordApiUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URLの形式が正しくありません。");
  }
  if (parsed.hostname.endsWith(".s.cybozu.com")) {
    parsed.hostname = parsed.hostname.replace(/\.s\.cybozu\.com$/, ".cybozu.com");
  }
  parsed.search = "";
  parsed.hash = "";
  const normalized = parsed.toString();
  if (!normalized.endsWith("/record.json")) {
    throw new Error("record.json のURLではありません。");
  }
  return normalized;
}

export type ApiTokenValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateApiToken(token: string): ApiTokenValidation {
  const value = (token ?? "").trim();
  if (value.length < 1) {
    return { ok: false, message: "APIトークンを入力してください。" };
  }
  if (value.length > 1000) {
    return { ok: false, message: "APIトークンが長すぎます。" };
  }
  if (CONTROL_OR_WHITESPACE.test(value)) {
    return { ok: false, message: "APIトークンの形式が正しくありません（複数トークンには対応していません）。" };
  }
  return { ok: true, value };
}

export function buildRecordGetUrl(recordApiUrl: string, appId: string | number, recordId: string | number): string {
  return `${recordApiUrl}?app=${encodeURIComponent(String(appId))}&id=${encodeURIComponent(String(recordId))}`;
}

export interface SpaceOption {
  value: string;
  label: string;
  missing?: boolean;
}

export function resolveSpaceOptions(
  spacers: { elementId: string }[],
  savedSpaceId: string | null | undefined
): SpaceOption[] {
  const options: SpaceOption[] = [{ value: "", label: "ヘッダーメニュー（既定）" }];
  for (const spacer of spacers) {
    options.push({ value: spacer.elementId, label: spacer.elementId });
  }
  if (savedSpaceId && !spacers.some((s) => s.elementId === savedSpaceId)) {
    options.push({ value: savedSpaceId, label: `（見つかりません: ${savedSpaceId}）`, missing: true });
  }
  return options;
}

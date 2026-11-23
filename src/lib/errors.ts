export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "ROW_LIMIT"
  | "CONFLICT"
  | "UPSTREAM"
  | "TOKEN"
  | "NOT_CONFIGURED"
  | "CONFIG_MISMATCH"
  | "INTERNAL";

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: "リクエストの内容が正しくありません。",
  NOT_FOUND: "レコードが見つかりません。",
  ROW_LIMIT: "リアクションの記録件数が上限に達したため保存できませんでした。管理者にお問い合わせください。",
  CONFLICT: "他の人の操作と重なったため保存できませんでした。時間をおいて再度お試しください。",
  UPSTREAM: "kintoneとの通信に失敗しました。時間をおいて再度お試しください。",
  TOKEN: "APIトークンの設定に問題があります。管理者にお問い合わせください。",
  NOT_CONFIGURED: "プラグイン設定が未完了です。管理者にお問い合わせください。",
  CONFIG_MISMATCH: "プラグイン設定を見直してください（管理者向け）。",
  INTERNAL: "予期しないエラーが発生しました。",
};

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.code = code;
    this.name = "AppError";
  }
}

// kintone のエラー本文やAPIトークンを画面に出さないためのヘルパー。
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) {
    return err.message;
  }
  return DEFAULT_MESSAGE.INTERNAL;
}

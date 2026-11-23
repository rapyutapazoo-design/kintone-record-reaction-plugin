import { AppError } from "../lib/errors";
import { buildRecordGetUrl } from "../lib/settings";
import type { KintoneRecord, PutRecord } from "../lib/record";

export class KintoneConflictError extends Error {
  constructor() {
    super("kintone record revision conflict");
    this.name = "KintoneConflictError";
  }
}

interface KintoneErrorBody {
  code?: string;
  message?: string;
}

export type ClassifiedResponse = { ok: true; json: any } | { ok: false; error: Error };

// kintone のエラー本文・APIトークンを例外メッセージに含めない。
export function classifyProxyResponse(status: number, bodyText: string): ClassifiedResponse {
  let parsed: unknown = null;
  let parseFailed = false;
  try {
    parsed = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  } catch {
    parseFailed = true;
  }

  if (status >= 200 && status < 300) {
    if (parseFailed) {
      return { ok: false, error: new AppError("UPSTREAM") };
    }
    return { ok: true, json: parsed };
  }

  const errBody: KintoneErrorBody = parseFailed || typeof parsed !== "object" || parsed === null ? {} : (parsed as KintoneErrorBody);

  if (status === 409 || errBody.code === "GAIA_CO02") {
    return { ok: false, error: new KintoneConflictError() };
  }
  if (status === 404 || errBody.code === "GAIA_RE01") {
    return { ok: false, error: new AppError("NOT_FOUND") };
  }
  if (status === 401 || status === 403) {
    return { ok: false, error: new AppError("TOKEN") };
  }
  // CB_VA01: 選択肢名などの値の不一致、GAIA_IQ11: 割り当てたフィールドが存在しない（フォーム変更後など）。
  if (status === 400 && (errBody.code === "CB_VA01" || errBody.code === "GAIA_IQ11")) {
    return { ok: false, error: new AppError("CONFIG_MISMATCH") };
  }
  return { ok: false, error: new AppError("UPSTREAM") };
}

export function proxyRequest(
  pluginId: string,
  url: string,
  method: "GET" | "PUT",
  data: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = method === "PUT" ? { "Content-Type": "application/json" } : {};
    try {
      kintone.plugin.app.proxy(
        pluginId,
        url,
        method,
        headers,
        data,
        (body: string, status: number) => {
          const result = classifyProxyResponse(status, body);
          if (result.ok) {
            resolve(result.json);
          } else {
            reject(result.error);
          }
        },
        () => {
          reject(new AppError("UPSTREAM"));
        }
      );
    } catch {
      reject(new AppError("UPSTREAM"));
    }
  });
}

export interface RecordClient {
  getRecord(): Promise<{ record: KintoneRecord; revision: string }>;
  putRecord(revision: string, record: PutRecord): Promise<void>;
}

export function createRecordClient(
  pluginId: string,
  recordApiUrl: string,
  appId: string | number,
  recordId: string | number
): RecordClient {
  async function getRecord(): Promise<{ record: KintoneRecord; revision: string }> {
    const url = buildRecordGetUrl(recordApiUrl, appId, recordId);
    const body = await proxyRequest(pluginId, url, "GET", {});
    return { record: body.record as KintoneRecord, revision: body.revision as string };
  }

  async function putRecord(revision: string, record: PutRecord): Promise<void> {
    await proxyRequest(pluginId, recordApiUrl, "PUT", {
      app: appId,
      id: recordId,
      revision,
      record,
    });
  }

  return { getRecord, putRecord };
}

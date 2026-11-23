import { DEFAULT_MAPPING, type FormFieldsResponse } from "../../src/lib/fields";
import type { KintoneRecord, SubtableRow } from "../../src/lib/record";

export function makeRow(
  id: string | undefined,
  v: { userCode: string; userName?: string; key: string; label?: string; at?: string }
): SubtableRow {
  const m = DEFAULT_MAPPING;
  const row: SubtableRow = {
    value: {
      [m.userCode]: { type: "SINGLE_LINE_TEXT", value: v.userCode },
      [m.userName]: { type: "SINGLE_LINE_TEXT", value: v.userName ?? "" },
      [m.key]: { type: "SINGLE_LINE_TEXT", value: v.key },
      [m.label]: { type: "SINGLE_LINE_TEXT", value: v.label ?? "" },
      [m.at]: { type: "DATETIME", value: v.at ?? "2026-01-01T00:00:00Z" },
    },
  };
  if (id !== undefined) row.id = id;
  return row;
}

export function makeRecord(opts: { rows?: SubtableRow[]; counts?: Record<string, number>; omitTable?: boolean } = {}): KintoneRecord {
  const rec: KintoneRecord = { title: { type: "SINGLE_LINE_TEXT", value: "t" } };
  if (!opts.omitTable) rec[DEFAULT_MAPPING.table] = { type: "SUBTABLE", value: opts.rows ?? [] };
  for (const [code, n] of Object.entries(opts.counts ?? {})) rec[code] = { type: "NUMBER", value: String(n) };
  return rec;
}

export function makeFieldsResponse(opts: { numberFields?: string[]; noTable?: boolean } = {}): FormFieldsResponse {
  const m = DEFAULT_MAPPING;
  const properties: FormFieldsResponse["properties"] = {
    title: { type: "SINGLE_LINE_TEXT", code: "title", label: "タイトル" },
  };
  if (!opts.noTable) {
    properties[m.table] = {
      type: "SUBTABLE",
      code: m.table,
      label: "リアクション",
      fields: {
        [m.userCode]: { type: "SINGLE_LINE_TEXT", code: m.userCode, label: "ユーザーコード" },
        [m.userName]: { type: "SINGLE_LINE_TEXT", code: m.userName, label: "ユーザー名" },
        [m.key]: { type: "SINGLE_LINE_TEXT", code: m.key, label: "キー" },
        [m.label]: { type: "SINGLE_LINE_TEXT", code: m.label, label: "ラベル" },
        [m.at]: { type: "DATETIME", code: m.at, label: "日時" },
      },
    };
  }
  for (const code of opts.numberFields ?? []) properties[code] = { type: "NUMBER", code, label: code };
  return { properties };
}

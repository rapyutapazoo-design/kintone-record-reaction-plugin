export interface FormFieldProperty {
  type: string;
  code: string;
  label: string;
  fields?: Record<string, FormFieldProperty>;
}
export interface FormFieldsResponse {
  properties: Record<string, FormFieldProperty>;
}
export interface FieldCandidate {
  code: string;
  label: string;
}
export interface TableMapping {
  table: string;
  userCode: string;
  userName: string;
  key: string;
  label: string;
  at: string;
}

export const DEFAULT_MAPPING: TableMapping = {
  table: "reactions",
  userCode: "rx_user_code",
  userName: "rx_user_name",
  key: "rx_key",
  label: "rx_label",
  at: "rx_at",
};

export type ColumnName = "userCode" | "userName" | "key" | "label" | "at";
export const COLUMN_NAMES: readonly ColumnName[] = ["userCode", "userName", "key", "label", "at"];
export const COLUMN_TYPES: Record<ColumnName, string> = {
  userCode: "SINGLE_LINE_TEXT",
  userName: "SINGLE_LINE_TEXT",
  key: "SINGLE_LINE_TEXT",
  label: "SINGLE_LINE_TEXT",
  at: "DATETIME",
};

function toCandidate(p: FormFieldProperty, code: string): FieldCandidate {
  return { code: p.code || code, label: p.label || code };
}

export function listSubtables(resp: FormFieldsResponse): FieldCandidate[] {
  return Object.entries(resp.properties)
    .filter(([, p]) => p.type === "SUBTABLE")
    .map(([code, p]) => toCandidate(p, code));
}

export function listSubtableColumns(resp: FormFieldsResponse, table: string, type: string): FieldCandidate[] {
  const t = resp.properties[table];
  if (!t || t.type !== "SUBTABLE" || !t.fields) return [];
  return Object.entries(t.fields)
    .filter(([, p]) => p.type === type)
    .map(([code, p]) => toCandidate(p, code));
}

export function listNumberFields(resp: FormFieldsResponse): FieldCandidate[] {
  return Object.entries(resp.properties)
    .filter(([, p]) => p.type === "NUMBER")
    .map(([code, p]) => toCandidate(p, code));
}

function columnOk(resp: FormFieldsResponse, table: string, name: ColumnName, code: string): boolean {
  if (!code || !table) return false;
  return listSubtableColumns(resp, table, COLUMN_TYPES[name]).some((c) => c.code === code);
}

export function presetMapping(resp: FormFieldsResponse, saved: TableMapping | null): TableMapping {
  const tables = listSubtables(resp);
  const tableOk = (code: string): boolean => code !== "" && tables.some((t) => t.code === code);
  let table = "";
  if (saved && tableOk(saved.table)) table = saved.table;
  else if (tableOk(DEFAULT_MAPPING.table)) table = DEFAULT_MAPPING.table;
  const tableChanged = saved === null || saved.table !== table;
  const out: TableMapping = { table, userCode: "", userName: "", key: "", label: "", at: "" };
  for (const name of COLUMN_NAMES) {
    const savedCode = saved && !tableChanged ? saved[name] : "";
    if (columnOk(resp, table, name, savedCode)) out[name] = savedCode;
    else if (columnOk(resp, table, name, DEFAULT_MAPPING[name])) out[name] = DEFAULT_MAPPING[name];
  }
  return out;
}

export function validateMapping(resp: FormFieldsResponse, m: TableMapping): string[] {
  const errors: string[] = [];
  const t = resp.properties[m.table];
  if (!m.table || !t || t.type !== "SUBTABLE") {
    errors.push("記録用のテーブルを選択してください。");
    return errors;
  }
  const names: Record<ColumnName, string> = {
    userCode: "ユーザーコード列",
    userName: "ユーザー名列",
    key: "リアクションキー列",
    label: "表示ラベル列",
    at: "日時列",
  };
  for (const n of COLUMN_NAMES) {
    if (!columnOk(resp, m.table, n, m[n])) {
      errors.push(`${names[n]}を、テーブル内の${COLUMN_TYPES[n] === "DATETIME" ? "日時" : "文字列（1行）"}フィールドから選択してください。`);
    }
  }
  const codes = COLUMN_NAMES.map((n) => m[n]).filter((c) => c !== "");
  if (new Set(codes).size !== codes.length) errors.push("テーブルの列は、それぞれ別のフィールドを割り当ててください。");
  return errors;
}

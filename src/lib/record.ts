export interface KintoneField {
  type?: string;
  value: unknown;
}
export type KintoneRecord = Record<string, KintoneField>;
export interface SubtableRow {
  id?: string;
  value: Record<string, KintoneField>;
}
export type PutRecord = Record<string, { value: unknown }>;

// event.record に権限のないフィールドは含まれない前提で、フィールドの有無を権限判定に使う。
export function hasField(record: KintoneRecord, code: string): boolean {
  const f = Object.prototype.hasOwnProperty.call(record, code) ? record[code] : undefined;
  return f !== undefined && f !== null && typeof f === "object" && "value" in f;
}

export function readSubtableRows(record: KintoneRecord, tableCode: string): SubtableRow[] | null {
  if (!hasField(record, tableCode)) return null;
  const v = record[tableCode]?.value;
  if (!Array.isArray(v)) return null;
  return v as SubtableRow[];
}

export function cellString(row: SubtableRow, code: string): string {
  const v = row.value?.[code]?.value;
  return typeof v === "string" ? v : "";
}

// ISO 8601 UTC（ミリ秒なし）。kintone の日時フィールドの形式。
export function toKintoneDatetime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

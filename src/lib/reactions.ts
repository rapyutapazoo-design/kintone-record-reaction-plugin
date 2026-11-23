import { AppError } from "./errors";
import type { TableMapping } from "./fields";
import { activeReactions, buildRxLabel, KEY_PATTERN, type ReactionConfig, type ReactionDef } from "./reactionConfig";
import { cellString, readSubtableRows, toKintoneDatetime, type KintoneRecord, type PutRecord, type SubtableRow } from "./record";

export const MAX_TABLE_ROWS = 5000;

export interface ReactionEntry {
  rowId: string | null;
  userCode: string;
  userName: string;
  key: string;
  at: string;
}

export interface ToggleUpdate {
  record: PutRecord;
  reacted: boolean;
  rowsAfter: SubtableRow[];
  counts: Record<string, number>;
}

function entriesFromRows(rows: SubtableRow[], m: TableMapping): ReactionEntry[] {
  const out: ReactionEntry[] = [];
  for (const row of rows) {
    const userCode = cellString(row, m.userCode);
    const key = cellString(row, m.key);
    if (userCode === "" || !KEY_PATTERN.test(key)) continue;
    out.push({
      rowId: typeof row.id === "string" && row.id !== "" ? row.id : null,
      userCode,
      userName: cellString(row, m.userName),
      key,
      at: cellString(row, m.at),
    });
  }
  return out;
}

export function readEntries(record: KintoneRecord, m: TableMapping): ReactionEntry[] | null {
  const rows = readSubtableRows(record, m.table);
  if (rows === null) return null;
  return entriesFromRows(rows, m);
}

export function isReacted(entries: ReactionEntry[], userCode: string, key: string): boolean {
  return entries.some((e) => e.userCode === userCode && e.key === key);
}

export function countByKey(entries: ReactionEntry[], keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  for (const e of entries) {
    if (Object.prototype.hasOwnProperty.call(out, e.key)) out[e.key] = (out[e.key] ?? 0) + 1;
  }
  return out;
}

export function usersForKey(entries: ReactionEntry[], key: string, max: number): { names: string[]; more: number } {
  const all = entries.filter((e) => e.key === key).map((e) => (e.userName !== "" ? e.userName : e.userCode));
  return { names: all.slice(0, Math.max(0, max)), more: Math.max(0, all.length - Math.max(0, max)) };
}

export function buildToggleUpdate(input: {
  record: KintoneRecord;
  config: ReactionConfig;
  user: { code: string; name: string };
  def: ReactionDef;
  now: Date;
  maxRows?: number;
}): ToggleUpdate {
  const { config, user, def } = input;
  const m = config.mapping;
  const rows = readSubtableRows(input.record, m.table);
  if (rows === null) throw new AppError("CONFIG_MISMATCH");

  const isMine = (row: SubtableRow): boolean => cellString(row, m.userCode) === user.code && cellString(row, m.key) === def.key;
  const reacted = !rows.some(isMine);

  const kept: SubtableRow[] = [];
  for (const row of rows) {
    if (!reacted && isMine(row)) continue;
    const value: SubtableRow["value"] = {};
    for (const col of [m.userCode, m.userName, m.key, m.label, m.at]) {
      value[col] = { value: row.value?.[col]?.value ?? "" };
    }
    const out: SubtableRow = { value };
    if (row.id !== undefined) out.id = row.id;
    kept.push(out);
  }
  const rowsAfter = kept;
  if (reacted) {
    rowsAfter.push({
      value: {
        [m.userCode]: { value: user.code },
        [m.userName]: { value: user.name },
        [m.key]: { value: def.key },
        [m.label]: { value: buildRxLabel(def) },
        [m.at]: { value: toKintoneDatetime(input.now) },
      },
    });
  }
  if (reacted && rowsAfter.length > (input.maxRows ?? MAX_TABLE_ROWS)) throw new AppError("ROW_LIMIT");

  const active = activeReactions(config);
  const counts = countByKey(entriesFromRows(rowsAfter, m), active.map((r) => r.key));
  const record: PutRecord = {};
  for (const r of active) {
    if (r.countField !== "") record[r.countField] = { value: String(counts[r.key] ?? 0) };
  }
  record[m.table] = { value: rowsAfter };
  return { record, reacted, rowsAfter, counts };
}

// 押下後の最新状態を手元で再現する（新規行は id なし）。
export function applyUpdateToRecord(record: KintoneRecord, update: ToggleUpdate): KintoneRecord {
  const out: KintoneRecord = { ...record };
  for (const [code, v] of Object.entries(update.record)) {
    out[code] = { ...(record[code] ?? {}), value: v.value };
  }
  return out;
}

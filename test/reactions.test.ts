import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import { DEFAULT_MAPPING } from "../src/lib/fields";
import { defaultConfig, type ReactionConfig } from "../src/lib/reactionConfig";
import { applyUpdateToRecord, buildToggleUpdate, countByKey, isReacted, readEntries, usersForKey } from "../src/lib/reactions";
import { readSubtableRows } from "../src/lib/record";
import { makeRecord, makeRow } from "./helpers/records";

const M = DEFAULT_MAPPING;
const NOW = new Date("2026-05-06T07:08:09.123Z");
const me = { code: "me", name: "私" };

function config(): ReactionConfig {
  const c = defaultConfig(M);
  c.reactions[0]!.countField = "cnt_like";
  c.reactions[1]!.countField = "cnt_favorite";
  return c;
}
const like = (c: ReactionConfig) => c.reactions[0]!;

describe("readEntries etc.", () => {
  it("不正キーと空 userCode の行は除外、テーブルが無ければ null", () => {
    const rec = makeRecord({
      rows: [
        makeRow("1", { userCode: "a", key: "like" }),
        makeRow("2", { userCode: "", key: "like" }),
        makeRow("3", { userCode: "b", key: "BAD KEY" }),
      ],
    });
    expect(readEntries(rec, M)?.map((e) => e.rowId)).toEqual(["1"]);
    expect(readEntries(makeRecord({ omitTable: true }), M)).toBeNull();
  });
  it("countByKey は渡したキーだけ数える", () => {
    const e = readEntries(
      makeRecord({ rows: [makeRow("1", { userCode: "a", key: "like" }), makeRow("2", { userCode: "b", key: "old" })] }),
      M
    )!;
    expect(countByKey(e, ["like", "favorite"])).toEqual({ like: 1, favorite: 0 });
    expect(isReacted(e, "a", "like")).toBe(true);
    expect(isReacted(e, "a", "old")).toBe(false);
  });
  it("usersForKey", () => {
    const e = readEntries(
      makeRecord({
        rows: [
          makeRow("1", { userCode: "a", userName: "A", key: "like" }),
          makeRow("2", { userCode: "b", userName: "", key: "like" }),
          makeRow("3", { userCode: "c", userName: "C", key: "like" }),
        ],
      }),
      M
    )!;
    expect(usersForKey(e, "like", 2)).toEqual({ names: ["A", "b"], more: 1 });
    expect(usersForKey(e, "like", 10)).toEqual({ names: ["A", "b", "C"], more: 0 });
  });
});

describe("buildToggleUpdate", () => {
  it("追加: 新規行に id が無く、形式が正しい。既存行は id 付きで温存", () => {
    const c = config();
    const rec = makeRecord({ rows: [makeRow("10", { userCode: "x", userName: "X", key: "like", label: "L", at: "2026-01-01T00:00:00Z" })] });
    const u = buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW });
    expect(u.reacted).toBe(true);
    const rows = u.record[M.table]!.value as { id?: string; value: Record<string, { value: unknown }> }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe("10");
    expect(rows[1]!.id).toBeUndefined();
    expect(rows[1]!.value[M.label]!.value).toBe("👍 いいね");
    expect(rows[1]!.value[M.at]!.value).toBe("2026-05-06T07:08:09Z");
    expect(rows[1]!.value[M.userCode]!.value).toBe("me");
    expect(rows[1]!.value[M.key]!.value).toBe("like");
    expect(Object.keys(rows[0]!.value).sort()).toEqual([M.at, M.key, M.label, M.userCode, M.userName].sort());
  });
  it("削除: 本人行だけ消える（重複も全部）。他人・停止中・不正キーは残る", () => {
    const c = config();
    c.reactions[3]!.enabled = false;
    const rec = makeRecord({
      rows: [
        makeRow("1", { userCode: "me", key: "like" }),
        makeRow("2", { userCode: "other", key: "like" }),
        makeRow("3", { userCode: "me", key: "like" }),
        makeRow("4", { userCode: "me", key: "interested" }),
        makeRow("5", { userCode: "me", key: "BAD" }),
        makeRow("6", { userCode: "me", key: "favorite" }),
      ],
    });
    const u = buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW });
    expect(u.reacted).toBe(false);
    expect(u.rowsAfter.map((r) => r.id)).toEqual(["2", "4", "5", "6"]);
  });
  it("別画面で付与済みなら削除側になる", () => {
    const c = config();
    const rec = makeRecord({ rows: [makeRow("1", { userCode: "me", key: "like" })] });
    expect(buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW }).reacted).toBe(false);
  });
  it("回数欄: 割当ありのボタンだけ全ボタン分を再計算し、割当なし・停止中には触れない", () => {
    const c = config();
    c.reactions[2]!.countField = "cnt_want";
    c.reactions[2]!.enabled = false;
    const rec = makeRecord({
      rows: [makeRow("1", { userCode: "o", key: "favorite" }), makeRow("2", { userCode: "p", key: "favorite" })],
    });
    const u = buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW });
    expect(u.record.cnt_like).toEqual({ value: "1" });
    expect(u.record.cnt_favorite).toEqual({ value: "2" });
    expect(u.record.cnt_want).toBeUndefined();
    expect(Object.keys(u.record).sort()).toEqual(["cnt_favorite", "cnt_like", "reactions"]);
  });
  it("行数上限を超えると ROW_LIMIT", () => {
    const c = config();
    const rec = makeRecord({ rows: [makeRow("1", { userCode: "o", key: "like" })] });
    expect(() => buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW, maxRows: 1 })).toThrow(
      expect.objectContaining({ code: "ROW_LIMIT" })
    );
    expect(() => buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW, maxRows: 2 })).not.toThrow();
  });
  it("取り消しは上限超過状態でも ROW_LIMIT にならず、追加は拒否される", () => {
    const c = config();
    const rec = makeRecord({
      rows: [makeRow("1", { userCode: "me", key: "like" }), makeRow("2", { userCode: "o", key: "like" }), makeRow("3", { userCode: "p", key: "like" })],
    });
    const u = buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW, maxRows: 1 });
    expect(u.reacted).toBe(false);
    expect(u.rowsAfter).toHaveLength(2);
    const fav = c.reactions.find((r) => r.key === "favorite")!;
    expect(() => buildToggleUpdate({ record: rec, config: c, user: me, def: fav, now: NOW, maxRows: 3 })).toThrow(
      expect.objectContaining({ code: "ROW_LIMIT" })
    );
  });
  it("テーブルが無ければ CONFIG_MISMATCH", () => {
    const c = config();
    let err: unknown;
    try {
      buildToggleUpdate({ record: makeRecord({ omitTable: true }), config: c, user: me, def: like(c), now: NOW });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("CONFIG_MISMATCH");
  });
  it("applyUpdateToRecord は更新後の状態と一致する", () => {
    const c = config();
    const rec = makeRecord({ rows: [makeRow("1", { userCode: "o", key: "like" })], counts: { cnt_like: 1 } });
    const u = buildToggleUpdate({ record: rec, config: c, user: me, def: like(c), now: NOW });
    const after = applyUpdateToRecord(rec, u);
    expect(readSubtableRows(after, M.table)).toEqual(u.rowsAfter);
    expect(after.cnt_like?.value).toBe("2");
    expect(readEntries(after, M)?.find((e) => e.userCode === "me")?.rowId).toBeNull();
    expect(rec.cnt_like?.value).toBe("1");
  });
});

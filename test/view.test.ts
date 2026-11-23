import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING } from "../src/lib/fields";
import { defaultConfig, HEADER_SPACE, type ReactionConfig } from "../src/lib/reactionConfig";
import { buildBars, chipAriaLabel, chipTitle, formatCount, optimisticToggle, type BarView, type ChipView } from "../src/lib/view";
import { makeRecord, makeRow } from "./helpers/records";

const rows = [
  makeRow("1", { userCode: "me", userName: "私", key: "like" }),
  makeRow("2", { userCode: "a", userName: "A", key: "like" }),
  makeRow("3", { userCode: "b", userName: "B", key: "favorite" }),
];
const chip = (b: BarView[], key: string): ChipView => b.flatMap((x) => x.chips).find((c) => c.key === key)!;
function cfg(): ReactionConfig {
  return defaultConfig(DEFAULT_MAPPING);
}
const noTable = makeRecord({ omitTable: true });

describe("buildBars: 回数", () => {
  it("回数欄割当あり: eventRecord に回数欄があれば数値、無ければ null", () => {
    const c = cfg();
    c.reactions[0]!.countField = "cnt_like";
    const withCnt = makeRecord({ omitTable: true, counts: { cnt_like: 7 } });
    expect(chip(buildBars({ config: c, eventRecord: withCnt, latestRecord: null, userCode: "me" }), "like").count).toBe(7);
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: null, userCode: "me" }), "like").count).toBeNull();
  });
  it("回数欄割当あり + latestRecord: 行数が真実", () => {
    const c = cfg();
    c.reactions[0]!.countField = "cnt_like";
    const ev = makeRecord({ omitTable: true, counts: { cnt_like: 7 } });
    const latest = makeRecord({ rows });
    expect(chip(buildBars({ config: c, eventRecord: ev, latestRecord: latest, userCode: "me" }), "like").count).toBe(2);
  });
  it("回数欄割当なし: eventRecord にテーブルがあれば数値、無ければ null", () => {
    const c = cfg();
    expect(chip(buildBars({ config: c, eventRecord: makeRecord({ rows }), latestRecord: null, userCode: "me" }), "like").count).toBe(2);
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: makeRecord({ rows }), userCode: "me" }), "like").count).toBeNull();
  });
  it("showCount false なら全部 null", () => {
    const c = cfg();
    c.display.showCount = false;
    c.reactions[0]!.countField = "cnt_like";
    const ev = makeRecord({ rows, counts: { cnt_like: 3 } });
    const bars = buildBars({ config: c, eventRecord: ev, latestRecord: null, userCode: "me" });
    expect(bars.flatMap((b) => b.chips).every((x) => x.count === null)).toBe(true);
  });
});

describe("buildBars: users / reacted", () => {
  it("listMode none なら null、テーブル権限が無ければ null", () => {
    const c = cfg();
    const ev = makeRecord({ rows });
    expect(chip(buildBars({ config: c, eventRecord: ev, latestRecord: null, userCode: "me" }), "like").users).toEqual({ names: ["私", "A"], more: 0 });
    c.display.listMode = "none";
    expect(chip(buildBars({ config: c, eventRecord: ev, latestRecord: null, userCode: "me" }), "like").users).toBeNull();
    c.display.listMode = "chips";
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: makeRecord({ rows }), userCode: "me" }), "like").users).toBeNull();
  });
  it("reacted は latestRecord から判定、権限が無く latest も無ければ false", () => {
    const c = cfg();
    const latest = makeRecord({ rows });
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: latest, userCode: "me" }), "like").reacted).toBe(true);
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: latest, userCode: "me" }), "favorite").reacted).toBe(false);
    expect(chip(buildBars({ config: c, eventRecord: noTable, latestRecord: null, userCode: "me" }), "like").reacted).toBe(false);
    expect(chip(buildBars({ config: c, eventRecord: makeRecord({ rows }), latestRecord: null, userCode: "me" }), "like").reacted).toBe(true);
  });
});

describe("buildBars: 配置先", () => {
  it("配置先ごとにまとまり、設定順を保ち、停止中は除外", () => {
    const c = cfg();
    c.defaultSpaceId = "common";
    c.reactions[1]!.spaceId = "own";
    c.reactions[2]!.enabled = false;
    const bars = buildBars({ config: c, eventRecord: makeRecord({ rows }), latestRecord: null, userCode: "me" });
    expect(bars.map((b) => b.spaceId)).toEqual(["common", "own"]);
    expect(bars[0]!.chips.map((x) => x.key)).toEqual(["like", "interested"]);
    expect(bars[1]!.chips.map((x) => x.key)).toEqual(["favorite"]);
  });
  it("HEADER_SPACE は共通の配置先がスペースでもヘッダー('')になる", () => {
    const c = cfg();
    c.defaultSpaceId = "common";
    c.reactions[1]!.spaceId = HEADER_SPACE;
    const bars = buildBars({ config: c, eventRecord: makeRecord({ rows }), latestRecord: null, userCode: "me" });
    expect(bars.map((b) => b.spaceId)).toEqual(["common", ""]);
    expect(bars[1]!.chips.map((x) => x.key)).toEqual(["favorite"]);
  });
});

describe("optimisticToggle", () => {
  const base = (): BarView[] => [
    {
      spaceId: "",
      chips: [
        { key: "like", emoji: "👍", label: "いいね", color: "blue", reacted: false, count: 0, users: { names: [], more: 0 }, confetti: false },
        { key: "fav", emoji: "⭐", label: "お気に入り", color: "orange", reacted: true, count: null, users: null, confetti: false },
      ],
    },
  ];
  it("付ける: reacted 反転、count+1、users に本人を追加。入力は不変", () => {
    const b = base();
    const out = optimisticToggle(b, "like", "私");
    expect(out[0]!.chips[0]).toMatchObject({ reacted: true, count: 1, users: { names: ["私"] } });
    expect(b[0]!.chips[0]).toMatchObject({ reacted: false, count: 0, users: { names: [] } });
  });
  it("count が null なら null のまま、0 未満にならない、取り消しで users から除去", () => {
    const out = optimisticToggle(base(), "fav", "私");
    expect(out[0]!.chips[1]).toMatchObject({ reacted: false, count: null, users: null });
    const b = optimisticToggle(base(), "like", "私");
    const back = optimisticToggle(b, "like", "私");
    expect(back[0]!.chips[0]).toMatchObject({ reacted: false, count: 0, users: { names: [] } });
    const z = base();
    z[0]!.chips[0]!.reacted = true;
    expect(optimisticToggle(z, "like", "私")[0]!.chips[0]!.count).toBe(0);
  });
});

describe("optimisticToggle: maxListUsers 境界", () => {
  const bar = (names: string[], more: number, reacted: boolean): BarView[] => [
    { spaceId: "", chips: [{ key: "like", emoji: "👍", label: "いいね", color: "blue", reacted, count: names.length + more, users: { names, more }, confetti: false }] },
  ];
  it("本人が more 側にいる取り消しでは more が減り names は変わらない", () => {
    const out = optimisticToggle(bar(["A", "B"], 2, true), "like", "私", 2);
    expect(out[0]!.chips[0]!.users).toEqual({ names: ["A", "B"], more: 1 });
  });
  it("names が max 以上のとき付与は more を増やす", () => {
    const out = optimisticToggle(bar(["A", "B"], 0, false), "like", "私", 2);
    expect(out[0]!.chips[0]!.users).toEqual({ names: ["A", "B"], more: 1 });
  });
  it("max 未満なら names に追加、本人が names にいれば取り消しで除去", () => {
    const added = optimisticToggle(bar(["A"], 0, false), "like", "私", 2);
    expect(added[0]!.chips[0]!.users).toEqual({ names: ["A", "私"], more: 0 });
    const removed = optimisticToggle(bar(["A", "私"], 3, true), "like", "私", 2);
    expect(removed[0]!.chips[0]!.users).toEqual({ names: ["A"], more: 3 });
  });
  it("more は 0 未満にならない", () => {
    const out = optimisticToggle(bar(["A"], 0, true), "like", "私", 2);
    expect(out[0]!.chips[0]!.users).toEqual({ names: ["A"], more: 0 });
  });
});

describe("文言", () => {
  const c: ChipView = { key: "like", emoji: "👍", label: "いいね", color: "blue", reacted: true, count: 12, users: { names: ["山田", "佐藤"], more: 3 }, confetti: false };
  it("chipAriaLabel", () => {
    expect(chipAriaLabel(c)).toBe("👍 いいね、12件、付けています");
    expect(chipAriaLabel({ ...c, count: null, reacted: false })).toBe("👍 いいね、付けていません");
  });
  it("chipTitle", () => {
    expect(chipTitle(c)).toBe("いいね: 山田, 佐藤 ほか3人");
    expect(chipTitle({ ...c, users: { names: ["山田"], more: 0 } })).toBe("いいね: 山田");
    expect(chipTitle({ ...c, users: null })).toBe("いいね");
  });
  it("formatCount", () => {
    expect(formatCount(null)).toBe("");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("999+");
  });
});

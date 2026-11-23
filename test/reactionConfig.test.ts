import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING } from "../src/lib/fields";
import {
  buildRxLabel,
  defaultConfig,
  defaultReactions,
  HEADER_SPACE,
  moveItem,
  newReactionDef,
  parseConfig,
  presetCountFields,
  resolveRuntimeConfig,
  serializeConfig,
  validateConfig,
  type ReactionConfig,
} from "../src/lib/reactionConfig";
import { makeFieldsResponse } from "./helpers/records";

const resp = makeFieldsResponse({ numberFields: ["cnt_like", "cnt_favorite", "other"] });
const base = (): ReactionConfig => defaultConfig(DEFAULT_MAPPING);
const rows = (c: ReactionConfig) => c.reactions.map((): { originalKey: string | null } => ({ originalKey: null }));
const errs = (c: ReactionConfig, r = rows(c)) => validateConfig(c, resp, r);

describe("defaults", () => {
  it("defaultReactions", () => {
    const a = defaultReactions();
    expect(a.map((r) => r.key)).toEqual(["like", "favorite", "want_to_go", "interested"]);
    expect(defaultReactions()[0]).not.toBe(a[0]);
  });
  it("presetCountFields は cnt_<key> が NUMBER で存在するときだけ割り当てる", () => {
    const out = presetCountFields(defaultReactions(), resp);
    expect(out.map((r) => r.countField)).toEqual(["cnt_like", "cnt_favorite", "", ""]);
  });
});

describe("parseConfig", () => {
  const ok = JSON.stringify(base());
  it("EMPTY / INVALID_JSON", () => {
    expect(parseConfig(undefined)).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseConfig("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseConfig("{")).toEqual({ ok: false, reason: "INVALID_JSON" });
  });
  it("INVALID_SHAPE", () => {
    const shape = { ok: false, reason: "INVALID_SHAPE" };
    expect(parseConfig("[]")).toEqual(shape);
    expect(parseConfig(JSON.stringify({ ...base(), reactions: "x" }))).toEqual(shape);
    expect(parseConfig(JSON.stringify({ ...base(), reactions: [] }))).toEqual(shape);
    const many = Array.from({ length: 13 }, (_, i) => ({ ...defaultReactions()[0], key: `k${i}` }));
    expect(parseConfig(JSON.stringify({ ...base(), reactions: many }))).toEqual(shape);
    const dup = [defaultReactions()[0], defaultReactions()[0]];
    expect(parseConfig(JSON.stringify({ ...base(), reactions: dup }))).toEqual(shape);
    expect(parseConfig(JSON.stringify({ ...base(), reactions: [{ ...defaultReactions()[0], key: "Bad" }] }))).toEqual(shape);
    expect(parseConfig(JSON.stringify({ ...base(), mapping: { ...DEFAULT_MAPPING, at: 1 } }))).toEqual(shape);
  });
  it("未知の色は既定色、display を補完、maxListUsers を丸める", () => {
    const c = JSON.parse(ok);
    c.reactions[1].color = "pink";
    delete c.display.showCount;
    c.display.maxListUsers = 500;
    const r = parseConfig(JSON.stringify(c));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.reactions[1]?.color).toBe("orange");
      expect(r.config.display.showCount).toBe(true);
      expect(r.config.display.maxListUsers).toBe(100);
    }
    delete c.display;
    const r2 = parseConfig(JSON.stringify(c));
    expect(r2.ok && r2.config.display).toEqual({ showCount: true, listMode: "chips", maxListUsers: 20 });
  });
  it("serialize と parse の往復", () => {
    const c = base();
    const r = parseConfig(serializeConfig(c));
    expect(r).toEqual({ ok: true, config: c });
  });
  it("resolveRuntimeConfig", () => {
    expect(resolveRuntimeConfig({ config: ok })).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(resolveRuntimeConfig({ recordApiUrl: "u", config: "{bad" })).toEqual({ ok: false, reason: "INVALID" });
    expect(resolveRuntimeConfig({ recordApiUrl: "u", config: ok }).ok).toBe(true);
  });
});

describe("HEADER_SPACE", () => {
  it("parse で個別配置先は保持され、defaultSpaceId の HEADER は '' に正規化される", () => {
    const c = base();
    c.reactions[0]!.spaceId = HEADER_SPACE;
    c.defaultSpaceId = HEADER_SPACE;
    const r = parseConfig(JSON.stringify(c));
    expect(r.ok && r.config.reactions[0]!.spaceId).toBe(HEADER_SPACE);
    expect(r.ok && r.config.defaultSpaceId).toBe("");
  });
  it("validate は HEADER_SPACE を許可し、他の予約値(__ 始まり)を拒否する", () => {
    const c = base();
    c.reactions[0]!.spaceId = HEADER_SPACE;
    expect(errs(c)).toEqual([]);
    c.reactions[0]!.spaceId = "__other__";
    expect(errs(c).some((e) => e.path === "reactions.0")).toBe(true);
  });
});

describe("buildRxLabel", () => {
  it("60書記素に切り詰める", () => {
    const d = { ...defaultReactions()[0]!, label: "あ".repeat(100) };
    expect(Array.from(buildRxLabel(d)).length).toBe(60);
    expect(buildRxLabel(defaultReactions()[0]!)).toBe("👍 いいね");
  });
});

describe("validateConfig", () => {
  it("正常系はエラー 0 件", () => {
    expect(errs(base())).toEqual([]);
  });
  it("キー正規表現の境界", () => {
    const c = base();
    c.reactions[0]!.key = "a".repeat(32);
    expect(errs(c)).toEqual([]);
    c.reactions[0]!.key = "a".repeat(33);
    expect(errs(c).length).toBe(1);
    c.reactions[0]!.key = "1abc";
    expect(errs(c).length).toBe(1);
    c.reactions[0]!.key = "Abc";
    expect(errs(c).length).toBe(1);
  });
  it("キー重複", () => {
    const c = base();
    c.reactions[1]!.key = "like";
    expect(errs(c).some((e) => e.message.includes("重複"))).toBe(true);
  });
  it("保存済みキーの変更", () => {
    const c = base();
    c.reactions[0]!.key = "like2";
    const r = rows(c);
    r[0] = { originalKey: "like" };
    expect(errs(c, r).some((e) => e.message.includes("変更できません"))).toBe(true);
  });
  it("絵文字 0 個と 5 個", () => {
    const c = base();
    c.reactions[0]!.emoji = " ";
    expect(errs(c).length).toBe(1);
    c.reactions[0]!.emoji = "👍👍👍👍👍";
    expect(errs(c).length).toBe(1);
    c.reactions[0]!.emoji = "👍👍👍👍";
    expect(errs(c)).toEqual([]);
  });
  it("表示名 21 文字", () => {
    const c = base();
    c.reactions[0]!.label = "あ".repeat(21);
    expect(errs(c).length).toBe(1);
    c.reactions[0]!.label = "あ".repeat(20);
    expect(errs(c)).toEqual([]);
  });
  it("回数欄: 重複・NUMBER 以外・存在しない", () => {
    const c = base();
    c.reactions[0]!.countField = "cnt_like";
    c.reactions[1]!.countField = "cnt_like";
    expect(errs(c).some((e) => e.message.includes("複数のボタン"))).toBe(true);
    c.reactions[1]!.countField = "title";
    expect(errs(c).length).toBe(1);
    c.reactions[1]!.countField = "ghost";
    expect(errs(c).length).toBe(1);
    c.reactions[1]!.countField = "";
    expect(errs(c)).toEqual([]);
  });
  it("maxListUsers 0 と 101", () => {
    const c = base();
    c.display.maxListUsers = 0;
    expect(errs(c).length).toBe(1);
    c.display.maxListUsers = 101;
    expect(errs(c).length).toBe(1);
    c.display.maxListUsers = 100;
    expect(errs(c)).toEqual([]);
  });
});

describe("編集補助", () => {
  it("moveItem", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
    const a = [1, 2];
    expect(moveItem(a, 0, 5)).not.toBe(a);
  });
  it("newReactionDef は未使用の最小番号", () => {
    expect(newReactionDef([], 0).key).toBe("reaction_1");
    expect(newReactionDef(["reaction_1", "reaction_3"], 1).key).toBe("reaction_2");
  });
});

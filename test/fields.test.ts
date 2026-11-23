import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, listNumberFields, listSubtableColumns, listSubtables, presetMapping, validateMapping } from "../src/lib/fields";
import { makeFieldsResponse } from "./helpers/records";

describe("fields", () => {
  const resp = makeFieldsResponse({ numberFields: ["cnt_like"] });
  it("listSubtables / listSubtableColumns / listNumberFields", () => {
    expect(listSubtables(resp).map((f) => f.code)).toEqual(["reactions"]);
    expect(listSubtableColumns(resp, "reactions", "DATETIME").map((f) => f.code)).toEqual(["rx_at"]);
    expect(listSubtableColumns(resp, "reactions", "SINGLE_LINE_TEXT")).toHaveLength(4);
    expect(listSubtableColumns(resp, "title", "SINGLE_LINE_TEXT")).toEqual([]);
    expect(listNumberFields(resp).map((f) => f.code)).toEqual(["cnt_like"]);
  });
  it("presetMapping: 既定構成なら自動で埋まる", () => {
    expect(presetMapping(resp, null)).toEqual(DEFAULT_MAPPING);
  });
  it("presetMapping: 保存値を優先する", () => {
    const r = makeFieldsResponse();
    r.properties.reactions!.fields!.alt = { type: "SINGLE_LINE_TEXT", code: "alt", label: "alt" };
    const saved = { ...DEFAULT_MAPPING, userName: "alt" };
    expect(presetMapping(r, saved).userName).toBe("alt");
  });
  it("presetMapping: 保存値の型違いは既定にフォールバックする", () => {
    const saved = { ...DEFAULT_MAPPING, at: "rx_user_code" };
    expect(presetMapping(resp, saved).at).toBe("rx_at");
  });
  it("presetMapping: 何も無ければ空", () => {
    expect(presetMapping(makeFieldsResponse({ noTable: true }), null)).toEqual({
      table: "",
      userCode: "",
      userName: "",
      key: "",
      label: "",
      at: "",
    });
  });
  it("validateMapping", () => {
    expect(validateMapping(resp, DEFAULT_MAPPING)).toEqual([]);
    expect(validateMapping(resp, { ...DEFAULT_MAPPING, table: "nope" })).not.toEqual([]);
    expect(validateMapping(resp, { ...DEFAULT_MAPPING, at: "rx_key" }).length).toBeGreaterThan(0);
    expect(validateMapping(resp, { ...DEFAULT_MAPPING, userName: "rx_user_code" }).length).toBeGreaterThan(0);
  });
});

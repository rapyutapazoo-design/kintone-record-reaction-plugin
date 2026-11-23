import { describe, expect, it } from "vitest";
import { cellString, hasField, readSubtableRows, toKintoneDatetime } from "../src/lib/record";
import { makeRecord, makeRow } from "./helpers/records";

describe("record", () => {
  it("hasField", () => {
    const r = makeRecord();
    expect(hasField(r, "title")).toBe(true);
    expect(hasField(r, "nope")).toBe(false);
  });
  it("readSubtableRows: 無い・配列でない場合は null", () => {
    expect(readSubtableRows(makeRecord({ omitTable: true }), "reactions")).toBeNull();
    expect(readSubtableRows({ reactions: { value: "x" } }, "reactions")).toBeNull();
    expect(readSubtableRows(makeRecord(), "reactions")).toEqual([]);
  });
  it("cellString", () => {
    const row = makeRow("1", { userCode: "u", key: "like" });
    expect(cellString(row, "rx_user_code")).toBe("u");
    expect(cellString(row, "missing")).toBe("");
    expect(cellString({ value: { a: { value: 3 } } }, "a")).toBe("");
  });
  it("toKintoneDatetime はミリ秒を除去して Z で終わる", () => {
    expect(toKintoneDatetime(new Date("2026-03-04T05:06:07.890Z"))).toBe("2026-03-04T05:06:07Z");
  });
});

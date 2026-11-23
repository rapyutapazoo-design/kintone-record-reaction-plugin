import { describe, expect, it } from "vitest";
import { extractSpacers } from "../src/lib/layout";

describe("extractSpacers", () => {
  it("ROW 直下の SPACER を収集する", () => {
    const layout = [
      { type: "ROW", fields: [{ type: "SPACER", elementId: "sp1" }, { type: "LABEL" }] },
    ];
    expect(extractSpacers(layout)).toEqual([{ elementId: "sp1" }]);
  });

  it("GROUP 内 ROW の SPACER を再帰的に収集する", () => {
    const layout = [
      {
        type: "GROUP",
        code: "grp",
        layout: [{ type: "ROW", fields: [{ type: "SPACER", elementId: "sp-in-group" }] }],
      },
    ];
    expect(extractSpacers(layout)).toEqual([{ elementId: "sp-in-group" }]);
  });

  it("SUBTABLE 内の SPACER も収集する", () => {
    const layout = [{ type: "SUBTABLE", fields: [{ type: "SPACER", elementId: "sp-sub" }] }];
    expect(extractSpacers(layout)).toEqual([{ elementId: "sp-sub" }]);
  });

  it("elementId が空の SPACER は除外する", () => {
    const layout = [{ type: "ROW", fields: [{ type: "SPACER", elementId: "" }] }];
    expect(extractSpacers(layout)).toEqual([]);
  });

  it("重複する elementId は1件にまとめる（出現順維持）", () => {
    const layout = [
      { type: "ROW", fields: [{ type: "SPACER", elementId: "sp1" }] },
      { type: "ROW", fields: [{ type: "SPACER", elementId: "sp2" }, { type: "SPACER", elementId: "sp1" }] },
    ];
    expect(extractSpacers(layout)).toEqual([{ elementId: "sp1" }, { elementId: "sp2" }]);
  });

  it("{ layout } オブジェクトも受け付ける", () => {
    const resp = { layout: [{ type: "ROW", fields: [{ type: "SPACER", elementId: "sp1" }] }] };
    expect(extractSpacers(resp)).toEqual([{ elementId: "sp1" }]);
  });

  it("不正入力（null・非配列）は空配列", () => {
    expect(extractSpacers(null)).toEqual([]);
    expect(extractSpacers(undefined)).toEqual([]);
    expect(extractSpacers("not-an-array")).toEqual([]);
    expect(extractSpacers(42)).toEqual([]);
  });
});

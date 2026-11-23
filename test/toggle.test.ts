import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
import { DEFAULT_MAPPING } from "../src/lib/fields";
import { defaultConfig } from "../src/lib/reactionConfig";
import { toggleReaction, type ToggleDeps } from "../src/lib/toggle";
import { makeRecord, makeRow } from "./helpers/records";

class Conflict extends Error {}
const config = defaultConfig(DEFAULT_MAPPING);
const user = { code: "me", name: "私" };
const def = config.reactions[0]!;

function deps(over: Partial<ToggleDeps> = {}): ToggleDeps & { sleep: ReturnType<typeof vi.fn>; putRecord: ReturnType<typeof vi.fn>; getRecord: ReturnType<typeof vi.fn> } {
  let rev = 0;
  return {
    getRecord: vi.fn(async () => ({ record: makeRecord({ rows: [makeRow("1", { userCode: "o", key: "like" })] }), revision: String(++rev) })),
    putRecord: vi.fn(async () => undefined),
    isConflict: (e: unknown) => e instanceof Conflict,
    now: () => new Date("2026-01-01T00:00:00Z"),
    sleep: vi.fn(async () => undefined),
    random: () => 0,
    ...over,
  } as never;
}

describe("toggleReaction", () => {
  it("1回目で成功する", async () => {
    const d = deps();
    const r = await toggleReaction(d, config, user, def);
    expect(r.reacted).toBe(true);
    expect(d.putRecord).toHaveBeenCalledTimes(1);
    expect(d.sleep).not.toHaveBeenCalled();
  });
  it("競合2回のあと成功する（毎回 GET し新しい revision で PUT）", async () => {
    let n = 0;
    const d = deps({
      putRecord: vi.fn(async () => {
        n += 1;
        if (n <= 2) throw new Conflict();
      }),
    });
    await toggleReaction(d, config, user, def);
    expect(d.getRecord).toHaveBeenCalledTimes(3);
    expect((d.putRecord as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(["1", "2", "3"]);
  });
  it("5回競合したら CONFLICT、sleep は 4 回", async () => {
    const d = deps({ putRecord: vi.fn(async () => { throw new Conflict(); }) });
    await expect(toggleReaction(d, config, user, def)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(d.getRecord).toHaveBeenCalledTimes(5);
    expect(d.sleep).toHaveBeenCalledTimes(4);
  });
  it("jitter が適用される", async () => {
    const d = deps({ putRecord: vi.fn(async () => { throw new Conflict(); }), random: () => 1 });
    await expect(toggleReaction(d, config, user, def)).rejects.toBeInstanceOf(AppError);
    expect(d.sleep.mock.calls.map((c) => c[0])).toEqual([225, 450, 900, 1500]);
  });
  it("TOKEN は再試行しない", async () => {
    const d = deps({ putRecord: vi.fn(async () => { throw new AppError("TOKEN"); }) });
    await expect(toggleReaction(d, config, user, def)).rejects.toMatchObject({ code: "TOKEN" });
    expect(d.putRecord).toHaveBeenCalledTimes(1);
    expect(d.sleep).not.toHaveBeenCalled();
  });
  it("ROW_LIMIT は PUT せずに失敗する", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => makeRow(String(i), { userCode: `u${i}`, key: "favorite" }));
    const d = deps({ getRecord: vi.fn(async () => ({ record: makeRecord({ rows }), revision: "1" })) });
    await expect(toggleReaction(d, config, user, def)).rejects.toMatchObject({ code: "ROW_LIMIT" });
    expect(d.putRecord).not.toHaveBeenCalled();
  });
});

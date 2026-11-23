import { describe, expect, it } from "vitest";
import { createSerialQueue } from "../src/lib/queue";

describe("createSerialQueue", () => {
  it("2つのジョブが直列に実行される", async () => {
    const q = createSerialQueue();
    const log: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = q.run(async () => {
      log.push("a:start");
      await wait(20);
      log.push("a:end");
    });
    const b = q.run(async () => {
      log.push("b:start");
      log.push("b:end");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });
  it("前のジョブが失敗しても次が実行される", async () => {
    const q = createSerialQueue();
    const a = q.run(async () => {
      throw new Error("x");
    });
    const b = q.run(async () => "ok");
    await expect(a).rejects.toThrow("x");
    await expect(b).resolves.toBe("ok");
  });
  it("busy の遷移", async () => {
    const q = createSerialQueue();
    expect(q.busy).toBe(false);
    const p = q.run(async () => undefined);
    expect(q.busy).toBe(true);
    await p;
    await Promise.resolve();
    expect(q.busy).toBe(false);
  });
});

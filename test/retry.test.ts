import { describe, expect, it, vi } from "vitest";
import { jitterDelay, withRetry } from "../src/lib/retry";
import { AppError } from "../src/lib/errors";

class RetryableError extends Error {}
class OtherError extends Error {}

describe("withRetry", () => {
  it("succeeds after one retryable failure", async () => {
    let calls = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new RetryableError("conflict");
        return "ok";
      },
      { isRetryable: (e) => e instanceof RetryableError, sleep }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("throws CONFLICT after exhausting attempts on retryable errors", async () => {
    let calls = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new RetryableError("conflict");
        },
        { isRetryable: (e) => e instanceof RetryableError, sleep }
      )
    ).rejects.toThrow(AppError);
    expect(calls).toBe(3);
  });

  it("fails immediately for non-retryable errors", async () => {
    let calls = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new OtherError("nope");
        },
        { isRetryable: (e) => e instanceof RetryableError, sleep }
      )
    ).rejects.toThrow(OtherError);
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("jitter", () => {
  it("sleep に渡る値へ jitter が適用される", async () => {
    let calls = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableError("conflict");
        return "ok";
      },
      { isRetryable: (e) => e instanceof RetryableError, sleep, delaysMs: [100, 300], jitter: (ms) => ms + 1 }
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([101, 301]);
  });

  it("jitterDelay は 0〜+50%", () => {
    expect(jitterDelay(100, () => 0)).toBe(100);
    expect(jitterDelay(100, () => 1)).toBe(150);
  });
});

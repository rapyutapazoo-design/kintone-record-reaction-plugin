import { AppError } from "./errors";

export interface WithRetryOptions {
  maxAttempts?: number;
  isRetryable: (err: unknown) => boolean;
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  jitter?: (ms: number) => number;
}

export function jitterDelay(ms: number, rand: () => number): number {
  return Math.round(ms * (1 + 0.5 * rand()));
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delaysMs = options.delaysMs ?? [100, 300];
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? ((ms: number) => ms);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!options.isRetryable(err) || attempt === maxAttempts) {
        break;
      }
      const delay = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
      await sleep(jitter(delay));
    }
  }

  if (lastErr instanceof AppError && lastErr.code === "CONFLICT") {
    throw lastErr;
  }
  if (options.isRetryable(lastErr)) {
    throw new AppError("CONFLICT");
  }
  throw lastErr;
}

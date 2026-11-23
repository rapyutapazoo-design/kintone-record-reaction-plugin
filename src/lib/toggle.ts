import { jitterDelay, withRetry } from "./retry";
import type { ReactionConfig, ReactionDef } from "./reactionConfig";
import type { KintoneRecord, PutRecord } from "./record";
import { applyUpdateToRecord, buildToggleUpdate } from "./reactions";

export interface ToggleDeps {
  getRecord(): Promise<{ record: KintoneRecord; revision: string }>;
  putRecord(revision: string, record: PutRecord): Promise<void>;
  isConflict(e: unknown): boolean;
  now(): Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const TOGGLE_RETRY = { maxAttempts: 5, delaysMs: [150, 300, 600, 1000] };

export async function toggleReaction(
  deps: ToggleDeps,
  config: ReactionConfig,
  user: { code: string; name: string },
  def: ReactionDef
): Promise<{ record: KintoneRecord; reacted: boolean }> {
  const random = deps.random ?? Math.random;
  return withRetry(
    async () => {
      const { record, revision } = await deps.getRecord();
      const update = buildToggleUpdate({ record, config, user, def, now: deps.now() });
      await deps.putRecord(revision, update.record);
      return { record: applyUpdateToRecord(record, update), reacted: update.reacted };
    },
    {
      ...TOGGLE_RETRY,
      isRetryable: deps.isConflict,
      sleep: deps.sleep,
      jitter: (ms) => jitterDelay(ms, random),
    }
  );
}

import { HEADER_SPACE } from "./reactionConfig";
import type { BarView } from "./view";

// 要求された配置先 ID → 実際の配置 ID。スペースが無ければ ""（ヘッダー）。
export function resolvePlacements(spaceIds: string[], exists: (id: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of spaceIds) out.set(id, id !== "" && id !== HEADER_SPACE && exists(id) ? id : "");
  return out;
}

export function mergeBarsByPlacement(bars: BarView[], placement: Map<string, string>): BarView[] {
  const order: string[] = [];
  const merged = new Map<string, BarView>();
  for (const bar of bars) {
    const actual = placement.get(bar.spaceId) ?? "";
    let target = merged.get(actual);
    if (!target) {
      target = { spaceId: actual, chips: [] };
      merged.set(actual, target);
      order.push(actual);
    }
    target.chips.push(...bar.chips);
  }
  return order.map((id) => merged.get(id) as BarView);
}

import { activeReactions, resolveDefSpace, type ReactionColor, type ReactionConfig, type ReactionTheme } from "./reactionConfig";
import { countByKey, isReacted, readEntries, usersForKey, type ReactionEntry } from "./reactions";
import { hasField, type KintoneRecord } from "./record";

export interface ChipView {
  key: string;
  emoji: string;
  label: string;
  color: ReactionColor;
  theme: ReactionTheme;
  reacted: boolean;
  count: number | null;
  users: { names: string[]; more: number } | null;
  confetti: boolean;
}

export interface BarView {
  spaceId: string; // "" = ヘッダー
  chips: ChipView[];
}

export function buildBars(input: {
  config: ReactionConfig;
  eventRecord: KintoneRecord;
  latestRecord: KintoneRecord | null;
  userCode: string;
}): BarView[] {
  const { config, eventRecord, latestRecord, userCode } = input;
  const m = config.mapping;
  const active = activeReactions(config);
  const tableVisible = hasField(eventRecord, m.table);
  // データ源: 最新レコード（プロキシ由来）があればそれ、無ければ event.record にテーブルがあるときだけそれ。
  const source: ReactionEntry[] | null = latestRecord ? readEntries(latestRecord, m) : tableVisible ? readEntries(eventRecord, m) : null;
  const counts = source ? countByKey(source, active.map((r) => r.key)) : null;

  const order: string[] = [];
  const bars = new Map<string, ChipView[]>();
  for (const def of active) {
    let count: number | null = null;
    if (config.display.showCount) {
      if (def.countField !== "") {
        if (hasField(eventRecord, def.countField)) {
          if (latestRecord && counts) count = counts[def.key] ?? 0;
          else count = Number(eventRecord[def.countField]?.value) || 0;
        }
      } else if (tableVisible && counts) {
        count = counts[def.key] ?? 0;
      }
    }
    const users =
      config.display.listMode === "chips" && tableVisible && source
        ? usersForKey(source, def.key, config.display.maxListUsers)
        : null;
    const chip: ChipView = {
      key: def.key,
      emoji: def.emoji,
      label: def.label,
      color: def.color,
      theme: def.theme,
      reacted: source ? isReacted(source, userCode, def.key) : false,
      count,
      users,
      confetti: def.confetti,
    };
    const spaceId = resolveDefSpace(def, config.defaultSpaceId);
    if (!bars.has(spaceId)) {
      bars.set(spaceId, []);
      order.push(spaceId);
    }
    bars.get(spaceId)?.push(chip);
  }
  return order.map((spaceId) => ({ spaceId, chips: bars.get(spaceId) ?? [] }));
}

export function optimisticToggle(bars: BarView[], key: string, userName: string, maxNames = Number.POSITIVE_INFINITY): BarView[] {
  return bars.map((bar) => ({
    spaceId: bar.spaceId,
    chips: bar.chips.map((chip) => {
      const copy: ChipView = { ...chip, users: chip.users ? { names: chip.users.names.slice(), more: chip.users.more } : null };
      if (chip.key !== key) return copy;
      copy.reacted = !chip.reacted;
      if (copy.count !== null) copy.count = Math.max(0, copy.count + (copy.reacted ? 1 : -1));
      if (copy.users) {
        if (copy.reacted) {
          if (copy.users.names.length >= maxNames) copy.users.more += 1;
          else copy.users.names.push(userName);
        } else {
          const idx = copy.users.names.lastIndexOf(userName);
          if (idx >= 0) copy.users.names.splice(idx, 1);
          else copy.users.more = Math.max(0, copy.users.more - 1);
        }
      }
      return copy;
    }),
  }));
}

export function formatCount(n: number | null): string {
  if (n === null) return "";
  return n >= 1000 ? "999+" : String(n);
}

// 読み上げ・ツールチップ用の名前。emoji テーマだけ絵文字を前に付ける（他は SVG が絵文字の代わり）。
export function chipName(chip: ChipView): string {
  return chip.theme === "emoji" ? `${chip.emoji} ${chip.label}` : chip.label;
}

export function chipAriaLabel(chip: ChipView): string {
  const parts = [chipName(chip)];
  if (chip.count !== null) parts.push(`${formatCount(chip.count)}件`);
  parts.push(chip.reacted ? "付けています" : "付けていません");
  return parts.join("、");
}

export function chipTitle(chip: ChipView): string {
  if (!chip.users || chip.users.names.length === 0) return chip.label;
  const more = chip.users.more > 0 ? ` ほか${chip.users.more}人` : "";
  return `${chip.label}: ${chip.users.names.join(", ")}${more}`;
}

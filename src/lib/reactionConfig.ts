import { listNumberFields, validateMapping, type FormFieldsResponse, type TableMapping } from "./fields";
import { countGraphemes, hasControlChars, truncateGraphemes } from "./text";

export const CONFIG_VERSION = "1";
export const MAX_REACTIONS = 12;
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
// ヘッダーメニュー専用の配置先（共通の配置先がスペースでも個別ボタンをヘッダーに置く）。
export const HEADER_SPACE = "__header__";
export const EMOJI_MAX = 4;
export const LABEL_MAX = 20;
export const RX_LABEL_MAX = 60;
export const MAX_LIST_USERS_LIMIT = 100;
export const REACTION_COLORS = ["blue", "orange", "red", "purple", "green", "gray"] as const;
export type ReactionColor = (typeof REACTION_COLORS)[number];
export const COLOR_LABELS: Record<ReactionColor, string> = {
  blue: "青",
  orange: "橙",
  red: "赤",
  purple: "紫",
  green: "緑",
  gray: "灰",
};

// ボタンの見た目（アイコンと選択時の演出）。emoji は従来どおり絵文字をそのまま表示する。
export const REACTION_THEMES = ["heart", "confirm", "helpful", "thanks", "emoji"] as const;
export type ReactionTheme = (typeof REACTION_THEMES)[number];
export const THEME_LABELS: Record<ReactionTheme, string> = {
  heart: "ハート",
  confirm: "チェック",
  helpful: "グッド",
  thanks: "おじぎ",
  emoji: "絵文字",
};

export interface ReactionDef {
  key: string;
  emoji: string;
  label: string;
  color: ReactionColor; // emoji テーマのときだけ使う
  theme: ReactionTheme;
  enabled: boolean;
  spaceId: string; // "" = 共通の配置先、HEADER_SPACE = ヘッダー
  countField: string; // "" = 割当なし
  confetti: boolean;
}

export type ListMode = "none" | "chips";
export interface DisplayOptions {
  showCount: boolean;
  listMode: ListMode;
  maxListUsers: number;
}

export interface ReactionConfig {
  version: 1;
  mapping: TableMapping;
  defaultSpaceId: string; // "" = ヘッダーメニュー
  reactions: ReactionDef[];
  display: DisplayOptions;
}

export interface StoredConfig {
  recordApiUrl?: string;
  config?: string;
  configVersion?: string;
}

export function defaultReactions(): ReactionDef[] {
  const base = { enabled: true, spaceId: "", countField: "", confetti: false };
  return [
    { key: "like", emoji: "❤️", label: "いいね", color: "red", theme: "heart", ...base },
    { key: "ok", emoji: "✅", label: "了解", color: "green", theme: "confirm", ...base },
    { key: "helpful", emoji: "👍", label: "なるほど", color: "blue", theme: "helpful", ...base },
    { key: "thanks", emoji: "🙏", label: "ありがとう", color: "orange", theme: "thanks", ...base },
  ];
}

export function presetCountFields(defs: ReactionDef[], resp: FormFieldsResponse): ReactionDef[] {
  const numbers = new Set(listNumberFields(resp).map((f) => f.code));
  return defs.map((d) => {
    const code = `cnt_${d.key}`;
    return numbers.has(code) ? { ...d, countField: code } : { ...d };
  });
}

export type ApplyRecommendedResult =
  | { ok: true; reactions: ReactionDef[] }
  | { ok: false; message: string };

// 推奨セット（like / ok / helpful / thanks）を現在の設定へ適用した新しい配列を返す純粋関数。
export function applyRecommendedSet(reactions: ReactionDef[], resp: FormFieldsResponse): ApplyRecommendedResult {
  const recs = defaultReactions();
  const recKeys = new Set(recs.map((r) => r.key));
  if (recs.some((rec) => reactions.filter((r) => r.key.trim() === rec.key).length > 1)) {
    return {
      ok: false,
      message: "キーが重複している行があるため適用できません。重複を解消してから、もう一度お試しください。",
    };
  }
  const current = new Set(reactions.map((r) => r.key.trim()));
  const missing = recs.filter((r) => !current.has(r.key)).length;
  if (reactions.length + missing > MAX_REACTIONS) {
    return {
      ok: false,
      message: `リアクションが${MAX_REACTIONS}件を超えるため適用できません。不要な行を削除してから、もう一度お試しください。（現在${reactions.length}件、追加が必要なのは${missing}件）`,
    };
  }
  const head: ReactionDef[] = recs.map((rec) => {
    const row = reactions.find((r) => r.key.trim() === rec.key);
    return row
      ? { ...row, key: rec.key, theme: rec.theme, emoji: rec.emoji, label: rec.label, enabled: true }
      : { ...rec };
  });
  const tail: ReactionDef[] = reactions.filter((r) => !recKeys.has(r.key.trim())).map((r) => ({ ...r, enabled: false }));
  // 回数欄: 全行（無効行を含む）で使用済みのものは割り当てない。
  const used = new Set<string>();
  for (const d of [...head, ...tail]) if (d.countField !== "") used.add(d.countField);
  const numbers = new Set(listNumberFields(resp).map((f) => f.code));
  for (const d of head) {
    if (d.countField !== "") continue;
    const code = `cnt_${d.key}`;
    if (numbers.has(code) && !used.has(code)) {
      d.countField = code;
      used.add(code);
    }
  }
  return { ok: true, reactions: [...head, ...tail] };
}

// 適用前の行（key と originalKey）から、適用後の各 def に引き継ぐ originalKey を返す。
// キーは trim して照合し、同じキーが複数あれば最初の行を優先する。新規行は null。
export function carryOriginalKeys(
  before: { key: string; originalKey: string | null }[],
  after: ReactionDef[]
): (string | null)[] {
  const originals = new Map<string, string | null>();
  for (const r of before) {
    const k = r.key.trim();
    if (!originals.has(k)) originals.set(k, r.originalKey);
  }
  return after.map((d) => originals.get(d.key.trim()) ?? null);
}

export function defaultDisplay(): DisplayOptions {
  return { showCount: true, listMode: "chips", maxListUsers: 20 };
}

export function defaultConfig(mapping: TableMapping): ReactionConfig {
  return { version: 1, mapping: { ...mapping }, defaultSpaceId: "", reactions: defaultReactions(), display: defaultDisplay() };
}

export function serializeConfig(c: ReactionConfig): string {
  return JSON.stringify(c);
}

export function colorOrDefault(v: unknown, index: number): ReactionColor {
  if (typeof v === "string" && (REACTION_COLORS as readonly string[]).includes(v)) return v as ReactionColor;
  return REACTION_COLORS[index % REACTION_COLORS.length] as ReactionColor;
}

export function themeOrDefault(v: unknown): ReactionTheme {
  if (typeof v === "string" && (REACTION_THEMES as readonly string[]).includes(v)) return v as ReactionTheme;
  return "emoji";
}

export type ParseResult =
  | { ok: true; config: ReactionConfig }
  | { ok: false; reason: "EMPTY" | "INVALID_JSON" | "INVALID_SHAPE" };

const MAPPING_KEYS = ["table", "userCode", "userName", "key", "label", "at"] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeDefaultSpace(v: string): string {
  return v === HEADER_SPACE ? "" : v;
}

// ボタンの実際の配置先 ID。"" はヘッダー。
export function resolveDefSpace(def: ReactionDef, defaultSpaceId: string): string {
  if (def.spaceId === HEADER_SPACE) return "";
  return def.spaceId || normalizeDefaultSpace(defaultSpaceId);
}

function parseDisplay(v: unknown): DisplayOptions {
  const d = defaultDisplay();
  if (!isObj(v)) return d;
  const showCount = v.showCount === false ? false : v.showCount === true ? true : d.showCount;
  const listMode: ListMode = v.listMode === "none" || v.listMode === "chips" ? v.listMode : d.listMode;
  let max = typeof v.maxListUsers === "number" && Number.isFinite(v.maxListUsers) ? Math.round(v.maxListUsers) : d.maxListUsers;
  max = Math.min(MAX_LIST_USERS_LIMIT, Math.max(1, max));
  return { showCount, listMode, maxListUsers: max };
}

export function parseConfig(raw: string | undefined): ParseResult {
  if (raw === undefined || raw === null || raw === "") return { ok: false, reason: "EMPTY" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
  const bad = { ok: false, reason: "INVALID_SHAPE" } as const;
  if (!isObj(json)) return bad;
  const rawReactions = json.reactions;
  if (!Array.isArray(rawReactions) || rawReactions.length === 0 || rawReactions.length > MAX_REACTIONS) return bad;
  const rawMapping = json.mapping;
  if (!isObj(rawMapping)) return bad;
  const mapping = {} as TableMapping;
  for (const k of MAPPING_KEYS) {
    const v = rawMapping[k];
    if (typeof v !== "string") return bad;
    mapping[k] = v;
  }
  const seen = new Set<string>();
  const reactions: ReactionDef[] = [];
  for (let i = 0; i < rawReactions.length; i += 1) {
    const r: unknown = rawReactions[i];
    if (!isObj(r)) return bad;
    if (typeof r.key !== "string" || typeof r.emoji !== "string" || typeof r.label !== "string") return bad;
    if (!KEY_PATTERN.test(r.key) || seen.has(r.key)) return bad;
    seen.add(r.key);
    reactions.push({
      key: r.key,
      emoji: r.emoji,
      label: r.label,
      color: colorOrDefault(r.color, i),
      theme: themeOrDefault(r.theme),
      enabled: r.enabled !== false,
      spaceId: str(r.spaceId),
      countField: str(r.countField),
      confetti: r.confetti === true,
    });
  }
  return {
    ok: true,
    config: { version: 1, mapping, defaultSpaceId: normalizeDefaultSpace(str(json.defaultSpaceId)), reactions, display: parseDisplay(json.display) },
  };
}

export function activeReactions(c: ReactionConfig): ReactionDef[] {
  return c.reactions.filter((r) => r.enabled);
}

export type RuntimeResult = { ok: true; config: ReactionConfig } | { ok: false; reason: "NOT_CONFIGURED" | "INVALID" };

export function resolveRuntimeConfig(stored: StoredConfig): RuntimeResult {
  if (!stored.recordApiUrl || !stored.config) return { ok: false, reason: "NOT_CONFIGURED" };
  const parsed = parseConfig(stored.config);
  if (!parsed.ok) return { ok: false, reason: "INVALID" };
  return { ok: true, config: parsed.config };
}

export function buildRxLabel(def: ReactionDef): string {
  return truncateGraphemes(`${def.emoji} ${def.label}`, RX_LABEL_MAX);
}

export interface ConfigError {
  path: string;
  message: string;
}

export function validateConfig(
  c: ReactionConfig,
  resp: FormFieldsResponse,
  rows: { originalKey: string | null }[]
): ConfigError[] {
  const errors: ConfigError[] = [];
  for (const m of validateMapping(resp, c.mapping)) errors.push({ path: "mapping", message: m });
  if (c.reactions.length < 1 || c.reactions.length > MAX_REACTIONS) {
    errors.push({ path: "reactions", message: `リアクションは1〜${MAX_REACTIONS}件で設定してください。` });
  }
  const numbers = new Set(listNumberFields(resp).map((f) => f.code));
  const keyCount = new Map<string, number>();
  for (const r of c.reactions) keyCount.set(r.key, (keyCount.get(r.key) ?? 0) + 1);
  const usedCounts = new Map<string, number>();
  c.reactions.forEach((r, i) => {
    const n = i + 1;
    const path = `reactions.${i}`;
    const push = (message: string): void => {
      errors.push({ path, message });
    };
    if (!KEY_PATTERN.test(r.key)) {
      push(`${n}行目: キーは英小文字で始まり、英小文字・数字・_ の32文字以内で入力してください。`);
    } else if ((keyCount.get(r.key) ?? 0) > 1) {
      push(`${n}行目: キー "${r.key}" が重複しています。`);
    }
    const original = rows[i]?.originalKey ?? null;
    if (original !== null && r.key !== original) push(`${n}行目: 保存済みのキーは変更できません。`);
    const emoji = r.emoji.trim();
    const eg = countGraphemes(emoji);
    if (eg < 1 || eg > EMOJI_MAX || hasControlChars(emoji)) push(`${n}行目: 絵文字は1〜${EMOJI_MAX}文字で入力してください。`);
    const label = r.label.trim();
    const lg = countGraphemes(label);
    if (lg < 1 || lg > LABEL_MAX || hasControlChars(label)) push(`${n}行目: 表示名は1〜${LABEL_MAX}文字で入力してください。`);
    if (!(REACTION_COLORS as readonly string[]).includes(r.color)) push(`${n}行目: 色が正しくありません。`);
    if (!(REACTION_THEMES as readonly string[]).includes(r.theme)) push(`${n}行目: 見た目が正しくありません。`);
    if (r.spaceId !== "" && r.spaceId !== HEADER_SPACE && r.spaceId.startsWith("__")) push(`${n}行目: 配置先が正しくありません。`);
    if (r.countField !== "") {
      if (!numbers.has(r.countField)) push(`${n}行目: 回数欄には存在する数値フィールドを選択してください。`);
      usedCounts.set(r.countField, (usedCounts.get(r.countField) ?? 0) + 1);
      if ((usedCounts.get(r.countField) ?? 0) === 2) push(`${n}行目: 回数欄 "${r.countField}" は複数のボタンに割り当てられません。`);
    }
  });
  if (c.defaultSpaceId.startsWith("__")) errors.push({ path: "defaultSpaceId", message: "共通の配置先が正しくありません。" });
  const m = c.display.maxListUsers;
  if (!Number.isInteger(m) || m < 1 || m > MAX_LIST_USERS_LIMIT) {
    errors.push({ path: "display", message: `一覧の最大表示人数は1〜${MAX_LIST_USERS_LIMIT}の整数で入力してください。` });
  }
  return errors;
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

export function newReactionDef(existingKeys: string[], index: number): ReactionDef {
  const used = new Set(existingKeys);
  let n = 1;
  while (used.has(`reaction_${n}`)) n += 1;
  return {
    key: `reaction_${n}`,
    emoji: "✨",
    label: "新しいリアクション",
    color: REACTION_COLORS[index % REACTION_COLORS.length] as ReactionColor,
    theme: "emoji",
    enabled: true,
    spaceId: "",
    countField: "",
    confetti: false,
  };
}

export function normalizeFormInput(c: ReactionConfig): ReactionConfig {
  const m = Number(c.display.maxListUsers);
  return {
    ...c,
    reactions: c.reactions.map((r) => ({ ...r, key: r.key.trim(), emoji: r.emoji.trim(), label: r.label.trim() })),
    display: { ...c.display, maxListUsers: Number.isFinite(m) ? Math.round(m) : NaN },
  };
}

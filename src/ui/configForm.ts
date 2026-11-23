import {
  COLUMN_NAMES,
  COLUMN_TYPES,
  listNumberFields,
  listSubtableColumns,
  listSubtables,
  presetMapping,
  type ColumnName,
  type FormFieldsResponse,
  type TableMapping,
} from "../lib/fields";
import {
  COLOR_LABELS,
  MAX_LIST_USERS_LIMIT,
  MAX_REACTIONS,
  REACTION_COLORS,
  REACTION_THEMES,
  THEME_LABELS,
  HEADER_SPACE,
  moveItem,
  newReactionDef,
  type ConfigError,
  type DisplayOptions,
  type ListMode,
  type ReactionColor,
  type ReactionConfig,
  type ReactionDef,
  type ReactionTheme,
} from "../lib/reactionConfig";
import { resolveSpaceOptions } from "../lib/settings";
import { el } from "./dom";

export interface ConfigFormHandle {
  read(): { config: ReactionConfig; rows: { originalKey: string | null }[] };
  showErrors(errors: ConfigError[]): void;
}

export interface ConfigFormRoots {
  mapping: HTMLElement;
  reactions: HTMLElement;
  display: HTMLElement;
}

export interface ConfigFormContext {
  fields: FormFieldsResponse;
  spacers: { elementId: string }[];
  initial: ReactionConfig;
  savedKeys: string[];
}

interface Row {
  def: ReactionDef;
  originalKey: string | null;
}

const COLUMN_LABELS: Record<ColumnName, string> = {
  userCode: "ユーザーコード列",
  userName: "ユーザー名列",
  key: "リアクションキー列",
  label: "表示ラベル列",
  at: "日時列",
};

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  o.selected = selected;
  return o;
}

function select(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = document.createElement("select");
  for (const o of options) s.appendChild(option(o.value, o.label, o.value === value));
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function textInput(value: string, className: string, onInput: (v: string) => void, readOnly = false): HTMLInputElement {
  const i = el("input", { type: "text", className }) as HTMLInputElement;
  i.value = value;
  i.readOnly = readOnly;
  i.addEventListener("input", () => onInput(i.value));
  return i;
}

function checkbox(checked: boolean, label: string, onChange: (v: boolean) => void): HTMLInputElement {
  const i = el("input", { type: "checkbox", "aria-label": label }) as HTMLInputElement;
  i.checked = checked;
  i.addEventListener("change", () => onChange(i.checked));
  return i;
}

export function renderConfigForm(roots: ConfigFormRoots, ctx: ConfigFormContext): ConfigFormHandle {
  let mapping: TableMapping = { ...ctx.initial.mapping };
  let rows: Row[] = ctx.initial.reactions.map((def) => ({
    def: { ...def },
    originalKey: ctx.savedKeys.includes(def.key) ? def.key : null,
  }));
  const display: DisplayOptions = { ...ctx.initial.display };
  const defaultSpaceId = ctx.initial.defaultSpaceId;
  let errorRows = new Set<number>();
  let mappingError = false;

  const numberOptions = [{ value: "", label: "なし" }, ...listNumberFields(ctx.fields).map((f) => ({ value: f.code, label: `${f.label} (${f.code})` }))];

  function renderMapping(): void {
    roots.mapping.textContent = "";
    roots.mapping.classList.toggle("krx-has-error", mappingError);
    const grid = el("div", { className: "krx-mapping-grid" });
    const tables = [{ value: "", label: "（選択してください）" }, ...listSubtables(ctx.fields).map((t) => ({ value: t.code, label: `${t.label} (${t.code})` }))];
    grid.appendChild(el("label", { text: "記録用テーブル" }));
    grid.appendChild(
      select(tables, mapping.table, (v) => {
        // テーブルを変えたら列は既定コードから再判定する。
        mapping = presetMapping(ctx.fields, { ...mapping, table: v, userCode: "", userName: "", key: "", label: "", at: "" });
        if (mapping.table !== v) mapping = { table: v, userCode: "", userName: "", key: "", label: "", at: "" };
        renderMapping();
      })
    );
    for (const name of COLUMN_NAMES) {
      grid.appendChild(el("label", { text: COLUMN_LABELS[name] }));
      const cols = [
        { value: "", label: "（選択してください）" },
        ...listSubtableColumns(ctx.fields, mapping.table, COLUMN_TYPES[name]).map((c) => ({ value: c.code, label: `${c.label} (${c.code})` })),
      ];
      grid.appendChild(
        select(cols, mapping[name], (v) => {
          mapping = { ...mapping, [name]: v };
        })
      );
    }
    roots.mapping.appendChild(el("h2", { text: "記録テーブルの割り当て" }));
    roots.mapping.appendChild(grid);
  }

  function spaceOptions(current: string): { value: string; label: string }[] {
    const opts = resolveSpaceOptions(ctx.spacers, current === "" || current === HEADER_SPACE ? null : current);
    return [{ value: "", label: "（共通の配置先）" }, { value: HEADER_SPACE, label: "ヘッダーメニュー" }, ...opts.slice(1).map((o) => ({ value: o.value, label: o.label }))];
  }

  function renderReactions(): void {
    roots.reactions.textContent = "";
    roots.reactions.appendChild(el("h2", { text: "リアクション" }));
    const head = el("tr", {}, ["有効", "キー", "見た目", "絵文字", "表示名", "色", "配置先", "回数欄", "紙吹雪", "操作"].map((t) => el("th", { text: t })));
    const tbody = el("tbody");
    rows.forEach((row, i) => {
      const d = row.def;
      const tr = el("tr", { className: errorRows.has(i) ? "krx-has-error" : "" });
      const cell = (n: Node): void => {
        tr.appendChild(el("td", {}, [n]));
      };
      cell(checkbox(d.enabled, "有効", (v) => (d.enabled = v)));
      cell(textInput(d.key, "krx-in-key", (v) => (d.key = v), row.originalKey !== null));
      // 色の選択は見た目が「絵文字」のときだけ使う（値は保持する）。
      const colorSel = select(REACTION_COLORS.map((c) => ({ value: c, label: COLOR_LABELS[c] })), d.color, (v) => (d.color = v as ReactionColor));
      colorSel.disabled = d.theme !== "emoji";
      colorSel.title = "色は見た目が「絵文字」のときだけ使います";
      cell(
        select(REACTION_THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] })), d.theme, (v) => {
          d.theme = v as ReactionTheme;
          colorSel.disabled = d.theme !== "emoji";
        })
      );
      cell(textInput(d.emoji, "krx-in-emoji", (v) => (d.emoji = v)));
      cell(textInput(d.label, "krx-in-label", (v) => (d.label = v)));
      cell(colorSel);
      cell(select(spaceOptions(d.spaceId), d.spaceId, (v) => (d.spaceId = v)));
      cell(select(numberOptions.some((o) => o.value === d.countField) ? numberOptions : [...numberOptions, { value: d.countField, label: `（見つかりません: ${d.countField}）` }], d.countField, (v) => (d.countField = v)));
      cell(checkbox(d.confetti, "紙吹雪", (v) => (d.confetti = v)));
      const actions = el("td", { className: "krx-rx-actions" });
      const mk = (text: string, label: string, disabled: boolean, fn: () => void): void => {
        const b = el("button", { type: "button", text, "aria-label": label }) as HTMLButtonElement;
        b.disabled = disabled;
        b.addEventListener("click", fn);
        actions.appendChild(b);
      };
      mk("↑", "上へ", i === 0, () => {
        rows = moveItem(rows, i, i - 1);
        errorRows = new Set();
        renderReactions();
      });
      mk("↓", "下へ", i === rows.length - 1, () => {
        rows = moveItem(rows, i, i + 1);
        errorRows = new Set();
        renderReactions();
      });
      mk("削除", "削除", false, () => {
        rows = rows.filter((_, idx) => idx !== i);
        errorRows = new Set();
        renderReactions();
      });
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    roots.reactions.appendChild(el("table", { className: "krx-rx-table" }, [el("thead", {}, [head]), tbody]));
    const add = el("button", { type: "button", text: "リアクションを追加" }) as HTMLButtonElement;
    add.disabled = rows.length >= MAX_REACTIONS;
    add.addEventListener("click", () => {
      rows = [...rows, { def: newReactionDef(rows.map((r) => r.def.key), rows.length), originalKey: null }];
      errorRows = new Set();
      renderReactions();
    });
    roots.reactions.appendChild(el("p", {}, [add]));
    roots.reactions.appendChild(
      el("p", {
        className: "krx-config-hint",
        text: `最大${MAX_REACTIONS}件。保存済みのキーは変更できません。削除・停止しても過去の記録はレコードに残ります。色は見た目が「絵文字」のときだけ反映されます。絵文字は記録の表示ラベル（例: ❤️ いいね）にも使います。`,
      })
    );
  }

  function renderDisplay(): void {
    roots.display.textContent = "";
    roots.display.appendChild(el("h2", { text: "表示設定" }));
    const showCount = checkbox(display.showCount, "回数を表示する", (v) => (display.showCount = v));
    roots.display.appendChild(el("p", {}, [el("label", {}, [showCount, " 回数を表示する"])]));
    const mode = select(
      [
        { value: "none", label: "表示しない" },
        { value: "chips", label: "チップに名前を表示" },
      ],
      display.listMode,
      (v) => (display.listMode = v as ListMode)
    );
    roots.display.appendChild(el("p", {}, [el("label", {}, ["付けた人一覧: ", mode])]));
    const max = el("input", { type: "number", min: "1", max: String(MAX_LIST_USERS_LIMIT), "aria-label": "一覧の最大表示人数" }) as HTMLInputElement;
    max.value = String(display.maxListUsers);
    max.addEventListener("input", () => {
      display.maxListUsers = max.value === "" ? NaN : Number(max.value);
    });
    roots.display.appendChild(el("p", {}, [el("label", {}, ["一覧の最大表示人数（1〜100）: ", max])]));
  }

  renderMapping();
  renderReactions();
  renderDisplay();

  return {
    read() {
      return {
        config: {
          version: 1,
          mapping: { ...mapping },
          defaultSpaceId,
          reactions: rows.map((r) => ({ ...r.def })),
          display: { ...display },
        },
        rows: rows.map((r) => ({ originalKey: r.originalKey })),
      };
    },
    showErrors(errors: ConfigError[]): void {
      errorRows = new Set();
      mappingError = false;
      for (const e of errors) {
        const m = /^reactions\.(\d+)$/.exec(e.path);
        if (m) errorRows.add(Number(m[1]));
        if (e.path === "mapping") mappingError = true;
      }
      roots.mapping.classList.toggle("krx-has-error", mappingError);
      renderReactions();
      const box = document.getElementById("plugin-config-errormsg");
      if (box) box.textContent = errors.map((e) => e.message).join("\n");
    },
  };
}

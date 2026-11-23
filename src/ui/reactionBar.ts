import { chipAriaLabel, chipName, chipTitle, formatCount, type BarView, type ChipView } from "../lib/view";
import { el } from "./dom";
import { createBurstLayer, createThemeIcon, rollCount, type Motion } from "./motion";

export interface BarHandle {
  root: HTMLElement;
  update(view: BarView): void;
  setDisabled(disabled: boolean): void;
  setLoading(loading: boolean): void;
  chipEl(key: string): HTMLButtonElement | null;
  setMessage(text: string, level: "info" | "warning" | null): void;
}

export interface RenderBarOptions {
  placementId: string;
  readonly: boolean;
  onPress: (key: string, btn: HTMLButtonElement) => void;
  motion: Motion;
}

function applyChip(btn: HTMLButtonElement, chip: ChipView, reduced: boolean): void {
  btn.setAttribute("aria-pressed", chip.reacted ? "true" : "false");
  btn.setAttribute("aria-label", chipAriaLabel(chip));
  btn.title = chipTitle(chip);
  btn.classList.toggle("krx-is-active", chip.reacted);
  const count = btn.querySelector<HTMLElement>(".krx-count");
  if (count) {
    const text = formatCount(chip.count);
    rollCount(count, text, reduced);
    const slot = count.parentElement;
    if (slot) slot.hidden = text === "";
  }
}

export function renderBar(container: HTMLElement, view: BarView, opts: RenderBarOptions): BarHandle {
  // 同じ配置先の自分の描画だけを置き換える（他のカスタマイズの要素は消さない）。
  for (const old of Array.from(container.querySelectorAll<HTMLElement>(".krx-bar"))) {
    if (old.getAttribute("data-krx-placement") === opts.placementId) old.remove();
  }

  const msg = el("div", { className: "krx-msg", hidden: true });
  const chipsEl = el("div", { className: "krx-chips" });
  const whoBtn = el("button", { type: "button", className: "krx-who", "aria-expanded": "false", text: "付けた人", hidden: true }) as HTMLButtonElement;
  const panel = el("div", { className: "krx-who-panel", hidden: true });
  const root = el(
    "div",
    { className: "krx-bar", role: "group", "aria-label": "リアクション", "data-krx-placement": opts.placementId },
    [msg, chipsEl, whoBtn, panel]
  );

  const doc = container.ownerDocument;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const chip of view.chips) {
    const btn = el(
      "button",
      {
        type: "button",
        className: `krx-btn krx-theme-${chip.theme}${chip.theme === "emoji" ? ` krx-color-${chip.color}` : ""}`,
        "data-krx-key": chip.key,
      },
      [
        ...createBurstLayer(doc, chip.theme),
        createThemeIcon(doc, chip.theme, chip.emoji),
        el("span", { className: "krx-lbl", "aria-hidden": "true", text: chip.label }),
        el("span", { className: "krx-count-slot", "aria-hidden": "true" }, [el("span", { className: "krx-count" })]),
      ]
    ) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      opts.onPress(chip.key, btn);
    });
    opts.motion.attachPress(btn);
    buttons.set(chip.key, btn);
    chipsEl.appendChild(btn);
    applyChip(btn, chip, opts.motion.isReduced());
  }

  let panelOpen = false;
  function renderPanel(v: BarView): void {
    panel.textContent = "";
    let any = false;
    for (const chip of v.chips) {
      if (!chip.users) continue;
      any = true;
      const names = chip.users.names.length > 0 ? chip.users.names.join(", ") : "（まだいません）";
      const more = chip.users.more > 0 ? ` ほか${chip.users.more}人` : "";
      panel.appendChild(el("p", { text: `${chipName(chip)}: ${names}${more}` }));
    }
    whoBtn.hidden = !any;
    if (!any) {
      panelOpen = false;
    }
    panel.hidden = !panelOpen;
    whoBtn.setAttribute("aria-expanded", panelOpen ? "true" : "false");
  }
  whoBtn.addEventListener("click", () => {
    panelOpen = !panelOpen;
    panel.hidden = !panelOpen;
    whoBtn.setAttribute("aria-expanded", panelOpen ? "true" : "false");
  });
  renderPanel(view);

  function setDisabled(disabled: boolean): void {
    for (const btn of buttons.values()) {
      btn.disabled = disabled;
      if (disabled) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
    }
  }

  container.appendChild(root);
  if (opts.readonly) setDisabled(true);

  return {
    root,
    update(v: BarView): void {
      for (const chip of v.chips) {
        const btn = buttons.get(chip.key);
        if (btn) applyChip(btn, chip, opts.motion.isReduced());
      }
      renderPanel(v);
    },
    setDisabled,
    setLoading(loading: boolean): void {
      root.classList.toggle("krx-is-loading", loading);
      if (loading) root.setAttribute("aria-busy", "true");
      else root.removeAttribute("aria-busy");
    },
    chipEl(key: string): HTMLButtonElement | null {
      return buttons.get(key) ?? null;
    },
    setMessage(text: string, level: "info" | "warning" | null): void {
      msg.textContent = level === null ? "" : text;
      msg.hidden = level === null || text === "";
      msg.className = level === null ? "krx-msg" : `krx-msg krx-msg-${level}`;
    },
  };
}

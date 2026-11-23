import { chipAriaLabel, chipTitle, formatCount, type BarView, type ChipView } from "../lib/view";
import { el } from "./dom";
import { setIcon, type Motion } from "./motion";

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

function applyChip(btn: HTMLButtonElement, chip: ChipView): void {
  btn.setAttribute("aria-pressed", chip.reacted ? "true" : "false");
  btn.setAttribute("aria-label", chipAriaLabel(chip));
  btn.title = chipTitle(chip);
  btn.classList.toggle("krx-chip-active", chip.reacted);
  const count = btn.querySelector(".krx-count");
  if (count) count.textContent = formatCount(chip.count);
  setIcon(btn, chip.reacted ? "check" : null);
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

  const buttons = new Map<string, HTMLButtonElement>();
  for (const chip of view.chips) {
    const btn = el(
      "button",
      { type: "button", className: `krx-chip krx-color-${chip.color}`, "data-krx-key": chip.key },
      [
        el("span", { className: "krx-ic", "aria-hidden": "true" }),
        el("span", { className: "krx-emoji", "aria-hidden": "true", text: chip.emoji }),
        el("span", { className: "krx-count", "aria-hidden": "true" }),
      ]
    ) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      opts.onPress(chip.key, btn);
    });
    opts.motion.attachPress(btn);
    buttons.set(chip.key, btn);
    chipsEl.appendChild(btn);
    applyChip(btn, chip);
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
      panel.appendChild(el("p", { text: `${chip.emoji} ${chip.label}: ${names}${more}` }));
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
        if (btn) applyChip(btn, chip);
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

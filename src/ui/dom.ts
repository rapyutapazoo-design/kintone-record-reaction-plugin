import { animate, flip, settle } from "./motion";

export interface ElAttrs {
  [key: string]: string | boolean | undefined;
  text?: string;
  className?: string;
}

// DOM構築は textContent / createElement のみを使う（HTML文字列の直接挿入は禁止）。
export function el(tag: string, attrs: ElAttrs = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === "text") {
      node.textContent = String(value);
    } else if (key === "className") {
      node.className = String(value);
    } else if (typeof value === "boolean") {
      if (value) {
        node.setAttribute(key, "");
      }
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

const TOAST_STACK_CLASS = "krx-toast-stack";

// トーストを縦に並べる親。aria-live 領域は先に存在していないと読み上げられないことがあるため、
// 画面を開いた時点で用意しておく。
export function ensureToastStack(doc: Document): HTMLElement {
  const existing = doc.body.querySelector<HTMLElement>(`:scope > .${TOAST_STACK_CLASS}`);
  if (existing) return existing;
  const stack = doc.createElement("div");
  stack.className = TOAST_STACK_CLASS;
  stack.setAttribute("role", "status");
  stack.setAttribute("aria-live", "polite");
  doc.body.appendChild(stack);
  return stack;
}

const TOAST_VISIBLE_MS = 3000;

export function showToast(root: HTMLElement, message: string, kind: "success" | "error" = "success"): void {
  const doc = root.ownerDocument ?? document;
  const stack = ensureToastStack(doc);
  const icon = el("span", { className: "krx-toast-ic", "aria-hidden": "true", text: kind === "error" ? "!" : "✓" });
  const toast = el("div", { className: `krx-toast krx-toast-${kind}` }, [icon, el("span", { className: "krx-toast-msg", text: message })]);
  flip(stack, () => stack.appendChild(toast));
  animate(
    toast,
    [
      { opacity: 0, transform: "scale(.8)" },
      { opacity: 1, transform: "scale(1.05)", offset: 0.6 },
      { opacity: 1, transform: "none" },
    ],
    { duration: 320, easing: "cubic-bezier(.3,.7,.4,1)" }
  );
  setTimeout(() => {
    const out = animate(
      toast,
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(.94)" },
      ],
      { duration: 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
    );
    void settle(out).then(() => {
      flip(stack, () => toast.remove());
    });
  }, TOAST_VISIBLE_MS);
}

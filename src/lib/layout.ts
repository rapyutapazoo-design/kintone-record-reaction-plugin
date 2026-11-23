export interface SpacerOption {
  elementId: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectFromFields(fields: unknown, out: SpacerOption[], seen: Set<string>): void {
  if (!Array.isArray(fields)) return;
  for (const field of fields) {
    if (!isPlainObject(field)) continue;
    if (field.type === "SPACER" && typeof field.elementId === "string" && field.elementId.length > 0) {
      if (!seen.has(field.elementId)) {
        seen.add(field.elementId);
        out.push({ elementId: field.elementId });
      }
    }
  }
}

function collectFromLayout(layout: unknown, out: SpacerOption[], seen: Set<string>): void {
  if (!Array.isArray(layout)) return;
  for (const item of layout) {
    if (!isPlainObject(item)) continue;
    if (item.type === "ROW" || item.type === "SUBTABLE") {
      collectFromFields(item.fields, out, seen);
    } else if (item.type === "GROUP") {
      collectFromLayout(item.layout, out, seen);
    }
  }
}

// layout.json 応答の layout 配列（または { layout } オブジェクト）から
// SPACER かつ elementId を持つ要素を再帰的に収集する（出現順、重複排除）。
export function extractSpacers(layout: unknown): SpacerOption[] {
  const out: SpacerOption[] = [];
  const seen = new Set<string>();
  const target = isPlainObject(layout) && "layout" in layout ? (layout as Record<string, unknown>).layout : layout;
  collectFromLayout(target, out, seen);
  return out;
}

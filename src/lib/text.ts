type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: "grapheme" }
) => { segment(input: string): Iterable<{ segment: string }> };

function segments(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Seg) {
    return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

export function countGraphemes(s: string): number {
  return segments(s).length;
}

export function truncateGraphemes(s: string, max: number): string {
  const parts = segments(s);
  if (parts.length <= max) return s;
  return parts.slice(0, Math.max(0, max)).join("");
}

export function hasControlChars(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(s);
}

const TOKEN = /^(\d+)(?:\s*-\s*(\d+))?$/;

// Splits on commas; null when any token is malformed.
function tokens(text: string): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const part of text.split(',')) {
    const m = TOKEN.exec(part.trim());
    if (!m) return null;
    out.push([Number(m[1]), Number(m[2] ?? m[1])]);
  }
  return out;
}

const span = (from: number, to: number): number[] =>
  Array.from({length: to - from + 1}, (_, n) => from + n - 1);

export function parsePageList(text: string, count: number): number[] {
  const parsed = tokens(text);
  if (!parsed) throw new RangeError('Enter pages such as 1-3, 5.');
  const result = new Set<number>();
  for (const [from, to] of parsed) {
    if (from < 1 || to > count || to < from)
      throw new RangeError(`Choose page numbers from 1 to ${count}.`);
    span(from, to).forEach((n) => result.add(n));
  }
  return [...result];
}

export function parseSplitGroups(text: string, count: number): number[][] {
  const parsed = tokens(text);
  if (!parsed) throw new RangeError('Enter ranges such as 1-3, 4-6.');
  const used = new Set<number>();
  return parsed.map(([from, to]) => {
    if (from < 1 || to > count || to < from)
      throw new RangeError(`Choose pages from 1 to ${count}.`);
    const group = span(from, to);
    if (group.some((n) => used.has(n)))
      throw new RangeError('Ranges overlap. Include each page only once.');
    group.forEach((n) => used.add(n));
    return group;
  });
}

export function defaultSplitText(count: number): string {
  if (count <= 1) return '1';
  const half = Math.floor(count / 2);
  return `1-${half}, ${half + 1}-${count}`;
}

export function formatRanges(indices: number[]): string {
  const runs: Array<[number, number]> = [];
  for (const i of indices) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? `${a + 1}` : `${a + 1}–${b + 1}`)).join(', ');
}

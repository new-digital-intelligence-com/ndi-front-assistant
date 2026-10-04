// What staff changed in a draft, word by word, for the correction cards on /admin/knowledge/feedback: in
// Clara's (or Aida's) version the words staff took out are marked, in what staff sent the words they added.

export type DiffPart = { text: string; changed: boolean };

const SPACE = /^\s+$/;

/** Joins neighbours of the same kind, and a space between two changes into the change. */
function tidy(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  parts.forEach((part, index) => {
    const last = out.at(-1);
    if (!part.changed && SPACE.test(part.text) && last?.changed && parts[index + 1]?.changed) {
      last.text += part.text;
      return;
    }
    if (last && last.changed === part.changed) last.text += part.text;
    else out.push({ ...part });
  });
  return out;
}

/** Word by word (a longest common subsequence). Null when the texts are too long to compare quickly. */
export function wordDiff(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } | null {
  const a = before.match(/\s+|\S+/g) ?? [];
  const b = after.match(/\s+|\S+/g) ?? [];
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > 2_000_000) return null;
  const same = (x: string, y: string) => x === y || (SPACE.test(x) && SPACE.test(y));
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = same(a[i], b[j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const outA: DiffPart[] = [];
  const outB: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) {
      outA.push({ text: a[i++], changed: false });
      outB.push({ text: b[j++], changed: false });
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      outA.push({ text: a[i], changed: !SPACE.test(a[i]) });
      i++;
    } else {
      outB.push({ text: b[j], changed: !SPACE.test(b[j]) });
      j++;
    }
  }
  for (; i < n; i++) outA.push({ text: a[i], changed: !SPACE.test(a[i]) });
  for (; j < m; j++) outB.push({ text: b[j], changed: !SPACE.test(b[j]) });
  return { before: tidy(outA), after: tidy(outB) };
}

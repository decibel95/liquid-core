/**
 * A small CSS rule reader for parity tests: selector (inside its @media or @container context) to its declarations,
 * whitespace and comma spacing normalised, comments dropped. A grouped selector gives each of its selectors the
 * declarations; a selector found twice gets both blocks in order. @keyframes are kept as one opaque entry.
 */
export type Rules = Map<string, string[]>;

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

function decls(body: string): string[] {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const at = d.indexOf(':');
      return `${d.slice(0, at).trim()}: ${norm(d.slice(at + 1))}`;
    });
}

function add(out: Rules, key: string, list: string[]): void {
  out.set(key, [...(out.get(key) ?? []), ...list]);
}

function walk(src: string, ctx: string, out: Rules): void {
  let i = 0;
  for (;;) {
    const open = src.indexOf('{', i);
    if (open < 0) return;
    const prelude = norm(src.slice(i, open));
    let depth = 1;
    let j = open + 1;
    for (; depth && j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
    }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith('@keyframes')) add(out, ctx + prelude, [norm(body)]);
    else if (prelude.startsWith('@')) walk(body, `${ctx}${prelude} | `, out);
    else for (const sel of prelude.split(',')) add(out, ctx + sel.trim(), decls(body));
    i = j;
  }
}

export function cssRules(text: string): Rules {
  const out: Rules = new Map();
  walk(text.replace(/\/\*[\s\S]*?\*\//g, ''), '', out);
  return out;
}

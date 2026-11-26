// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ICONS } from '../src/icons';

// The project has no Node typings (tsconfig types: []), so Node modules are loaded through typed shims.
const names = { fs: 'node:fs', url: 'node:url' };
const fs = (await import(/* @vite-ignore */ names.fs)) as {
  readFileSync: (file: string, enc: 'utf8') => string;
};
const url = (await import(/* @vite-ignore */ names.url)) as { fileURLToPath: (u: URL) => string };

// test/fixtures/lucide/ holds lucide-static 0.460.0 SVGs copied from the design archive (MANIFEST.sha256 there;
// the 0.3 icons from lh03-canvas/calc/ and lucide-0.460.0/blinds.svg).
const dir = url.fileURLToPath(new URL('./fixtures/lucide/', import.meta.url));

/**
 * One SVG to the ICONS form: each element in order, joined with a space. A leading relative moveto is
 * written absolute (its implicit pairs become a relative lineto); a circle is two arcs from the top;
 * a rounded rect is one closed path clockwise from the end of the top left corner.
 */
function toIconPath(svg: string): string {
  const out: string[] = [];
  for (const [, tag, attrs] of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)\/>/g)) {
    const attr = (n: string) => {
      const m = attrs.match(new RegExp(`\\s${n}="([^"]*)"`));
      if (!m) throw new Error(`no ${n} on ${tag}`);
      return m[1];
    };
    if (tag === 'path') {
      const d = attr('d');
      const m = d.match(/^m(-?[\d.]+)[ ,](-?[\d.]+)(.*)$/);
      out.push(m ? `M${m[1]} ${m[2]}${/^\s*-?[\d.]/.test(m[3]) ? 'l' + m[3].trimStart() : m[3]}` : d);
    } else if (tag === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((n) => Number(attr(n)));
      out.push(`M${cx} ${cy - r}a${r} ${r} 0 1 0 0 ${2 * r} ${r} ${r} 0 1 0 0-${2 * r}z`);
    } else if (tag === 'rect') {
      const [x, y, w, h, r] = ['x', 'y', 'width', 'height', 'rx'].map((n) => Number(attr(n)));
      const a = `a${r} ${r} 0 0 1`;
      out.push(`M${x + r} ${y}h${w - 2 * r}${a} ${r} ${r}v${h - 2 * r}${a}-${r} ${r}H${x + r}${a}-${r}-${r}V${y + r}${a} ${r}-${r}z`);
    } else {
      throw new Error(`${tag} is not converted; add it when an icon needs it`);
    }
  }
  return out.join(' ');
}

const lucide = (name: string) => fs.readFileSync(dir + name + '.svg', 'utf8');

// The Liquid Home 0.3 icons (P2-ICO-1 to 5, ICO-4 blinds) and their Lucide file, in ICONS order.
const P2 = {
  blinds: 'blinds',
  chevronUp: 'chevron-up',
  chevronDown: 'chevron-down',
  stop: 'square',
  rotateCw: 'rotate-cw',
  moveDiagonal: 'move-diagonal',
} as const;

describe('icons equal lucide-static 0.460.0', () => {
  it('the SVGs are the pinned version, stroke only', () => {
    for (const n of ['lightbulb', 'sun', 'rainbow', 'flame', 'fan', 'door-open', ...Object.values(P2)]) {
      const svg = lucide(n);
      expect(svg).toContain('@license lucide-static v0.460.0 - ISC');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('stroke="currentColor"');
    }
  });

  // The conversion reproduces the Liquid Climate entries that come from Lucide, so it is the same form.
  it('converts the existing flame, fan and door-open exactly as Liquid Climate stores them', () => {
    expect(toIconPath(lucide('flame'))).toBe(ICONS.flame);
    expect(toIconPath(lucide('fan'))).toBe(ICONS.fan);
    expect(toIconPath(lucide('door-open'))).toBe(ICONS.door);
  });

  it('ICO-1 bulb is Lucide lightbulb', () => expect(ICONS.bulb).toBe(toIconPath(lucide('lightbulb'))));
  it('ICO-2 sun is Lucide sun', () => expect(ICONS.sun).toBe(toIconPath(lucide('sun'))));
  it('ICO-3 rainbow is Lucide rainbow', () => expect(ICONS.rainbow).toBe(toIconPath(lucide('rainbow'))));

  it('the gate 1 icons follow the 24 Liquid Climate icons, then the 0.3 icons, nothing else', () => {
    expect(Object.keys(ICONS).slice(24)).toEqual(['bulb', 'sun', 'rainbow', 'history', ...Object.keys(P2)]);
  });

  it('the rect conversion writes Lucide square as one closed path', () => {
    expect(toIconPath(lucide('square'))).toBe('M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z');
  });

  for (const [key, file] of Object.entries(P2)) {
    it(`0.3 ${key} is Lucide ${file}`, () => expect(ICONS[key as keyof typeof P2]).toBe(toIconPath(lucide(file))));
  }

  it('every icon is path data only (line icons, no shapes or fills)', () => {
    for (const d of Object.values(ICONS)) expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,-]+$/);
  });
});

describe('ICONS.history', () => {
  it('is Lucide history', () => {
    const svg = lucide('history');
    expect(svg).toContain('@license lucide-static v0.460.0 - ISC');
    expect(ICONS.history).toBe(toIconPath(svg));
  });
});

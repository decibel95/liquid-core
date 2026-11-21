// Writes test/fixtures/lc-0.11.1-tokens.json from Liquid Climate at commit 373b340 (0.11.1).
// Usage: node scripts/parity-fixture.mjs [path-to-liquid-climate-checkout]   (default ../liquid-climate)
// The checkout is only read, through `git show`, so its working tree does not matter. The committed
// fixture is what the tests use; they never need the Liquid Climate repo.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const COMMIT = '373b340';
const repo = resolve(process.argv[2] ?? new URL('../../liquid-climate', import.meta.url).pathname);
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (path) => git('show', `${COMMIT}:${path}`);

/** Transpiles a TypeScript module of Liquid Climate and loads it. Imports are dropped: the modules read here only use them inside functions. */
async function load(path, extraExports = '') {
  let js = ts.transpileModule(show(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  js = js.replace(/^import [^;]*;\s*$/gm, '') + extraExports;
  if (/^import /m.test(js)) throw new Error(`${path}: an import is left after stripping`);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const glass = await load('src/ui/glass.ts');
const modes = await load('src/ui/modes.ts', '\nexport { LIGHT_TONES };\n');

// Mode name to hex as Liquid Climate's MODES table has it, plus the neutral grey (the fan_only colour, TOK-14).
const palette = Object.fromEntries(modes.MODES.map((m) => [m.id, m.color]));
palette.neutral = palette.fan_only;

// Every focus ring Liquid Climate draws with its own glass colour: width, colour and offset.
const focusRing = [];
for (const file of git('ls-tree', '-r', '--name-only', COMMIT, 'src').split('\n').filter((f) => f.endsWith('.ts')).sort()) {
  const re = /outline:\s*(\d+px solid var\(--lc-bright\));\s*outline-offset:\s*(-?\d+px);/g;
  for (const m of show(file).matchAll(re)) focusRing.push({ file, outline: m[1], offset: m[2] });
}

// Card chrome: the stylesheet of each card, as written, with its ${unsafeCSS(GLASS_TABLE.path)} values filled in from
// the glass module and the shared sheets it pulls in (glassTokens, menuStyles) left out. test/chrome.test.ts parses
// these and compares every rule core copies.
const fill = (text, file) => {
  const out = text
    .replace(/^\s*\$\{(glassTokens|menuStyles)\}\s*$/gm, '')
    .replace(/\$\{unsafeCSS\((\w+)\.(\w+)\.(\w+)\)\}/g, (_m, table, g, key) => {
      const v = glass[table]?.[g]?.[key];
      if (typeof v !== 'string') throw new Error(`${file}: cannot resolve ${table}.${g}.${key}`);
      return v;
    })
    .replace(/\$\{unsafeCSS\((\w+)\.(\w+)\)\}/g, (_m, table, g) => {
      const v = glass[table]?.[g];
      if (typeof v !== 'string') throw new Error(`${file}: cannot resolve ${table}.${g}`);
      return v;
    });
  if (out.includes('${')) throw new Error(`${file}: an interpolation is left in the stylesheet`);
  return out;
};
const cssOf = (file) => {
  const src = show(file);
  const from = src.indexOf('css`', Math.max(0, src.indexOf('static override styles')));
  const to = src.indexOf('`', from + 4);
  return fill(src.slice(from + 4, to), file);
};
const chrome = {
  dial: cssOf('src/cards/dial/styles.ts'),
  tile: cssOf('src/cards/tile/liquid-climate-tile.ts'),
  badge: cssOf('src/cards/badge/liquid-climate-badge.ts'),
  cluster: cssOf('src/cards/cluster/liquid-climate-cluster.ts'),
};

// Values Liquid Climate writes in code rather than in a stylesheet.
const clusterSrc = show('src/cards/cluster/liquid-climate-cluster.ts');
const chevron = /const CHEVRON = '([^']+)';/.exec(clusterSrc)?.[1];
const clusterIcons = [...clusterSrc.matchAll(/this\._icon\(([^,]+), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)/g)]
  .filter((m) => !m[0].includes('path: string'))
  .map((m) => ({ icon: m[1], size: Number(m[2]), stroke: Number(m[3]) }));
const powerTint = Number(/background: on \? rgba\(color, ([\d.]+)\)/.exec(show('src/cards/dial/liquid-climate-card.ts'))?.[1]);
// Theme variables a user can set (plan 4.1, D-3): every --lc-* custom property Liquid Climate reads with a fallback
// and never sets itself anywhere.
const allSrc = git('ls-tree', '-r', '--name-only', COMMIT, 'src')
  .split('\n')
  .filter((f) => f.endsWith('.ts'))
  .map(show)
  .join('\n');
const themeVars = [...new Set([...allSrc.matchAll(/var\((--lc-[a-z-]+), /g)].map((m) => m[1]))].filter((v) => !allSrc.includes(`${v}:`));
themeVars.sort();
if (!chevron || !clusterIcons.length || !powerTint) throw new Error('chrome values not found in the Liquid Climate source');

const fixture = {
  source: { project: 'liquid-climate', version: '0.11.1', commit: COMMIT },
  GLASS: glass.GLASS,
  MENU_GLASS: glass.MENU_GLASS,
  DOT_RING: glass.DOT_RING,
  ROOM_FILL: glass.ROOM_FILL,
  palette,
  STATUS_COLORS: modes.STATUS_COLORS,
  TINT: modes.TINT,
  LIGHT_TONES: modes.LIGHT_TONES,
  ICONS: modes.ICONS,
  focusRing,
  powerTint,
  chevron,
  clusterIcons,
  themeVars,
  chrome,
};

const out = new URL('../test/fixtures/lc-0.11.1-tokens.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${out.pathname}: ${Object.keys(modes.ICONS).length} icons, ${focusRing.length} focus rings`);

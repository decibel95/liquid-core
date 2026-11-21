// tsc keeps relative imports exactly as written in src/ ('./glass'). Native Node ESM, and Vitest when it
// loads a dependency from node_modules, need the file extension, so add '.js' to every relative
// specifier in dist/. Idempotent. Fails when a rewritten specifier has no matching file (for example a
// directory import such as './foo' that would need './foo/index.js').
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const SPEC = /(\bfrom\s*['"]|\bimport\s*\(\s*['"]|\bimport\s*['"])(\.{1,2}\/[^'"]*?)(['"])/g;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

let changed = 0;
const missing = [];
for (const file of walk(dist).filter((f) => f.endsWith('.js') || f.endsWith('.d.ts'))) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SPEC, (m, a, spec, q) => {
    const target = /\.[cm]?[jt]s$|\.json$/.test(spec) ? spec : `${spec}.js`;
    if (!existsSync(resolve(dirname(file), target))) missing.push(`${file.slice(dist.length)}: '${spec}' has no ${target} in dist/`);
    return target === spec ? m : `${a}${target}${q}`;
  });
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
if (missing.length > 0) {
  console.error(`add-js-extensions: unresolved relative imports (directory imports need an explicit /index in src):\n${missing.join('\n')}`);
  process.exit(1);
}
console.log(`add-js-extensions: updated ${changed} files`);

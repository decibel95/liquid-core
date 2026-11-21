// @vitest-environment node
import { describe, expect, it } from 'vitest';

// liquid-core registers no custom elements: each product defines its own prefixed tags (plan section 2.3).
// The project has no Node typings (tsconfig types: []), so Node modules are loaded through typed shims.
const names = { fs: 'node:fs', url: 'node:url' };
const fs = (await import(/* @vite-ignore */ names.fs)) as {
  readdirSync: (dir: string, opts: { recursive: boolean }) => string[];
  readFileSync: (file: string, enc: 'utf8') => string;
};
const url = (await import(/* @vite-ignore */ names.url)) as { fileURLToPath: (u: URL) => string };

const srcDir = url.fileURLToPath(new URL('../src/', import.meta.url));
const files = fs.readdirSync(srcDir, { recursive: true }).filter((f) => f.endsWith('.ts'));
const forbidden = ['customElements.define', 'customElements.get', '@customElement'];

describe('no custom element registration', () => {
  it('sees the source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const word of forbidden) {
    it(`src/ has no ${word}`, () => {
      const hits = files.filter((f) => fs.readFileSync(srcDir + f, 'utf8').includes(word));
      expect(hits).toEqual([]);
    });
  }
});

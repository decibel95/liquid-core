// @vitest-environment node
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { LIQUID_FONT_FILE, LIQUID_FONT_UNICODE_RANGE, ensureLiquidFont } from '../src/font';

// The committed font file, built by scripts/build-font.sh. CI has no fonttools, so this catches an accidental change.
// After an intended rebuild, update both values here and OUTPUT_SHA256 in the script.
const FONT_SHA256 = 'ec9d62021ca5940db5f5b700613aebf24d379039553795447cd407cd35b253d7';
const FONT_BYTES = 43008;

// The project has no Node typings (tsconfig types: []), so Node modules are loaded through typed shims.
const names = { fs: 'node:fs', crypto: 'node:crypto', url: 'node:url' };
const fs = (await import(/* @vite-ignore */ names.fs)) as {
  readFileSync: { (file: string): Uint8Array; (file: string, enc: 'utf8'): string };
};
const crypto = (await import(/* @vite-ignore */ names.crypto)) as {
  createHash: (alg: string) => { update: (data: Uint8Array) => { digest: (enc: 'hex') => string } };
};
const url = (await import(/* @vite-ignore */ names.url)) as { fileURLToPath: (u: URL) => string };
const path = (rel: string) => url.fileURLToPath(new URL(`../${rel}`, import.meta.url));

describe('the committed font file', () => {
  const bytes = fs.readFileSync(path(LIQUID_FONT_FILE));

  it('is the reviewed build (size and sha256)', () => {
    expect(bytes.length).toBe(FONT_BYTES);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(FONT_SHA256);
  });

  it('is a woff2 file', () => {
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOF2');
  });

  it('the build script records the same sha256 and the same unicode range as src/font.ts', () => {
    const script = fs.readFileSync(path('scripts/build-font.sh'), 'utf8');
    expect(script).toContain(`OUTPUT_SHA256="${FONT_SHA256}"`);
    expect(script).toContain(`UNICODES="${LIQUID_FONT_UNICODE_RANGE.replace(/, /g, ',')}"`);
  });
});

describe('packaging', () => {
  it('ships the font and its licence, and exports the font path', () => {
    expect(pkg.files).toContain('fonts');
    expect(pkg.exports).toHaveProperty('./fonts/*', './fonts/*');
    // Both files resolve through the single export pattern, as a consumer resolves them.
    for (const f of [LIQUID_FONT_FILE, 'fonts/OFL.txt']) {
      expect(f.replace(/^fonts\//, './fonts/')).toMatch(/^\.\/fonts\/[^/]+$/);
      expect(fs.readFileSync(path(f)).length).toBeGreaterThan(0);
    }
    expect(fs.readFileSync(path('fonts/OFL.txt'), 'utf8')).toMatch(/^Copyright \(c\) 2016 The Inter Project Authors[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/);
    expect(fs.readFileSync(path('NOTICE'), 'utf8')).toContain('fonts/OFL.txt');
  });
});

describe('ensureLiquidFont without a document', () => {
  it('is a no-op in Node (SSR)', () => {
    expect(typeof document).toBe('undefined');
    expect(() => ensureLiquidFont('/liquid-inter.woff2')).not.toThrow();
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialChrome } from '../src/chrome';
import { LIQUID_FONT_FAMILY, LIQUID_FONT_STACK, LIQUID_FONT_STYLE_ID, LIQUID_FONT_UNICODE_RANGE, ensureLiquidFont } from '../src/font';

const RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2190-2193, U+2212, U+2215, U+2264-2265, U+FEFF, U+FFFD, U+0100-017F';
const styles = () => [...document.querySelectorAll('style')];

afterEach(() => {
  for (const s of styles()) s.remove();
});

describe('ensureLiquidFont', () => {
  it('adds one style to document.head with the @font-face rule', () => {
    ensureLiquidFont('https://example.test/hacsfiles/liquid-home/liquid-inter.woff2');
    const all = styles();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(LIQUID_FONT_STYLE_ID);
    expect(all[0].parentNode).toBe(document.head);
    expect(all[0].textContent).toBe(
      "@font-face { font-family: 'Liquid Inter'; src: url(\"https://example.test/hacsfiles/liquid-home/liquid-inter.woff2\") format('woff2'); " +
        `font-weight: 200 600; font-style: normal; font-display: swap; unicode-range: ${RANGE}; }`,
    );
  });

  // happy-dom's CSS parser drops the weight range (`font-weight: 200 600`), so the weight is checked in the exact text above.
  it('the CSS parses to one font-face with the family, swap, range and URL', () => {
    ensureLiquidFont('/hacsfiles/liquid-home/liquid-inter.woff2');
    const sheet = (document.getElementById(LIQUID_FONT_STYLE_ID) as HTMLStyleElement).sheet!;
    expect(sheet.cssRules).toHaveLength(1);
    const text = sheet.cssRules[0].cssText;
    expect(text).toMatch(/^@font-face/);
    expect(text).toMatch(/font-family: ["']Liquid Inter["']/);
    expect(text).toContain('url("/hacsfiles/liquid-home/liquid-inter.woff2")');
    expect(text).toContain("format('woff2')");
    expect(text).toContain('font-display: swap');
    expect(text).toContain('U+0100-017F');
  });

  it('is idempotent: later calls with another URL change nothing', () => {
    ensureLiquidFont('/a/liquid-inter.woff2');
    const first = document.getElementById(LIQUID_FONT_STYLE_ID)!;
    const css = first.textContent;
    ensureLiquidFont('/b/liquid-inter.woff2');
    ensureLiquidFont('/a/liquid-inter.woff2');
    expect(styles()).toEqual([first]);
    expect(first.textContent).toBe(css);
    expect(css).toContain('/a/liquid-inter.woff2');
  });

  it('registers once across two copies of core (separate module instances, as two bundles)', async () => {
    vi.resetModules();
    const copyA = await import('../src/font');
    vi.resetModules();
    const copyB = await import('../src/font');
    expect(copyA).not.toBe(copyB);
    expect(copyA.ensureLiquidFont).not.toBe(copyB.ensureLiquidFont);
    copyA.ensureLiquidFont('/hacsfiles/liquid-home/liquid-inter.woff2');
    copyB.ensureLiquidFont('/hacsfiles/liquid-climate/liquid-inter.woff2');
    ensureLiquidFont('/third/liquid-inter.woff2');
    expect(styles()).toHaveLength(1);
    expect(styles()[0].textContent).toContain('/hacsfiles/liquid-home/liquid-inter.woff2');
  });

  it('escapes quotes, backslashes and line breaks in the URL so it stays one CSS string', () => {
    ensureLiquidFont('/x"); color: red; /*\\\n.woff2');
    expect(styles()[0].textContent).toContain('url("/x\\"); color: red; /*\\\\\\a .woff2")');
    const sheet = (styles()[0] as HTMLStyleElement).sheet!;
    expect(sheet.cssRules).toHaveLength(1);
  });

  it('puts nothing into a shadow root', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    ensureLiquidFont('/liquid-inter.woff2');
    expect(root.querySelector('style')).toBeNull();
    host.remove();
  });

  it('registers even when an unrelated element already has the id', () => {
    const div = document.createElement('div');
    div.id = LIQUID_FONT_STYLE_ID;
    document.body.appendChild(div);
    try {
      ensureLiquidFont('/liquid-inter.woff2');
      expect(styles()).toHaveLength(1);
    } finally {
      div.remove();
    }
  });

  it('is a no-op when document.head is null', () => {
    const head = document.head;
    head.remove();
    try {
      expect(document.head).toBeNull();
      expect(() => ensureLiquidFont('/liquid-inter.woff2')).not.toThrow();
    } finally {
      document.documentElement.prepend(head);
    }
    expect(styles()).toHaveLength(0);
  });

  it('does nothing without a document', () => {
    vi.stubGlobal('document', undefined);
    try {
      expect(() => ensureLiquidFont('/liquid-inter.woff2')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(styles()).toHaveLength(0);
  });
});

describe('font constants', () => {
  it('the family is Liquid Inter and the unicode range is the build range', () => {
    expect(LIQUID_FONT_FAMILY).toBe('Liquid Inter');
    expect(LIQUID_FONT_UNICODE_RANGE).toBe(RANGE);
  });

  it("the FONT stack starts with 'Liquid Inter' and keeps the Liquid Climate fallbacks", () => {
    expect(LIQUID_FONT_STACK).toBe("'Liquid Inter', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
    expect(dialChrome.cssText).toContain(`font-family: ${LIQUID_FONT_STACK};`);
  });
});

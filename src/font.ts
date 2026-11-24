// The Inter font that liquid-core ships, so the cards look the same on every OS.
// fonts/liquid-inter.woff2 is a subset of Inter 4.1 (variable weight 200..600, optical size 14, Latin and Latin
// Extended-A), built by scripts/build-font.sh. Inter is under the SIL Open Font License 1.1 (fonts/OFL.txt).
//
// The face is registered under its own family name, 'Liquid Inter', not 'Inter': a document-level 'Inter' face would
// also change every other card on the page whose font stack starts with 'Inter' (Liquid Climate 0.11.1 does).

// Versioning: when the font build changes incompatibly, change LIQUID_FONT_FAMILY and LIQUID_FONT_STYLE_ID together
// (for example with a '-2' suffix). The first injected face wins document-wide, so an old bundle that registers the
// old face must not be able to shadow the new one.

/** The CSS family name of the shipped face. */
export const LIQUID_FONT_FAMILY = 'Liquid Inter';

/** The font stack of the card chrome: the shipped face first, then an installed Inter, then the system fonts. */
export const LIQUID_FONT_STACK = `'${LIQUID_FONT_FAMILY}', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

/** The font file inside the package (`@decibel95/liquid-core/fonts/liquid-inter.woff2`). Consumers copy it next to their bundle. */
export const LIQUID_FONT_FILE = 'fonts/liquid-inter.woff2';

/** The code points in the font file. Same list as UNICODES in scripts/build-font.sh. */
export const LIQUID_FONT_UNICODE_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2190-2193, U+2212, U+2215, U+2264-2265, U+FEFF, U+FFFD, U+0100-017F';

/** The id of the `<style>` element ensureLiquidFont() adds to `document.head`. Every copy of core checks for it. */
export const LIQUID_FONT_STYLE_ID = 'liquid-core-font';

/** A CSS string literal: backslash, double quote and line breaks escaped. */
const cssString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

/**
 * Registers the 'Liquid Inter' face once per document: one `<style id="liquid-core-font">` in `document.head` with the
 * `@font-face` rule. The guard is that element, not module state, so several bundles that each carry their own copy of
 * core register it once; the first URL wins and later calls (with any URL) do nothing. Without a document (SSR, tests
 * in Node) it does nothing. `@font-face` does not work inside a shadow root, so it never goes there.
 *
 * `url` is where the consumer serves fonts/liquid-inter.woff2, usually next to its bundle: see the README ("Font") for
 * the `new URL(...)` form that survives Vite library mode and keeps the HACS cache query.
 */
export function ensureLiquidFont(url: string): void {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.querySelector(`style#${LIQUID_FONT_STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = LIQUID_FONT_STYLE_ID;
  style.textContent =
    `@font-face { font-family: '${LIQUID_FONT_FAMILY}'; src: url(${cssString(url)}) format('woff2'); ` +
    `font-weight: 200 600; font-style: normal; font-display: swap; unicode-range: ${LIQUID_FONT_UNICODE_RANGE}; }`;
  document.head.appendChild(style);
}

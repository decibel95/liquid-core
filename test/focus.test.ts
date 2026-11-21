import { describe, expect, it } from 'vitest';
import { focusRing } from '../src/focus';

const css = focusRing.cssText.replace(/\s+/g, ' ');

describe('focusRing (TOK-19)', () => {
  it('2px lc-bright, offset 2px on buttons', () => {
    expect(css).toContain('outline: 2px solid var(--lc-bright); outline-offset: 2px;');
    expect(css).toContain('button:focus-visible');
  });

  it('offset 3px on sliders, both the slider role and the slider frame (also as a switch)', () => {
    expect(css).toContain("[role='slider']:focus-visible, .lc-slider:focus-visible { outline-offset: 3px; }");
  });

  it('only for keyboard focus: every ring rule is :focus-visible, plain focus has no outline', () => {
    const rules = css.match(/[^{}]+\{[^}]*outline:[^}]*\}/g) ?? [];
    for (const r of rules.filter((x) => !x.includes('outline: none'))) {
      for (const sel of r.split('{')[0].split(',')) expect(sel.trim()).toMatch(/:focus-visible$/);
    }
    expect(css).toContain(':focus:not(:focus-visible) { outline: none; }');
  });

  it('is an outline, never a background or border, so it stays distinct from the selected mode button tint (TOK-22)', () => {
    expect(css).not.toMatch(/background|border|box-shadow/);
  });
});

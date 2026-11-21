// @vitest-environment happy-dom
import { LitElement, html, render } from 'lit';
import { describe, expect, it, vi } from 'vitest';
import { editorStyles, helpLink, lookFields, segField, type LookValues } from '../src/editor';
import { createI18n } from '../src/i18n';

const { t: rawT } = createI18n([]);
const t = (key: string, vars?: Record<string, string | number>) => rawT({ language: 'en' }, key, vars);
const look: LookValues = { glass: 'theme', blur: 24, motion: 'rich', tint: 0.1 };

function draw(tpl: unknown) {
  const host = document.createElement('div');
  render(tpl as never, host);
  return host;
}

describe('segField', () => {
  it('renders a radiogroup with the current value checked and reports a pick', () => {
    const onChange = vi.fn();
    const host = draw(segField('Glass', 'dark', [['dark', 'Dark'], ['light', 'Light']] as const, onChange));
    const group = host.querySelector('[role=radiogroup]')!;
    expect(group.getAttribute('aria-label')).toBe('Glass');
    const radios = [...host.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios[0].className).toBe('on');
    radios[1].click();
    expect(onChange).toHaveBeenCalledWith('light');
  });
});

describe('lookFields', () => {
  it('draws glass, blur, motion and the hint, without tint by default', () => {
    const host = draw(lookFields(look, t, () => {}));
    expect(host.querySelectorAll('[role=radiogroup]').length).toBe(2);
    expect(host.querySelectorAll('input[type=range]').length).toBe(1);
    expect(host.textContent).toContain('Glass');
    expect(host.textContent).toContain('24 px');
    expect(host.textContent).not.toContain('Mode tint');
    expect(host.textContent).toContain('Reduced motion in the OS always wins.');
  });
  it('adds the tint slider when asked', () => {
    const onChange = vi.fn();
    const host = draw(lookFields(look, t, onChange, { tint: true }));
    const ranges = host.querySelectorAll<HTMLInputElement>('input[type=range]');
    expect(ranges.length).toBe(2);
    expect(host.textContent).toContain('Mode tint');
    expect(host.textContent).toContain('10%');
    ranges[0].value = '20';
    ranges[0].dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith({ tint: 0.2 });
  });
  it('reports one changed option at a time', () => {
    const onChange = vi.fn();
    const host = draw(lookFields(look, t, onChange));
    const range = host.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '40';
    range.dispatchEvent(new Event('input'));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role=radio]');
    radios[1].click(); // glass: dark
    radios[5].click(); // motion: minimal
    expect(onChange.mock.calls).toEqual([[{ blur: 40 }], [{ glass: 'dark' }], [{ motion: 'minimal' }]]);
  });
  it('speaks the product language', () => {
    const nl = (key: string) => rawT({ language: 'nl' }, key);
    expect(draw(lookFields(look, nl, () => {})).textContent).toContain('Beweging');
  });
});

describe('helpLink', () => {
  it('links to the docs section and names it for assistive technology', () => {
    const a = draw(helpLink('https://docs.example/x', 'light', 'brightness', 'Brightness', t)).querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://docs.example/x/cards/light#light-brightness');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('aria-label')).toBe('Help: Brightness');
  });
});

describe('editorStyles', () => {
  it('renders inside an element and carries the generic classes', () => {
    class Ed extends LitElement {
      static override styles = editorStyles;
      protected override render() {
        return html`${segField('G', 'a', [['a', 'A']] as const, () => {})}${helpLink('u', 'c', 's', 'S', t)}`;
      }
    }
    customElements.define('test-core-editor', Ed);
    const el = document.createElement('test-core-editor') as Ed;
    document.body.append(el);
    const css = [editorStyles].flat().map((s) => (s as { cssText: string }).cssText).join('');
    for (const cls of ['.seg', '.field', '.lbl', '.hint', '.help', '.sw', '.lblrow']) expect(css).toContain(cls);
    expect(css).not.toMatch(/liquid-climate|lc-/);
  });
});

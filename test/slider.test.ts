// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { LitElement, html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusRing } from '../src/focus';
import { brightnessPercent, levelPercent, renderSlider, SliderController, sliderStyles, spectrumGradient, type SliderView } from '../src/slider';
import { SPECTRUM } from '../src/tokens';

// The test defines its own tag: core never does.
class TestSlider extends LitElement {
  static override styles = [focusRing, sliderStyles];
  calls: [string, ...unknown[]][] = [];
  slider = new SliderController(this, {
    onStart: (s) => this.calls.push(['start', s]),
    onPreview: (v, s) => this.calls.push(['preview', v, s]),
    onEnd: (v, s) => this.calls.push(['end', v, s]),
    onToggle: (n) => this.calls.push(['toggle', n]),
  });
  view: SliderView = { kind: 'level', value: 40, on: true, color: '#ff4070', label: 'Kitchen brightness' };
  protected override render() {
    // Wrapped: happy-dom misparses a child marker at the top level of a template.
    return html`<div>${renderSlider(this.slider, this.view)}</div>`;
  }
}
customElements.define('test-slider', TestSlider);

const base: SliderView = { kind: 'level', value: 40, on: true, color: '#ff4070', label: 'Kitchen brightness' };

async function mount(view: Partial<SliderView> = {}) {
  const el = document.createElement('test-slider') as TestSlider;
  el.view = { ...base, ...view };
  document.body.append(el);
  await el.updateComplete;
  return el;
}
const pill = (el: TestSlider) => el.shadowRoot!.querySelector('.lc-slider') as HTMLElement;
const fill = (el: TestSlider) => el.shadowRoot!.querySelector('.lc-slider-fill') as HTMLElement;
const attr = (el: TestSlider, name: string) => pill(el).getAttribute(name);
const of = (el: TestSlider, kind: string) => el.calls.filter((c) => c[0] === kind);

function pointer(el: TestSlider, type: string, clientY: number, pointerId = 1) {
  pill(el).dispatchEvent(new PointerEvent(type, { pointerId, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
}
async function key(el: TestSlider, k: string, up = true) {
  pill(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  if (up) pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
  await el.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('aria (plan 2.9, CHO-8)', () => {
  it('level while on: role slider, 0 to 100, valuenow max(1, round(brightness / 255 x 100)), localized text', async () => {
    const el = await mount({ value: brightnessPercent(115) });
    expect(attr(el, 'role')).toBe('slider');
    expect(attr(el, 'tabindex')).toBe('0');
    expect(attr(el, 'aria-orientation')).toBe('vertical');
    expect([attr(el, 'aria-valuemin'), attr(el, 'aria-valuemax'), attr(el, 'aria-valuenow')]).toEqual(['0', '100', '45']);
    expect(attr(el, 'aria-valuetext')).toBe('45%');
    expect(attr(el, 'aria-label')).toBe('Kitchen brightness');
    expect(attr(el, 'aria-disabled')).toBe('false');
    expect(attr(el, 'aria-checked')).toBeNull();
  });

  it('level at brightness 1 reads 1 %, never 0 while on', async () => {
    const el = await mount({ value: brightnessPercent(1) });
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['1', '1%']);
    expect(levelPercent(0.2, true)).toBe(1);
    expect(levelPercent(80, false)).toBe(0);
  });

  it('level while off: valuenow 0 and "Off", empty fill', async () => {
    const el = await mount({ on: false, value: 70 });
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', 'Off']);
    expect(fill(el).style.height).toBe('0%');
  });

  it('value text follows the HA language through core i18n', async () => {
    const nl = await mount({ on: false, hass: { language: 'nl' } });
    expect(attr(nl, 'aria-valuetext')).toBe('Uit');
    const de = await mount({ value: 45, hass: { language: 'de' } });
    expect(attr(de, 'aria-valuetext')).toBe('45 %');
  });

  it('a product i18n overrides the core text', async () => {
    const el = await mount({ i18n: { t: (_h, k, v) => `${k}:${v?.value ?? ''}` } });
    expect(attr(el, 'aria-valuetext')).toBe('core.percent:40');
  });

  it('unavailable: aria-disabled, "Unavailable", TOK-9 opacity from the stylesheet', async () => {
    const el = await mount({ available: false });
    expect(attr(el, 'aria-disabled')).toBe('true');
    expect(attr(el, 'aria-valuetext')).toBe('Unavailable');
    expect(sliderStyles.cssText).toMatch(/\.lc-slider\[aria-disabled='true'\]\s*\{\s*opacity: 0\.3;/);
  });

  it('position (White, Colour): caller value text, 0 to 100', async () => {
    const el = await mount({ kind: 'position', value: 30.4, valueText: (v) => `${2000 + v * 45} K`, label: 'Kitchen warmth' });
    expect([attr(el, 'aria-valuemin'), attr(el, 'aria-valuemax'), attr(el, 'aria-valuenow')]).toEqual(['0', '100', '30']);
    expect(attr(el, 'aria-valuetext')).toBe('3350 K');
    expect(attr(el, 'aria-label')).toBe('Kitchen warmth');
  });

  it('toggle (TOK-8): role switch with aria-checked, no value attributes, full or empty', async () => {
    const on = await mount({ kind: 'toggle', label: 'Entrance' });
    expect(attr(on, 'role')).toBe('switch');
    expect(attr(on, 'aria-checked')).toBe('true');
    for (const a of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext', 'aria-orientation']) expect(attr(on, a)).toBeNull();
    expect(fill(on).style.height).toBe('100%');
    const off = await mount({ kind: 'toggle', on: false, label: 'Entrance' });
    expect(attr(off, 'aria-checked')).toBe('false');
    expect(fill(off).style.height).toBe('0%');
  });
});

describe('frame and fill (TOK-1 to TOK-4)', () => {
  it('96 x 280, radius 26, track and edge from glass tokens, no knob element', async () => {
    const el = await mount();
    const css = sliderStyles.cssText;
    expect(css).toMatch(/width: 96px;/);
    expect(css).toMatch(/height: 280px;/);
    expect(css).toMatch(/min-height: 200px;/);
    expect(css).toMatch(/border-radius: 26px;/);
    expect(css).toMatch(/background: var\(--lc-track\);/);
    expect(css).toMatch(/border: 1px solid var\(--lc-btn-edge\);/);
    expect(pill(el).children).toHaveLength(1); // the fill only
    expect(pill(el).style.height).toBe('280px');
  });

  it('fill grows from the bottom in the caller colour', async () => {
    const el = await mount({ value: 62.5 });
    expect(fill(el).style.height).toBe('62.5%');
    expect(fill(el).style.backgroundColor).toMatch(/#ff4070|rgb\(255, 64, 112\)/);
    expect(fill(el).getAttribute('aria-hidden')).toBe('true');
  });

  it('a height option never goes below TOK-2 min 200', async () => {
    const el = await mount({ height: 150 });
    expect(pill(el).style.height).toBe('200px');
  });

  it('toned spectrum stops are drawn as a gradient anchored to the whole pill', async () => {
    const stops = SPECTRUM.toned.dark.kelvin;
    const el = await mount({ kind: 'position', stops });
    expect(fill(el).style.backgroundImage).toContain('linear-gradient(to top');
    expect(fill(el).style.backgroundSize).toBe('100% 278px');
    expect(spectrumGradient(['#000000', '#ffffff', '#ff0000'])).toBe('linear-gradient(to top, #000000 0.0%, #ffffff 50.0%, #ff0000 100.0%)');
  });
});

describe('relative drag (CHO-8, gate 2)', () => {
  it('moves by the pointer delta from the grab point, not to the pointer position', async () => {
    const el = await mount({ value: 40 });
    pointer(el, 'pointerdown', 20); // near the top of the pill: an absolute slider would jump to about 93 %
    pointer(el, 'pointermove', 20 - 28); // 28 px up on a 280 px pill = +10 %
    await el.updateComplete;
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 50, 'pointer']);
    expect(fill(el).style.height).toBe('50%');
    expect(attr(el, 'aria-valuenow')).toBe('50');
    pointer(el, 'pointermove', 20 + 56); // 20 % down from the grab point
    pointer(el, 'pointerup', 20 + 56);
    await el.updateComplete;
    expect(of(el, 'start')).toEqual([['start', 'pointer']]);
    expect(of(el, 'end')).toEqual([['end', 20, 'pointer']]);
  });

  it('a tap without movement does not jump and sends nothing', async () => {
    const el = await mount({ value: 40 });
    pointer(el, 'pointerdown', 270); // the bottom of the pill
    pointer(el, 'pointermove', 270); // a move without movement
    pointer(el, 'pointerup', 270);
    await el.updateComplete;
    expect(of(el, 'preview')).toEqual([]);
    expect(of(el, 'end')).toEqual([['end', null, 'pointer']]);
    expect(fill(el).style.height).toBe('40%');
  });

  it('level: dragging below half a percent is off, just above shows 1 %', async () => {
    const el = await mount({ value: 10 });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 100 + 27.3); // -9.75 % => 0.25 %
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 0, 'pointer']);
    pointer(el, 'pointermove', 100 + 26.5); // 0.54 %
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 1, 'pointer']);
    pointer(el, 'pointermove', 100 + 400); // clamped at 0
    pointer(el, 'pointerup', 500);
    expect(of(el, 'end')).toEqual([['end', 0, 'pointer']]);
  });

  it('starts from 0 when off and clamps at 100', async () => {
    const el = await mount({ on: false, value: 80 });
    pointer(el, 'pointerdown', 200);
    pointer(el, 'pointermove', 200 - 1000);
    pointer(el, 'pointerup', 0);
    expect(of(el, 'end')).toEqual([['end', 100, 'pointer']]);
  });

  it('ignores other pointers during a drag and pointer cancel ends it', async () => {
    const el = await mount({ value: 40 });
    pointer(el, 'pointerdown', 100, 1);
    pointer(el, 'pointermove', 50, 2);
    expect(of(el, 'preview')).toEqual([]);
    pointer(el, 'pointercancel', 100, 1);
    expect(of(el, 'end')).toEqual([['end', null, 'pointer']]);
  });

  it('a drag cut off by removing the card still ends, so the queue is released', async () => {
    const el = await mount({ value: 40 });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 72);
    el.remove();
    expect(of(el, 'end')).toEqual([['end', 50, 'pointer']]);
  });

  it('unavailable ignores pointer and keys', async () => {
    const el = await mount({ available: false });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 50);
    pointer(el, 'pointerup', 50);
    await key(el, 'ArrowUp');
    expect(el.calls).toEqual([]);
  });

  it('position kind is not clamped to 1 at the bottom', async () => {
    const el = await mount({ kind: 'position', value: 5 });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 100 + 13.3); // -4.75
    expect((of(el, 'preview').at(-1)![1] as number).toFixed(2)).toBe('0.25');
  });
});

describe('on/off-only light (TOK-8, Q6)', () => {
  it('a tap toggles', async () => {
    const el = await mount({ kind: 'toggle', on: false, label: 'Entrance' });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointerup', 100);
    pill(el).click(); // the click that follows the pointer up must not toggle twice
    expect(of(el, 'toggle')).toEqual([['toggle', true]]);
  });

  it('a drag counts as a tap and toggles, with no preview', async () => {
    const el = await mount({ kind: 'toggle', on: true, label: 'Entrance' });
    pointer(el, 'pointerdown', 250);
    pointer(el, 'pointermove', 20);
    pointer(el, 'pointerup', 20);
    expect(el.calls).toEqual([['toggle', false]]);
  });

  it('pointer cancel does not toggle', async () => {
    const el = await mount({ kind: 'toggle', label: 'Entrance' });
    pointer(el, 'pointerdown', 250);
    pointer(el, 'pointercancel', 250);
    expect(el.calls).toEqual([]);
  });

  it('a click without a pointer gesture (assistive tech) toggles', async () => {
    const el = await mount({ kind: 'toggle', label: 'Entrance' });
    pill(el).click();
    expect(el.calls).toEqual([['toggle', false]]);
  });

  it('Space and Enter toggle; arrows do nothing', async () => {
    const el = await mount({ kind: 'toggle', on: false, label: 'Entrance' });
    await key(el, ' ');
    await key(el, 'Enter');
    await key(el, 'ArrowUp');
    expect(el.calls).toEqual([
      ['toggle', true],
      ['toggle', true],
    ]);
  });
});

describe('keyboard (CHO-8)', () => {
  // [state, key, expected preview or null for none]. Level state is the percent shown; 0 is off.
  const table: [number, string, number | null][] = [
    [45, 'ArrowUp', 46],
    [45, 'ArrowRight', 46],
    [100, 'ArrowUp', null],
    [45, 'ArrowDown', 44],
    [45, 'ArrowLeft', 44],
    [1, 'ArrowDown', 0], // Down from 1 % turns off
    [0, 'ArrowDown', null],
    [0, 'ArrowUp', 1],
    [45, 'PageUp', 55],
    [95, 'PageUp', 100],
    [0, 'PageUp', 10],
    [45, 'PageDown', 35],
    [5, 'PageDown', 1],
    [0, 'PageDown', null],
    [45, 'Home', 1], // the lowest on level
    [0, 'Home', 1],
    [45, 'End', 100],
    [0, 'End', 100],
  ];
  for (const [state, k, expected] of table) {
    it(`level ${state} % + ${k} => ${expected ?? 'no change'}`, async () => {
      const el = await mount({ value: state, on: state > 0 });
      await key(el, k);
      expect(of(el, 'preview')).toEqual(expected === null ? [] : [['preview', expected, 'key']]);
      expect(of(el, 'start')).toEqual([['start', 'key']]);
      expect(of(el, 'end')).toEqual([['end', expected, 'key']]);
    });
  }

  it('held keys step from the previewed value; key up flushes the final value once', async () => {
    const el = await mount({ value: 45 });
    await key(el, 'ArrowUp', false);
    await key(el, 'ArrowUp', false);
    await key(el, 'PageUp', false);
    expect(attr(el, 'aria-valuenow')).toBe('57');
    expect(of(el, 'start')).toHaveLength(1);
    expect(of(el, 'end')).toEqual([]);
    pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: 'PageUp', bubbles: true }));
    expect(of(el, 'end')).toEqual([['end', 57, 'key']]);
  });

  it('blur ends a key gesture', async () => {
    const el = await mount({ value: 45 });
    await key(el, 'End', false);
    pill(el).dispatchEvent(new FocusEvent('blur'));
    expect(of(el, 'end')).toEqual([['end', 100, 'key']]);
  });

  it('other keys and modified keys pass through', async () => {
    const el = await mount({ value: 45 });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    pill(el).dispatchEvent(tab);
    const ctrl = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true, cancelable: true });
    pill(el).dispatchEvent(ctrl);
    expect([tab.defaultPrevented, ctrl.defaultPrevented]).toEqual([false, false]);
    expect(el.calls).toEqual([]);
  });

  it('handled keys prevent the page from scrolling', async () => {
    const el = await mount({ value: 45 });
    const e = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
    pill(el).dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('position kind: arrows 1, Page 10, Home 0, End 100, clamped', () => {
    const step = (k: string, cur: number) => SliderController.step('position', k, cur);
    expect([step('ArrowUp', 50), step('ArrowLeft', 50), step('PageUp', 95), step('PageDown', 5), step('Home', 50), step('End', 50), step('x', 50)]).toEqual([
      51,
      49,
      100,
      0,
      0,
      100,
      undefined,
    ]);
  });
});

describe('keyStep (Q4: the fan steps by percentage_step)', () => {
  // A 20-speed fan (percentage_step 5) per Q4: arrows one step, Page Up/Down max(1, round(10 / step)) steps,
  // Home the lowest step, End 100, Down from the lowest step to 0 (off).
  const STEP = 5;
  const PAGE = Math.max(1, Math.round(10 / STEP)) * STEP;
  const fanKeys = (cur: number, key: string): number | undefined =>
    ({
      ArrowUp: Math.min(100, cur + STEP),
      ArrowRight: Math.min(100, cur + STEP),
      ArrowDown: Math.max(0, cur - STEP),
      ArrowLeft: Math.max(0, cur - STEP),
      PageUp: Math.min(100, cur + PAGE),
      PageDown: cur === 0 ? 0 : Math.max(STEP, cur - PAGE),
      Home: STEP,
      End: 100,
    })[key];
  const table: [number, string, number][] = [
    [40, 'ArrowUp', 45],
    [40, 'ArrowRight', 45],
    [40, 'ArrowDown', 35],
    [40, 'ArrowLeft', 35],
    [40, 'PageUp', 50],
    [40, 'PageDown', 30],
    [40, 'Home', 5],
    [40, 'End', 100],
    [5, 'ArrowDown', 0], // Down from the lowest step turns off
  ];
  for (const [state, k, expected] of table) {
    it(`level ${state} % + ${k} => ${expected} through keyStep`, async () => {
      const keyStep = vi.fn(fanKeys);
      const el = await mount({ value: state, keyStep });
      await key(el, k);
      expect(keyStep).toHaveBeenCalledWith(state, k);
      expect(of(el, 'preview')).toEqual([['preview', expected, 'key']]);
      expect(of(el, 'end')).toEqual([['end', expected, 'key']]);
    });
  }

  it('held keys step from the previous keyStep output', async () => {
    const el = await mount({ value: 40, keyStep: fanKeys });
    await key(el, 'ArrowUp', false);
    await key(el, 'ArrowUp', false);
    await key(el, 'PageUp', false);
    expect(of(el, 'preview').map((c) => c[1])).toEqual([45, 50, 60]);
    pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: 'PageUp', bubbles: true }));
    expect(of(el, 'end')).toEqual([['end', 60, 'key']]);
  });

  it('undefined falls back to SliderController.step()', async () => {
    const keyStep = (_cur: number, k: string) => (k === 'ArrowUp' ? 60 : undefined);
    for (const [k, expected] of [
      ['ArrowUp', 60],
      ['PageUp', 50],
      ['Home', 1],
      ['End', 100],
    ] as const) {
      const el = await mount({ value: 40, keyStep });
      await key(el, k);
      expect(of(el, 'preview')).toEqual([['preview', expected, 'key']]);
    }
  });

  it('the toggle kind ignores it: Space toggles, arrows do nothing', async () => {
    const keyStep = vi.fn(() => 50);
    const el = await mount({ kind: 'toggle', label: 'Entrance', keyStep });
    await key(el, 'ArrowUp');
    await key(el, ' ');
    expect(keyStep).not.toHaveBeenCalled();
    expect(el.calls).toEqual([['toggle', false]]);
  });
});

describe('snap (Q8: the read-out follows the fan speed, the fill follows the finger)', () => {
  // A 3-speed fan: the nearest of 0, 33.3, 66.7 and 100.
  const third = 100 / 3;
  const snap3 = (v: number) => Math.round(v / third) * third;

  it('aria values are snapped, the fill is not', async () => {
    const el = await mount({ value: 60, snap: snap3 });
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['67', '67%']);
    expect(fill(el).style.height).toBe('60%');
  });

  it('snap runs before valueText, which gets the snapped value', async () => {
    const valueText = vi.fn((v: number) => `speed ${v}`);
    const el = await mount({ value: 60, snap: snap3, valueText });
    expect(valueText).toHaveBeenCalledWith(67);
    expect(valueText).not.toHaveBeenCalledWith(60);
    expect(attr(el, 'aria-valuetext')).toBe('speed 67');
  });

  it('level: a snapped 0 reads off (valuenow 0, "Off"), never 0 %, and valueText is not asked', async () => {
    const valueText = vi.fn((v: number) => `speed ${v}`);
    const el = await mount({ value: 10, snap: snap3, valueText });
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', 'Off']);
    expect(fill(el).style.height).toBe('10%');
    expect(valueText).not.toHaveBeenCalled();
  });

  it('level: dragged to 10 % on a 3-speed snap, the preview and fill are 10 % while aria reads Off', async () => {
    const el = await mount({ value: 40, snap: snap3 });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 100 + 84); // 30 % down from the grab point
    await el.updateComplete;
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 10, 'pointer']);
    expect(fill(el).style.height).toBe('10%');
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', 'Off']);
    pointer(el, 'pointermove', 100 + 28); // 30 %, snaps to 33.3
    await el.updateComplete;
    expect(fill(el).style.height).toBe('30%');
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['33', '33%']);
  });

  it('position: snapped value, no off rule', async () => {
    const el = await mount({ kind: 'position', value: 10, snap: snap3, valueText: (v) => `p${v}` });
    expect([attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', 'p0']);
    expect(fill(el).style.height).toBe('10%');
  });

  it('unset keeps today\'s output: a level just above 0 reads 1 %, where a snap to 0 reads Off', async () => {
    const plain = await mount({ value: 0.2 });
    expect([attr(plain, 'aria-valuenow'), attr(plain, 'aria-valuetext')]).toEqual(['1', '1%']);
    const snapped = await mount({ value: 0.2, snap: () => 0 });
    expect([attr(snapped, 'aria-valuenow'), attr(snapped, 'aria-valuetext')]).toEqual(['0', 'Off']);
    const unset = await mount({ value: 60, snap: undefined });
    expect(pill(unset).outerHTML).toBe(pill(await mount({ value: 60 })).outerHTML);
  });

  it('off and unavailable win over the snap', async () => {
    const off = await mount({ on: false, value: 70, snap: snap3 });
    expect([attr(off, 'aria-valuenow'), attr(off, 'aria-valuetext')]).toEqual(['0', 'Off']);
    const na = await mount({ available: false, value: 70, snap: snap3 });
    expect(attr(na, 'aria-valuetext')).toBe('Unavailable');
  });
});

describe('motion (TOK-10, plan 2.9)', () => {
  it('the fill eases height and colour over 0.8 s', () => {
    expect(sliderStyles.cssText).toMatch(/transition: height 800ms ease, background-color 800ms ease;/);
  });

  it('reduced motion removes the transition in CSS', () => {
    expect(sliderStyles.cssText.replace(/\s+/g, ' ')).toContain('@media (prefers-reduced-motion: reduce) { .lc-slider-fill { transition: none; } }');
    expect(sliderStyles.cssText.replace(/\s+/g, ' ')).toContain('.lc-slider-fill.still { transition: none; }');
  });

  it('no transition while dragging, back after the drag', async () => {
    const el = await mount();
    expect(fill(el).classList.contains('still')).toBe(false);
    pointer(el, 'pointerdown', 100);
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(true);
    pointer(el, 'pointerup', 100);
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(false);
  });

  it('no transition while a key is held', async () => {
    const el = await mount();
    await key(el, 'ArrowUp', false);
    expect(fill(el).classList.contains('still')).toBe(true);
    await key(el, 'x', false);
    pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(false);
  });

  it('look.motion minimal removes the transition', async () => {
    const el = await mount({ motion: 'minimal' });
    expect(fill(el).classList.contains('still')).toBe(true);
    const rich = await mount({ motion: 'rich' });
    expect(fill(rich).classList.contains('still')).toBe(false);
  });

  it('prefers-reduced-motion removes the transition, also when it changes later', async () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    const mq = { matches: true, addEventListener: (_: string, l: typeof listener) => (listener = l), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', (q: string) => (q === '(prefers-reduced-motion: reduce)' ? mq : { matches: false }));
    const el = await mount();
    expect(fill(el).classList.contains('still')).toBe(true);
    listener!({ matches: false });
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(false);
    el.remove();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });
});

describe('no raw style values (uniformity)', () => {
  const sources = import.meta.glob('../src/{slider,focus}.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('slider.ts and focus.ts have no colour or px literal: every value comes from tokens.ts', () => {
    expect(Object.keys(sources)).toHaveLength(2);
    for (const [file, src] of Object.entries(sources)) {
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b\d+(\.\d+)?(px|ms|s)\b/g), file).toBeNull();
    }
  });
});

// ---- liquid-core 0.5.0 (plan 2.1.2): horizontal, max, read-only, ticker, keyStep clamp ----

const W = 200; // the horizontal pill width the tests lay out (happy-dom has no layout)
async function mountH(view: Partial<SliderView> = {}) {
  const el = await mount({ kind: 'position', orientation: 'horizontal', color: '#d8dce4', label: 'Position, Living Room', ...view });
  pill(el).getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: W, bottom: 44, width: W, height: 44, toJSON: () => ({}) }) as DOMRect;
  return el;
}
function pointerX(el: TestSlider, type: string, clientX: number, pointerId = 1) {
  pill(el).dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY: 22, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
}
// happy-dom does not compute `direction` from dir="rtl", so the computed direction is stubbed.
let dir = 'ltr';
const stubDir = (d: string) => {
  dir = d;
  vi.stubGlobal('getComputedStyle', () => ({ direction: dir }));
};
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('horizontal frame (P3-TOK-5, P3-CHO-2 option 1)', () => {
  it('full width, 44 high, radius 22, shared track and edge, no knob, ew-resize, contained', async () => {
    const el = await mountH({ value: 30 });
    const css = flat(sliderStyles.cssText);
    expect(css).toContain('.lc-slider-h { width: 100%; height: 44px; min-height: 0; border-radius: 22px; touch-action: pan-y; cursor: ew-resize; contain: layout paint; }');
    expect(pill(el).className).toBe('lc-slider lc-slider-h');
    expect(pill(el).style.height).toBe('');
    expect(pill(el).children).toHaveLength(1);
    expect(attr(el, 'role')).toBe('slider');
    expect(attr(el, 'tabindex')).toBe('0');
    expect(attr(el, 'aria-orientation')).toBe('horizontal');
  });

  it('fills from the start edge by width in the caller colour', async () => {
    const el = await mountH({ value: 30 });
    expect(fill(el).style.width).toBe('30%');
    expect(fill(el).style.height).toBe('');
    expect(fill(el).style.backgroundColor).toMatch(/#d8dce4|rgb\(216, 220, 228\)/);
    expect(flat(sliderStyles.cssText)).toContain('.lc-slider-h > .lc-slider-fill { top: 0; left: auto; right: auto; inset-inline-start: 0;');
  });

  it('unavailable: aria-disabled at DISABLED_OPACITY, input ignored', async () => {
    const el = await mountH({ available: false });
    expect(attr(el, 'aria-disabled')).toBe('true');
    pointerX(el, 'pointerdown', 50);
    pointerX(el, 'pointermove', 150);
    pointerX(el, 'pointerup', 150);
    await key(el, 'ArrowRight');
    expect(el.calls).toEqual([]);
  });
});

describe('horizontal relative drag (clientX over the width)', () => {
  it('LTR: right increases by the delta over the width; a tap changes nothing', async () => {
    const el = await mountH({ value: 40 });
    pointerX(el, 'pointerdown', 150);
    pointerX(el, 'pointermove', 170); // +20 px of 200 = +10
    await el.updateComplete;
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 50, 'pointer']);
    expect(fill(el).style.width).toBe('50%');
    pointerX(el, 'pointermove', 110); // -40 px from the grab point = -20
    pointerX(el, 'pointerup', 110);
    expect(of(el, 'end')).toEqual([['end', 20, 'pointer']]);
    const tap = await mountH({ value: 40 });
    pointerX(tap, 'pointerdown', 10);
    pointerX(tap, 'pointerup', 10);
    expect(of(tap, 'preview')).toEqual([]);
    expect(of(tap, 'end')).toEqual([['end', null, 'pointer']]);
  });

  it('a vertical pointer movement does not move a horizontal slider', async () => {
    const el = await mountH({ value: 40 });
    pill(el).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 0, button: 0, pointerType: 'touch', bubbles: true }));
    pill(el).dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 80, button: 0, pointerType: 'touch', bubbles: true }));
    expect(of(el, 'preview')).toEqual([]);
  });

  it('RTL: the delta flips (left increases), read once at gesture start', async () => {
    stubDir('rtl');
    const el = await mountH({ value: 40 });
    pointerX(el, 'pointerdown', 100);
    pointerX(el, 'pointermove', 80); // 20 px left = +10 in RTL
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 50, 'pointer']);
    dir = 'ltr'; // a direction change mid-gesture is not read again
    pointerX(el, 'pointermove', 140); // 40 px right of the grab point = -20 in RTL
    pointerX(el, 'pointerup', 140);
    expect(of(el, 'end')).toEqual([['end', 20, 'pointer']]);
  });

  for (const end of ['pointercancel', 'lostpointercapture']) {
    it(`${end} ends the gesture with the last value (as the prototype)`, async () => {
      const el = await mountH({ value: 40 });
      pointerX(el, 'pointerdown', 100);
      pointerX(el, 'pointermove', 120);
      pointerX(el, end, 120);
      await el.updateComplete;
      expect(of(el, 'end')).toEqual([['end', 50, 'pointer']]);
      expect(fill(el).classList.contains('still')).toBe(false);
      pointerX(el, 'pointermove', 180); // no gesture any more
      expect(of(el, 'preview')).toHaveLength(1);
    });
  }

  it('clamps at 0 and max', async () => {
    const el = await mountH({ value: 40 });
    pointerX(el, 'pointerdown', 100);
    pointerX(el, 'pointermove', 1000);
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 100, 'pointer']);
    pointerX(el, 'pointermove', -1000);
    pointerX(el, 'pointerup', -1000);
    expect(of(el, 'end')).toEqual([['end', 0, 'pointer']]);
  });
});

describe('keys per orientation and direction (WAI-ARIA slider)', () => {
  const cases: [string, 'vertical' | 'horizontal', string, string, number][] = [
    ['LTR', 'horizontal', 'ltr', 'ArrowRight', 51],
    ['LTR', 'horizontal', 'ltr', 'ArrowUp', 51],
    ['LTR', 'horizontal', 'ltr', 'ArrowLeft', 49],
    ['LTR', 'horizontal', 'ltr', 'ArrowDown', 49],
    ['RTL', 'horizontal', 'rtl', 'ArrowRight', 49],
    ['RTL', 'horizontal', 'rtl', 'ArrowLeft', 51],
    ['RTL', 'horizontal', 'rtl', 'ArrowUp', 51], // Up and Down never swap
    ['RTL', 'horizontal', 'rtl', 'ArrowDown', 49],
    ['RTL', 'vertical', 'rtl', 'ArrowRight', 51], // vertical never swaps
    ['RTL', 'vertical', 'rtl', 'ArrowLeft', 49],
  ];
  for (const [name, orientation, d, k, expected] of cases) {
    it(`${orientation} ${name} ${k} from 50 => ${expected}`, async () => {
      stubDir(d);
      const el = await mountH({ value: 50, orientation });
      await key(el, k);
      expect(of(el, 'preview')).toEqual([['preview', expected, 'key']]);
    });
  }

  it('RTL is read once per key gesture: a change mid-gesture is ignored, a new gesture reads it again', async () => {
    stubDir('rtl');
    const el = await mountH({ value: 50 });
    await key(el, 'ArrowLeft', false); // RTL: +1
    dir = 'ltr';
    await key(el, 'ArrowLeft', false); // same gesture: still RTL, +1
    pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    expect(of(el, 'end')).toEqual([['end', 52, 'key']]);
    await key(el, 'ArrowLeft'); // a new gesture reads LTR: -1 from the view (the test host has no echo: 50)
    expect(of(el, 'preview').map((c) => c[1])).toEqual([51, 52, 49]);
  });

  it('Page, Home and End follow the kind; keyStep gets the logical key in RTL', async () => {
    stubDir('ltr');
    for (const [k, expected] of [
      ['PageUp', 60],
      ['PageDown', 40],
      ['Home', 0],
      ['End', 100],
    ] as const) {
      const el = await mountH({ value: 50 });
      await key(el, k);
      expect(of(el, 'preview')).toEqual([['preview', expected, 'key']]);
    }
    stubDir('rtl');
    const keyStep = vi.fn((cur: number, k: string) => (k === 'ArrowRight' ? cur + 5 : k === 'ArrowLeft' ? cur - 5 : undefined));
    const el = await mountH({ value: 50, keyStep });
    await key(el, 'ArrowLeft');
    expect(keyStep).toHaveBeenCalledWith(50, 'ArrowRight');
    expect(of(el, 'preview')).toEqual([['preview', 55, 'key']]);
  });
});

describe('max (the media seek bar: duration in seconds)', () => {
  const mmss = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const seek = { max: 10800, value: 3600, keyStep: (cur: number, k: string) => ({ ArrowRight: cur + 5, ArrowUp: cur + 5, ArrowLeft: cur - 5, ArrowDown: cur - 5, PageUp: cur + 1080, PageDown: cur - 1080 })[k], valueText: (v: number) => `${mmss(v)} of 3:00:00` };

  it('aria-valuemax is max, aria-valuenow the rounded value, the fill scales to max', async () => {
    const el = await mountH({ ...seek, value: 2700.4 });
    expect([attr(el, 'aria-valuemin'), attr(el, 'aria-valuemax'), attr(el, 'aria-valuenow')]).toEqual(['0', '10800', '2700']);
    expect(attr(el, 'aria-valuetext')).toBe('0:45:00 of 3:00:00');
    expect(parseFloat(fill(el).style.width)).toBeCloseTo((2700.4 / 10800) * 100, 9);
  });

  it('a 5 s keyStep works on a 3 h track; Home 0, End max', async () => {
    const el = await mountH(seek);
    await key(el, 'ArrowRight', false);
    await key(el, 'ArrowRight', false);
    expect(attr(el, 'aria-valuenow')).toBe('3610');
    pill(el).dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    expect(of(el, 'end')).toEqual([['end', 3610, 'key']]);
    const home = await mountH({ ...seek, keyStep: undefined });
    await key(home, 'Home');
    await key(home, 'End');
    expect(of(home, 'preview').map((c) => c[1])).toEqual([0, 10800]);
  });

  it('drag scales to max: 20 px of 200 is a tenth of the range', async () => {
    const el = await mountH(seek);
    pointerX(el, 'pointerdown', 100);
    pointerX(el, 'pointermove', 120);
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 4680, 'pointer']);
  });

  it('a value above max draws full; without valueText the default reads the percent of max', async () => {
    const el = await mountH({ max: 200, value: 250 });
    expect(fill(el).style.width).toBe('100%');
    expect(attr(el, 'aria-valuenow')).toBe('200');
    const half = await mountH({ max: 200, value: 100 });
    expect(attr(half, 'aria-valuetext')).toBe('50%');
  });

  it('max 0 (duration unknown) renders an empty fill and no NaN', async () => {
    const el = await mountH({ max: 0, value: 10 });
    expect(fill(el).style.width).toBe('0%');
    expect([attr(el, 'aria-valuemax'), attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', '0', '0%']);
    expect(pill(el).outerHTML).not.toMatch(/NaN|Infinity/);
    await key(el, 'End');
    expect(of(el, 'preview')).toEqual([]);
  });

  it('works vertically too', async () => {
    const el = await mount({ kind: 'position', max: 50, value: 25 });
    expect(attr(el, 'aria-valuemax')).toBe('50');
    expect(fill(el).style.height).toBe('50%');
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 100 - 28); // 28 px of 280 = a tenth of 50
    expect(of(el, 'preview').at(-1)).toEqual(['preview', 30, 'pointer']);
    expect(SliderController.step('position', 'End', 10, 50)).toBe(50);
    expect(SliderController.step('level', 'End', 10, 50)).toBe(50);
    expect(SliderController.step('position', 'ArrowUp', 50, 50)).toBe(50);
  });
});

describe('keyStep clamp (V9 follow-up 3)', () => {
  for (const [name, view] of [
    ['vertical, max 100', {}],
    ['horizontal, max 10800', { orientation: 'horizontal', max: 10800 }],
  ] as const) {
    it(`${name}: -5 previews 0 and max + 5 previews max`, async () => {
      const max = 'max' in view ? view.max : 100;
      const low = await mountH({ value: 3, orientation: 'vertical', ...view, keyStep: () => -5 });
      await key(low, 'ArrowDown');
      expect(of(low, 'preview')).toEqual([['preview', 0, 'key']]);
      expect(of(low, 'end')).toEqual([['end', 0, 'key']]);
      const high = await mountH({ value: max - 3, orientation: 'vertical', ...view, keyStep: () => max + 5 });
      await key(high, 'ArrowUp');
      expect(of(high, 'preview')).toEqual([['preview', max, 'key']]);
      expect(of(high, 'end')).toEqual([['end', max, 'key']]);
    });
  }
});

describe('read-only (P3-CHO-3)', () => {
  it('role progressbar with value attributes, no tabindex, no orientation, the same drawing', async () => {
    const el = await mountH({ readOnly: true, max: 300, value: 45, valueText: (v) => `0:${v} of 5:00` });
    expect(attr(el, 'role')).toBe('progressbar');
    expect([attr(el, 'aria-valuemin'), attr(el, 'aria-valuemax'), attr(el, 'aria-valuenow'), attr(el, 'aria-valuetext')]).toEqual(['0', '300', '45', '0:45 of 5:00']);
    expect(attr(el, 'tabindex')).toBeNull();
    expect(attr(el, 'aria-orientation')).toBeNull();
    expect(pill(el).className).toBe('lc-slider lc-slider-h');
    expect(fill(el).style.width).toBe('15%');
    expect(flat(sliderStyles.cssText)).toContain(".lc-slider[role='progressbar'] { touch-action: auto; cursor: default; }");
  });

  it('no pointer or key input, so no focus ring is ever shown', async () => {
    const el = await mountH({ readOnly: true });
    const down = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    pill(el).dispatchEvent(down);
    pointerX(el, 'pointerdown', 50);
    pointerX(el, 'pointermove', 150);
    pointerX(el, 'pointerup', 150);
    pill(el).click();
    expect(down.defaultPrevented).toBe(false);
    expect(el.calls).toEqual([]);
    expect(el.shadowRoot!.activeElement).toBeNull();
  });

  it('no aria-disabled on the progressbar; unavailable still draws at TOK-9 opacity and reads Unavailable', async () => {
    const ok = await mountH({ readOnly: true });
    expect(attr(ok, 'aria-disabled')).toBeNull();
    expect(pill(ok).className).toBe('lc-slider lc-slider-h');
    const na = await mountH({ readOnly: true, available: false });
    expect(attr(na, 'aria-disabled')).toBeNull();
    expect(pill(na).className).toBe('lc-slider lc-slider-h lc-slider-na');
    expect(attr(na, 'aria-valuetext')).toBe('Unavailable');
    expect(flat(sliderStyles.cssText)).toContain('.lc-slider-na { opacity: 0.3; }');
  });

  it('the toggle kind ignores readOnly: it stays a switch and still toggles', async () => {
    const el = await mount({ kind: 'toggle', readOnly: true, label: 'Entrance' });
    expect([attr(el, 'role'), attr(el, 'tabindex'), attr(el, 'aria-checked'), attr(el, 'aria-disabled')]).toEqual(['switch', '0', 'true', 'false']);
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointerup', 100);
    await key(el, ' ');
    expect(el.calls).toEqual([
      ['toggle', false],
      ['toggle', false],
    ]);
  });

  it('works vertically', async () => {
    const el = await mount({ kind: 'position', readOnly: true, value: 30 });
    expect([attr(el, 'role'), attr(el, 'tabindex'), attr(el, 'aria-orientation'), attr(el, 'aria-valuenow')]).toEqual(['progressbar', null, null, '30']);
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 50);
    expect(el.calls).toEqual([]);
  });

  it('a drag cut off by a switch to read-only still ends, so the queue is released', async () => {
    const el = await mountH({ value: 40 });
    pointerX(el, 'pointerdown', 100);
    pointerX(el, 'pointermove', 120);
    el.view = { ...el.view, readOnly: true };
    el.requestUpdate();
    await el.updateComplete;
    pointerX(el, 'pointerup', 120);
    expect(of(el, 'end')).toEqual([['end', 50, 'pointer']]);
  });
});

describe('horizontal motion: TOK-10 on width, ticker (GD3)', () => {
  it('non-drag changes ease width over TOK-10; the ticker moves it 1 s linear instead', async () => {
    const css = flat(sliderStyles.cssText);
    expect(css).toContain('transition: width 800ms ease, background-color 800ms ease;');
    expect(css).toContain('.lc-slider-fill.tick { transition: width 1000ms linear; }');
    // Cascade order: still (drag, minimal, reduced) wins over tick, and reduced motion wins over both in CSS.
    expect(css.indexOf('.lc-slider-fill.tick')).toBeLessThan(css.indexOf('.lc-slider-fill.still'));
    expect(css.lastIndexOf('.lc-slider-h > .lc-slider-fill { transition: none; }')).toBeGreaterThan(css.indexOf('.lc-slider-fill.tick'));
    const plain = await mountH();
    expect([...fill(plain).classList]).toEqual(['lc-slider-fill']);
    const tick = await mountH({ ticker: true });
    expect([...fill(tick).classList]).toEqual(['lc-slider-fill', 'tick']);
    const vertical = await mount({ ticker: true });
    expect(fill(vertical).classList.contains('tick')).toBe(false);
  });

  it('none while dragging, under look.motion minimal and under reduced motion', async () => {
    const el = await mountH({ ticker: true });
    pointerX(el, 'pointerdown', 100);
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(true);
    pointerX(el, 'pointerup', 100);
    await el.updateComplete;
    expect(fill(el).classList.contains('still')).toBe(false);
    const minimal = await mountH({ ticker: true, motion: 'minimal' });
    expect(fill(minimal).classList.contains('still')).toBe(true);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} }));
    const reduced = await mountH({ ticker: true });
    expect(fill(reduced).classList.contains('still')).toBe(true);
    const tok10 = await mountH();
    expect(fill(tok10).classList.contains('still')).toBe(true);
  });
});

describe('unset fields keep the vertical slider exactly', () => {
  it('explicit defaults render the same markup as no new fields', async () => {
    for (const v of [{}, { kind: 'position' as const, value: 33.3 }, { kind: 'toggle' as const }, { on: false }, { available: false }]) {
      const plain = pill(await mount(v)).outerHTML;
      const explicit = pill(await mount({ ...v, orientation: 'vertical', max: 100, readOnly: false, ticker: false })).outerHTML;
      expect(explicit).toBe(plain);
    }
  });

  it('a vertical gesture never reads the computed direction', async () => {
    const spy = vi.fn(() => ({ direction: 'rtl' }));
    vi.stubGlobal('getComputedStyle', spy);
    const el = await mount({ value: 40 });
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointermove', 72);
    pointer(el, 'pointerup', 72);
    await key(el, 'ArrowLeft');
    expect(spy).not.toHaveBeenCalled();
    expect(of(el, 'end')).toEqual([
      ['end', 50, 'pointer'],
      ['end', 39, 'key'], // the test host has no HA echo: the view is still 40
    ]);
  });
});

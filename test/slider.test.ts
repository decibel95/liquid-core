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

// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { LitElement, html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICONS } from '../src/icons';
import { LiquidSheetBase, type SheetConfig } from '../src/sheet';
import type { HomeAssistant } from '../src/types';

// The test defines its own tag: core never does.
class TestContent extends LitElement {
  hass?: HomeAssistant;
  configured?: SheetConfig;
  protected override render() {
    return html`<slot name="header-action"></slot>`;
  }
}
customElements.define('test-sheet-content', TestContent);

class TestSheet extends LiquidSheetBase {
  protected createContent(): HTMLElement {
    return document.createElement('test-sheet-content');
  }
  protected override applyConfig(content: HTMLElement, config: SheetConfig): void {
    (content as TestContent).configured = config;
  }
}
customElements.define('test-sheet', TestSheet);

const hass = { language: 'nl', states: { 'light.a': { entity_id: 'light.a', state: 'on', attributes: { friendly_name: 'Lamp' } } }, themes: { darkMode: true } } as unknown as HomeAssistant;
const config = (motion?: 'rich' | 'minimal'): SheetConfig => ({ entity: 'light.a', look: { glass: 'theme', motion } });

async function mount() {
  const el = document.createElement('test-sheet') as TestSheet;
  el.hass = hass;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('LiquidSheetBase', () => {
  afterEach(() => {
    for (const el of document.querySelectorAll<TestSheet>('test-sheet')) {
      el.close();
      el.remove();
    }
  });

  it('is abstract and registers nothing itself', () => {
    expect(customElements.get('liquid-sheet')).toBeUndefined();
    expect(LiquidSheetBase.name).toBe('LiquidSheetBase');
  });

  it('opens the created content with a translated close button, and closes it', async () => {
    const el = await mount();
    expect(el.isOpen).toBe(false);
    await el.open(config());
    await el.updateComplete;
    expect(el.isOpen).toBe(true);
    const content = el.shadowRoot!.querySelector('test-sheet-content') as TestContent;
    expect(content.configured).toEqual(config());
    expect(content.hass).toBe(hass);
    const close = content.querySelector('button.close')!;
    expect(close.getAttribute('slot')).toBe('header-action');
    expect(close.getAttribute('aria-label')).toBe('Sluiten');
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-label')).toBe('Lamp');
    expect(dialog.className).toContain('g-dark');
    el.close();
    await el.updateComplete;
    expect(el.isOpen).toBe(false);
    expect(el.shadowRoot!.querySelector('test-sheet-content')).toBeNull();
  });

  describe('history button', () => {
    it('renders only when historyEntityId is set, before Close, with the translated label', async () => {
      const el = await mount();
      await el.open(config());
      expect(el.shadowRoot!.querySelector('button.history')).toBeNull();
      el.close();
      await el.open({ ...config(), historyEntityId: 'light.a' });
      const btns = [...el.shadowRoot!.querySelectorAll('test-sheet-content > button')];
      expect(btns.map((b) => b.className)).toEqual(['history', 'close']);
      expect(btns[0].getAttribute('slot')).toBe('header-action');
      expect(btns[0].getAttribute('aria-label')).toBe('Geschiedenis');
      expect(btns[0].querySelector('path')!.getAttribute('d')).toBe(ICONS.history);
    });

    it('follows reconfigure', async () => {
      const el = await mount();
      await el.open(config());
      el.reconfigure({ ...config(), historyEntityId: 'light.a' });
      expect(el.shadowRoot!.querySelector('button.history')).not.toBeNull();
      el.reconfigure(config());
      expect(el.shadowRoot!.querySelector('button.history')).toBeNull();
    });

    it('closes the sheet, then navigates to the entity history on window', async () => {
      const el = await mount();
      await el.open({ ...config(), historyEntityId: 'climate.living room' });
      const dlg = el.shadowRoot!.querySelector('dialog')!;
      const log: string[] = [];
      const state = () => `open=${el.isOpen}:dialog=${dlg.open}`;
      const push = vi.spyOn(window.history, 'pushState').mockImplementation((_d, _t, u) => void log.push(`push ${u}:${state()}`));
      const on = () => log.push(`event:${state()}`);
      window.addEventListener('location-changed', on);
      el.shadowRoot!.querySelector<HTMLButtonElement>('button.history')!.click();
      window.removeEventListener('location-changed', on);
      push.mockRestore();
      expect(el.isOpen).toBe(false);
      expect(log).toEqual([
        'push /history?entity_id=climate.living%20room:open=false:dialog=false',
        'event:open=false:dialog=false',
      ]);
    });

    it('pushes the HA state shape { from: location.pathname }', async () => {
      const el = await mount();
      await el.open({ ...config(), historyEntityId: 'light.a' });
      const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
      el.shadowRoot!.querySelector<HTMLButtonElement>('button.history')!.click();
      const [state] = push.mock.calls[0];
      push.mockRestore();
      expect(state).toEqual({ from: window.location.pathname });
    });

    it('keeps initial focus on Close', async () => {
      const el = await mount();
      await el.open({ ...config(), historyEntityId: 'light.a' });
      expect((el.shadowRoot!.activeElement as HTMLElement | null)?.className).toBe('close');
      expect(el.shadowRoot!.activeElement).toBe(el.shadowRoot!.querySelector('button.close'));
    });

    it('renders no button for an empty historyEntityId', async () => {
      const el = await mount();
      await el.open({ ...config(), historyEntityId: '' });
      expect(el.shadowRoot!.querySelector('button.history')).toBeNull();
    });

    it('navigates to the new id after reconfigure', async () => {
      const el = await mount();
      await el.open({ ...config(), historyEntityId: 'light.a' });
      el.reconfigure({ ...config(), historyEntityId: 'light.b' });
      const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
      el.shadowRoot!.querySelector<HTMLButtonElement>('button.history')!.click();
      const url = push.mock.calls[0][2];
      push.mockRestore();
      expect(url).toBe('/history?entity_id=light.b');
    });
  });

  it('reconfigure hands the new config to the open content', async () => {
    const el = await mount();
    await el.open(config());
    el.reconfigure(config('minimal'));
    await el.updateComplete;
    const content = el.shadowRoot!.querySelector('test-sheet-content') as TestContent;
    expect(content.configured?.look?.motion).toBe('minimal');
  });

  it('look.motion minimal sets the class that removes the open animation', async () => {
    const el = await mount();
    await el.open(config('minimal'));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dialog')!.classList.contains('m-minimal')).toBe(true);
  });

  it('the styles remove the open animation for minimal motion and for prefers-reduced-motion', () => {
    const css = (LiquidSheetBase.styles as { cssText: string }[]).map((s) => s.cssText).join('\n');
    expect(css).toMatch(/dialog\.m-minimal\[open\]\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*dialog\[open\]\s*\{\s*animation:\s*none/);
  });

  it('the dialog sets the Liquid font stack itself', () => {
    const css = (LiquidSheetBase.styles as { cssText: string }[]).map((s) => s.cssText).join('\n');
    expect(css).toMatch(/dialog\s*\{[^}]*font-family:\s*'Liquid Inter'/);
  });

  it('a second open while open does nothing', async () => {
    const el = await mount();
    await el.open(config());
    const first = el.shadowRoot!.querySelector('test-sheet-content');
    await el.open(config());
    expect(el.shadowRoot!.querySelector('test-sheet-content')).toBe(first);
  });
});

// The card that opens the sheet (openFor): a Lit element, as the products' cards are.
class TestOwner extends LitElement {
  static override properties = { hass: { attribute: false } };
  hass?: HomeAssistant;
  protected override render() {
    return html`<button>open</button>`;
  }
}
customElements.define('test-sheet-owner', TestOwner);
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

describe('LiquidSheetBase.openFor (owner follow)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function rig() {
    const owner = document.createElement('test-sheet-owner') as TestOwner;
    owner.hass = hass;
    owner.style.setProperty('--lc-radius', '12px');
    document.body.append(owner);
    const el = document.createElement('test-sheet') as TestSheet; // no hass of its own: it takes the owner's
    document.body.append(el);
    await el.updateComplete;
    await el.openFor(owner, config());
    await el.updateComplete;
    const content = () => el.shadowRoot!.querySelector('test-sheet-content') as TestContent | null;
    return { owner, el, content };
  }

  it('opens with the owner hass and follows it while open', async () => {
    const { owner, el, content } = await rig();
    expect(el.isOpen).toBe(true);
    expect(content()!.hass).toBe(hass);
    const next = { ...hass, states: { ...hass.states } } as HomeAssistant;
    owner.hass = next;
    await frame();
    await frame();
    await el.updateComplete;
    expect(el.hass).toBe(next);
    expect(content()!.hass).toBe(next);
  });

  it('stays open when the owner is moved synchronously (HA relayout), and keeps following', async () => {
    const { owner, el, content } = await rig();
    const column = document.createElement('div');
    document.body.append(column);
    column.append(owner); // a disconnect and a connect in one step
    await Promise.resolve();
    await frame();
    expect(el.isOpen).toBe(true);
    const next = { ...hass } as HomeAssistant;
    owner.hass = next;
    await frame();
    await frame();
    await el.updateComplete;
    expect(content()!.hass).toBe(next);
  });

  it('a non-Lit owner: removal closes on the next frame, a move does not', async () => {
    const owner = Object.assign(document.createElement('div'), { hass }) as HTMLElement & { hass?: HomeAssistant };
    document.body.append(owner);
    const el = document.createElement('test-sheet') as TestSheet;
    document.body.append(el);
    await el.openFor(owner, config());
    document.body.append(document.createElement('section'));
    document.body.lastElementChild!.append(owner);
    await frame();
    await frame();
    expect(el.isOpen).toBe(true);
    owner.remove();
    await frame();
    await frame();
    expect(el.isOpen).toBe(false);
  });

  it('restores an inline theme variable the sheet host had, and leaves variables it did not set', async () => {
    const owner = document.createElement('test-sheet-owner') as TestOwner;
    owner.hass = hass;
    owner.style.setProperty('--lc-radius', '12px');
    document.body.append(owner);
    const el = document.createElement('test-sheet') as TestSheet;
    el.style.setProperty('--lc-radius', '30px');
    document.body.append(el);
    await el.openFor(owner, config());
    expect(el.style.getPropertyValue('--lc-radius')).toBe('12px');
    el.style.setProperty('--lc-blur', '5px'); // set by someone else while open
    el.close();
    expect(el.style.getPropertyValue('--lc-radius')).toBe('30px');
    expect(el.style.getPropertyValue('--lc-blur')).toBe('5px');
  });

  it('openFor attaches a follower only to the content it opened (race with close and another open)', async () => {
    const owner = document.createElement('test-sheet-owner') as TestOwner;
    owner.hass = hass;
    owner.style.setProperty('--lc-radius', '12px');
    document.body.append(owner);
    const el = document.createElement('test-sheet') as TestSheet;
    document.body.append(el);
    const first = el.openFor(owner, config());
    await el.updateComplete; // the content is on the page; openFor still awaits it
    el.close();
    const second = el.open(config()); // another path opens new content, without an owner
    await Promise.all([first, second]);
    expect(el.isOpen).toBe(true);
    expect(el.style.getPropertyValue('--lc-radius')).toBe('');
    owner.remove();
    await Promise.resolve();
    expect(el.isOpen).toBe(true); // nobody follows that owner
  });

  it('a second openFor while open does nothing', async () => {
    const { el } = await rig();
    const other = document.createElement('test-sheet-owner') as TestOwner;
    other.hass = hass;
    document.body.append(other);
    await el.openFor(other, config());
    other.remove();
    await Promise.resolve();
    expect(el.isOpen).toBe(true);
    expect(el.style.getPropertyValue('--lc-radius')).toBe('12px');
  });

  it('pushHass hands a new hass on at once', async () => {
    const { el, content } = await rig();
    const next = { ...hass } as HomeAssistant;
    el.pushHass(next);
    await el.updateComplete;
    expect(content()!.hass).toBe(next);
  });

  it('closes when the owner is removed (after a microtask), and stops following', async () => {
    const { owner, el } = await rig();
    owner.remove();
    expect(el.isOpen).toBe(true); // decided after the current step: it may be a move
    await Promise.resolve();
    expect(el.isOpen).toBe(false);
    const later = { ...hass } as HomeAssistant;
    owner.hass = later;
    await frame();
    await frame();
    expect(el.hass).not.toBe(later);
  });

  it('takes the owner theme variables (D-3) while open and clears them on close', async () => {
    const { el } = await rig();
    expect(el.style.getPropertyValue('--lc-radius')).toBe('12px');
    expect(el.style.getPropertyValue('--lc-blur')).toBe('');
    el.close();
    expect(el.style.getPropertyValue('--lc-radius')).toBe('');
  });

  it('a config without look opens on theme glass with rich motion', async () => {
    const owner = document.createElement('test-sheet-owner') as TestOwner;
    owner.hass = hass;
    document.body.append(owner);
    const el = document.createElement('test-sheet') as TestSheet;
    document.body.append(el);
    await el.openFor(owner, { entity: 'light.a' });
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.className).toContain('g-dark'); // theme glass: hass.themes.darkMode is true
    expect(dialog.className).toContain('m-rich');
  });

  it('open() without an owner keeps the Liquid Climate behaviour: no follow', async () => {
    const owner = document.createElement('test-sheet-owner') as TestOwner;
    owner.hass = hass;
    document.body.append(owner);
    const el = await mount();
    await el.open(config());
    owner.hass = { ...hass } as HomeAssistant;
    await frame();
    expect(el.hass).toBe(hass);
    owner.remove();
    expect(el.isOpen).toBe(true);
  });
});

describe('sheet source', () => {
  const files = import.meta.glob('../src/{sheet,editor,i18n}.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('reads the three files', () => {
    expect(Object.keys(files).length).toBe(3);
  });
  for (const [file, src] of Object.entries(files)) {
    it(`${file} has no tag, no define and no liquid-climate string`, () => {
      expect(src).not.toMatch(/liquid-climate/i);
      expect(src).not.toMatch(/customElements\.(define|get)|@customElement/);
    });
  }
});

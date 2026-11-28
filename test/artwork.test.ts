// @vitest-environment happy-dom
import { LitElement, html } from 'lit';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArtworkController, artworkStyles, renderArtwork } from '../src/artwork';
import type { SliderMotion } from '../src/slider';
import { ART } from '../src/tokens';

// A fake Image: every decode() waits until the test settles it, so decode-first and the cap can be observed.
type Pending = { src: string; resolve: () => void; reject: (e?: unknown) => void };
const made: Pending[] = [];
class FakeImage {
  decoding = '';
  src = '';
  decode(): Promise<void> {
    return new Promise<void>((resolve, reject) => made.push({ src: this.src, resolve, reject }));
  }
}
const decodeOf = (src: string) => made.filter((m) => m.src === src);

// A fake IntersectionObserver: the shared one is created once for the module, the test drives its entries.
let observer: { cb: IntersectionObserverCallback; targets: Set<Element> } | undefined;
let observers = 0;
class FakeIO {
  targets = new Set<Element>();
  constructor(readonly cb: IntersectionObserverCallback) {
    observers++;
    observer = this;
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {}
}
const intersect = (el: Element, on = true) =>
  observer!.cb([{ target: el, isIntersecting: on } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver);

beforeAll(() => {
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('IntersectionObserver', FakeIO);
});

// The test defines its own tag: core never does.
class TestArt extends LitElement {
  static override styles = [artworkStyles];
  art = new ArtworkController(this);
  motion: SliderMotion | undefined = 'rich';
  glass = 'dark';
  renders = 0;
  protected override render() {
    this.renders++;
    return html`<div class="g-${this.glass}"><div class="card">${renderArtwork(this.art, { motion: this.motion })}</div></div>`;
  }
}
customElements.define('test-art', TestArt);

let n = 0;
const uniq = () => `https://img.test/cover-${++n}.png`;
const hosts: TestArt[] = [];
async function mount(props: Partial<TestArt> = {}): Promise<TestArt> {
  const el = Object.assign(document.createElement('test-art') as TestArt, props);
  document.body.append(el);
  hosts.push(el);
  await el.updateComplete;
  return el;
}
// Microtasks and Lit updates settle (decode callbacks, the reflow step and its follow-up render).
async function settle(el: TestArt) {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await el.updateComplete;
  }
}
const imgs = (el: TestArt) => [...el.shadowRoot!.querySelectorAll('.art img')] as HTMLImageElement[];
const layerEl = (el: TestArt) => el.shadowRoot!.querySelector('.art');

async function shown(el: TestArt, url: string) {
  el.art.set(url);
  intersect(el);
  decodeOf(url).at(-1)!.resolve();
  await settle(el);
}

afterEach(() => {
  vi.useRealTimers();
  hosts.splice(0).forEach((h) => h.remove());
});

describe('artwork-backdrop: loading', () => {
  it('starts no load while the host is off screen, and loads once it intersects', async () => {
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    expect(decodeOf(url)).toHaveLength(0);
    intersect(el, false);
    expect(decodeOf(url)).toHaveLength(0);
    expect(el.art.layer).toBe('none');
    intersect(el);
    expect(decodeOf(url)).toHaveLength(1);
    expect(el.art.layer).toBe('loading');
    intersect(el);
    expect(decodeOf(url)).toHaveLength(1);
    expect(observers).toBe(1);
  });

  it('inserts an img only after decode, never before', async () => {
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    intersect(el);
    await settle(el);
    expect(el.art.layer).toBe('loading');
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(layerEl(el)).toBeNull();
    decodeOf(url)[0].resolve();
    await settle(el);
    expect(el.art.layer).toBe('shown');
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([url]);
    expect(layerEl(el)!.getAttribute('aria-hidden')).toBe('true');
    expect(layerEl(el)!.classList.contains('on')).toBe(true);
  });

  it('keeps the old image while the new one loads', async () => {
    const el = await mount();
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    el.art.set(b);
    await settle(el);
    expect(el.art.layer).toBe('loading');
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([a]);
  });

  it('drops to plain glass when no decode lands within the 3 s cap', async () => {
    vi.useFakeTimers();
    const el = await mount({ motion: 'minimal' });
    const url = uniq();
    el.art.set(url);
    intersect(el);
    vi.advanceTimersByTime(ART.decodeCap - 1);
    await settle(el);
    expect(el.art.layer).toBe('loading');
    vi.advanceTimersByTime(1);
    await settle(el);
    expect(el.art.layer).toBe('none');
    expect(imgs(el)).toHaveLength(0);
    // A decode that lands after the cap changes nothing.
    decodeOf(url)[0].resolve();
    await settle(el);
    expect(el.art.layer).toBe('none');
    expect(imgs(el)).toHaveLength(0);
  });

  it('drops to plain glass on a decode error, also from a shown cover', async () => {
    vi.useFakeTimers();
    const el = await mount({ motion: 'minimal' });
    const a = uniq();
    const bad = uniq();
    await shown(el, a);
    el.art.set(bad);
    decodeOf(bad)[0].reject(new Error('404'));
    await settle(el);
    expect(el.art.layer).toBe('none');
    expect(layerEl(el)!.classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    expect(imgs(el)).toHaveLength(0);
    expect(layerEl(el)).toBeNull();
  });

  it('drops to plain glass for an empty string or undefined, fading the layer out', async () => {
    vi.useFakeTimers();
    const el = await mount();
    await shown(el, uniq());
    el.art.set('');
    await settle(el);
    expect(el.art.layer).toBe('none');
    expect(layerEl(el)!.classList.contains('on')).toBe(false);
    expect(imgs(el)).toHaveLength(1);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    expect(layerEl(el)).toBeNull();
    el.art.set(undefined);
    expect(el.art.layer).toBe('none');
    expect(decodeOf('')).toHaveLength(0);
  });

  it('does not retry a failed URL until the URL changes or the host reconnects', async () => {
    const el = await mount();
    const bad = uniq();
    const other = uniq();
    el.art.set(bad);
    intersect(el);
    decodeOf(bad)[0].reject(new Error('403'));
    await settle(el);
    el.art.set(bad);
    intersect(el, false);
    intersect(el);
    await settle(el);
    expect(decodeOf(bad)).toHaveLength(1);
    // The URL changes and comes back: one retry.
    el.art.set(other);
    el.art.set(bad);
    expect(decodeOf(bad)).toHaveLength(2);
    decodeOf(bad)[1].reject(new Error('403'));
    await settle(el);
    expect(decodeOf(bad)).toHaveLength(2);
    // The host reconnects: one retry once it is on screen again.
    el.remove();
    document.body.append(el);
    expect(decodeOf(bad)).toHaveLength(2);
    intersect(el);
    expect(decodeOf(bad)).toHaveLength(3);
  });
});

describe('artwork-backdrop: crossfade and motion', () => {
  it('draws two images during the crossfade and one after ART.fade, the new one on top', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    expect(imgs(el)).toHaveLength(1);
    el.art.set(b);
    decodeOf(b)[0].resolve();
    await settle(el);
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([a, b]);
    expect(imgs(el)[1].classList.contains('on')).toBe(true);
    const newImg = imgs(el)[1];
    vi.advanceTimersByTime(ART.fade - 1);
    await settle(el);
    expect(imgs(el)).toHaveLength(2);
    vi.advanceTimersByTime(1);
    await settle(el);
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([b]);
    // The same element stays: removing the old one does not re-create (and re-fade) the new one.
    expect(imgs(el)[0]).toBe(newImg);
    expect(layerEl(el)!.classList.contains('still')).toBe(false);
  });

  it('fades a new layer in from opacity 0 (inserted off, turned on after the reflow)', async () => {
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    intersect(el);
    decodeOf(url)[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    await el.updateComplete;
    expect(layerEl(el)!.classList.contains('on')).toBe(false);
    await settle(el);
    expect(layerEl(el)!.classList.contains('on')).toBe(true);
  });

  it('swaps without a transition under look.motion minimal (.still), one img after the fade timer', async () => {
    vi.useFakeTimers();
    const el = await mount({ motion: 'minimal' });
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    expect(layerEl(el)!.classList.contains('still')).toBe(true);
    el.art.set(b);
    decodeOf(b)[0].resolve();
    await settle(el);
    expect(layerEl(el)!.classList.contains('still')).toBe(true);
    expect(imgs(el).at(-1)!.classList.contains('on')).toBe(true);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([b]);
  });

  it('relies on CSS for prefers-reduced-motion: no .still, one img after the fade timer', async () => {
    vi.useFakeTimers();
    const el = await mount({ motion: 'rich' });
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    expect(layerEl(el)!.classList.contains('still')).toBe(false);
    el.art.set(b);
    decodeOf(b)[0].resolve();
    await settle(el);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([b]);
    expect(artworkStyles.cssText.replace(/\s+/g, ' ')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.art, \.art img \{ transition: none; \} \}/);
  });

  it('turns transitions off for .still and under prefers-reduced-motion in the styles', () => {
    const text = artworkStyles.cssText.replace(/\s+/g, ' ');
    expect(text).toContain(`transition: opacity ${ART.fade}ms ease`);
    expect(text).toMatch(/\.art\.still, \.art\.still img \{ transition: none; \}/);
    expect(text).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.art, \.art img \{ transition: none; \} \}/);
  });
});

describe('artwork-backdrop: styles', () => {
  const rules = () =>
    [...artworkStyles.cssText.replace(/\s+/g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

  it('draws the scrim on light glass only', () => {
    const scrim = rules().filter((r) => r.body.includes(ART.scrimLight));
    expect(scrim).toHaveLength(1);
    expect(scrim[0].sel).toBe('.g-light .art::after');
    expect(artworkStyles.cssText).not.toMatch(/g-dark/);
  });

  it('uses the core tokens and filter only, never a second backdrop-filter', () => {
    const text = artworkStyles.cssText;
    expect(text).toContain(`transform: scale(${ART.scale})`);
    expect(text).toContain(`filter: blur(${ART.blur}px)`);
    expect(text).toContain('object-fit: cover');
    expect(text).toContain('background: var(--lc-bg)');
    expect(text).not.toContain('backdrop-filter');
    expect(rules().find((r) => r.sel === ':has(> .art)')!.body).toContain('isolation: isolate');
    const art = rules().find((r) => r.sel === '.art')!.body;
    expect(art).toMatch(/position: absolute; inset: 0; z-index: -1; border-radius: inherit; overflow: hidden;/);
  });

  it('marks the scrim on a light host in the DOM order image, scrim, fill', async () => {
    const el = await mount({ glass: 'light', motion: 'minimal' });
    await shown(el, uniq());
    expect(el.shadowRoot!.querySelector('.g-light .art img')).not.toBeNull();
    const z = (sel: string) => Number(/z-index: (-?\d+)/.exec(rules().find((r) => r.sel === sel)!.body)?.[1]);
    expect(z('.g-light .art::after')).toBe(1);
    expect(z('.art::before, .g-light .art::after')).toBe(2);
  });
});

describe('artwork-backdrop: lifecycle and updates', () => {
  it('ignores a decode that lands after disconnect: no render, no img', async () => {
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    intersect(el);
    await settle(el);
    el.remove();
    const renders = el.renders;
    decodeOf(url)[0].resolve();
    await settle(el);
    expect(el.renders).toBe(renders);
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(el.art.layer).toBe('none');
  });

  it('cancels every timer on disconnect mid-fade and settles at the end state', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    el.art.set(b);
    decodeOf(b)[0].resolve();
    await settle(el);
    expect(imgs(el)).toHaveLength(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    el.remove();
    expect(vi.getTimerCount()).toBe(0);
    expect(el.art.layer).toBe('shown');
    // Reconnecting draws the settled state: the new cover alone, no new decode.
    document.body.append(el);
    await settle(el);
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([b]);
    expect(decodeOf(b)).toHaveLength(1);
  });

  it('cancels the post-reflow step when disconnected right after a decode', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const a = uniq();
    el.art.set(a);
    intersect(el);
    decodeOf(a)[0].resolve();
    // Wait until show() has inserted the image and awaits the host update, then disconnect.
    const pics = () => (el.art as unknown as { pics: unknown[] }).pics.length;
    for (let i = 0; i < 20 && !pics(); i++) await Promise.resolve();
    expect(pics()).toBe(1);
    el.remove();
    await settle(el);
    expect(vi.getTimerCount()).toBe(0);
    // Settled at the end state: the decoded cover shown, nothing left to animate.
    expect(el.art.layer).toBe('shown');
    expect(imgs(el)).toHaveLength(1);
  });

  it('reconnecting with the shown URL does not re-render or re-create the img', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const url = uniq();
    await shown(el, url);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    const img = imgs(el)[0];
    const renders = el.renders;
    el.remove();
    document.body.append(el);
    intersect(el);
    await settle(el);
    expect(el.renders).toBe(renders);
    expect(imgs(el)[0]).toBe(img);
    expect(el.art.layer).toBe('shown');
  });

  it('starts nothing while detached: set() loads no URL and arms no timer until reconnect', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    vi.advanceTimersByTime(ART.fade);
    await settle(el);
    el.remove();
    const renders = el.renders;
    el.art.set(b);
    intersect(el);
    await settle(el);
    expect(decodeOf(b)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(el.renders).toBe(renders);
    // A cached URL does not show while detached either; empty drops at once without a timer.
    const c = uniq();
    const other = await mount();
    await shown(other, c);
    vi.advanceTimersByTime(ART.fade);
    await settle(other);
    el.art.set(c);
    await settle(el);
    expect(el.art.layer).toBe('shown');
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([a]);
    expect(vi.getTimerCount()).toBe(0);
    expect(el.renders).toBe(renders);
    el.art.set('');
    await settle(el);
    expect(vi.getTimerCount()).toBe(0);
    el.art.set(b);
    document.body.append(el);
    intersect(el);
    await settle(el);
    expect(decodeOf(b)).toHaveLength(1);
  });

  it('keeps the old cover when disconnected while a new one loads', async () => {
    const el = await mount();
    const a = uniq();
    const b = uniq();
    await shown(el, a);
    el.art.set(b);
    expect(el.art.layer).toBe('loading');
    el.remove();
    expect(el.art.layer).toBe('shown');
    document.body.append(el);
    await settle(el);
    expect(el.art.layer).toBe('shown');
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([a]);
  });

  it('set() clears the pending URL: A, B, A decodes A again and shows it', async () => {
    const el = await mount();
    const a = uniq();
    const b = uniq();
    el.art.set(a);
    intersect(el);
    intersect(el, false);
    // B is set off screen, so it never becomes the pending URL; A must not stay marked pending.
    el.art.set(b);
    el.art.set(a);
    intersect(el);
    expect(el.art.layer).toBe('loading');
    // The first decode of A is shared (cache): the stale subscription is dropped, the new one shows.
    expect(decodeOf(a)).toHaveLength(1);
    decodeOf(a)[0].resolve();
    await settle(el);
    expect(el.art.layer).toBe('shown');
    expect(imgs(el).map((i) => i.getAttribute('src'))).toEqual([a]);
  });

  it('keeps reporting loading while a decode for the current URL runs off screen', async () => {
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    intersect(el);
    intersect(el, false);
    expect(el.art.layer).toBe('loading');
    decodeOf(url)[0].resolve();
    await settle(el);
    expect(el.art.layer).toBe('shown');
  });

  it('never shows a stale decode after the URL changed', async () => {
    const el = await mount();
    const a = uniq();
    const b = uniq();
    el.art.set(a);
    intersect(el);
    intersect(el, false);
    el.art.set(b);
    expect(el.art.layer).toBe('none');
    decodeOf(a)[0].resolve();
    await settle(el);
    expect(imgs(el)).toHaveLength(0);
    expect(el.art.layer).toBe('none');
  });

  it('does not re-render on viewport crossings', async () => {
    const el = await mount();
    await shown(el, uniq());
    await settle(el);
    const renders = el.renders;
    intersect(el, false);
    intersect(el);
    intersect(el, false);
    await settle(el);
    expect(el.renders).toBe(renders);
  });

  it('shows a URL at once next time when its decode landed after the cap; the capped controller stays plain', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const url = uniq();
    el.art.set(url);
    intersect(el);
    vi.advanceTimersByTime(ART.decodeCap);
    await settle(el);
    expect(el.art.layer).toBe('none');
    decodeOf(url)[0].resolve();
    await settle(el);
    intersect(el);
    await settle(el);
    expect(el.art.layer).toBe('none');
    const other = await mount();
    other.art.set(url);
    await settle(other);
    expect(other.art.layer).toBe('shown');
    expect(decodeOf(url)).toHaveLength(1);
  });
});

describe('artwork-backdrop: decode cache', () => {
  it('decodes a URL once across controllers (card, tile, sheet)', async () => {
    const card = await mount();
    const tile = await mount();
    const url = uniq();
    card.art.set(url);
    intersect(card);
    tile.art.set(url);
    intersect(tile);
    expect(decodeOf(url)).toHaveLength(1);
    decodeOf(url)[0].resolve();
    await settle(card);
    await settle(tile);
    expect(imgs(card)).toHaveLength(1);
    expect(imgs(tile)).toHaveLength(1);
    // An already decoded URL shows at once, also off screen, without a new decode.
    const sheet = await mount();
    sheet.art.set(url);
    await settle(sheet);
    expect(sheet.art.layer).toBe('shown');
    expect(imgs(sheet)).toHaveLength(1);
    expect(decodeOf(url)).toHaveLength(1);
  });

  it('holds at most 16 URLs, evicting in insertion order', async () => {
    const el = await mount({ motion: 'minimal' });
    const urls = Array.from({ length: 17 }, uniq);
    for (const u of urls) await shown(el, u);
    const probe = await mount({ motion: 'minimal' });
    intersect(probe);
    // urls[1..16] are cached: no new decode.
    for (const u of urls.slice(1).reverse()) {
      probe.art.set(u);
      expect(decodeOf(u)).toHaveLength(1);
    }
    // urls[0] was evicted when urls[16] entered.
    probe.art.set(urls[0]);
    expect(decodeOf(urls[0])).toHaveLength(2);
  });

  it('removes failures from the cache so another controller can try again', async () => {
    const a = await mount();
    const b = await mount();
    const url = uniq();
    a.art.set(url);
    intersect(a);
    decodeOf(url)[0].reject(new Error('404'));
    await settle(a);
    b.art.set(url);
    intersect(b);
    expect(decodeOf(url)).toHaveLength(2);
  });
});

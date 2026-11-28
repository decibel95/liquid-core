import { css, html, nothing, unsafeCSS, type ReactiveController, type ReactiveControllerHost, type ReactiveElement, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { SliderMotion } from './slider';
import { ART } from './tokens';

/** The artwork layer state: no art, a URL decoding (the old image stays), or a decoded image drawn. */
export type ArtworkLayer = 'none' | 'loading' | 'shown';

type Pic = { id: number; url: string; on: boolean };
type Decode = { p: Promise<void>; ok?: boolean };

/** Decodes kept per document, as HA's own image cache (16). Insertion order eviction. */
const CACHE = 16;
const cache = new Map<string, Decode>();
const hosts = new WeakMap<Element, ArtworkController>();
let io: IntersectionObserver | undefined;
let seq = 0;

const put = (url: string, d: Decode): void => {
  if (!cache.has(url) && cache.size >= CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(url, d);
};

/** One capped decode per URL: `new Image()`, then `decode()`, rejected after ART.decodeCap. Failures leave the cache. */
function decode(url: string): Decode {
  const hit = cache.get(url);
  if (hit) return hit;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  const d: Decode = {
    p: new Promise<void>((res, rej) => {
      const t = setTimeout(rej, ART.decodeCap);
      img.decode().then(
        () => {
          clearTimeout(t);
          // A decode that lands after the cap is cached as done, so the next attempt shows at once.
          if (cache.get(url) !== d) put(url, { p: Promise.resolve(), ok: true });
          d.ok = true;
          res();
        },
        (e) => {
          clearTimeout(t);
          rej(e);
        },
      );
    }),
  };
  d.p.catch(() => cache.get(url) === d && cache.delete(url));
  put(url, d);
  return d;
}

/**
 * Loads one cover URL for the artwork backdrop (P3-TOK-1 to 4, GD5). One controller per host element and one
 * renderArtwork per render root: create it in the constructor, call `set()` from willUpdate with the URL the product
 * resolved, render with renderArtwork().
 * - Loads only while the host intersects the viewport (one shared IntersectionObserver); an already decoded URL shows
 *   at once. A new URL is decoded before its `img` enters the DOM; the old image stays meanwhile.
 * - No decode within ART.decodeCap, a decode error or an empty URL drops to plain glass. A failed URL is not retried
 *   until it changes or the host reconnects (D-21).
 * - Crossfade ART.fade; instant (CSS) under prefers-reduced-motion and look.motion minimal.
 * - Disconnecting cancels every pending step and settles at the end state without an update; while detached nothing
 *   loads and no timer runs.
 */
export class ArtworkController implements ReactiveController {
  layer: ArtworkLayer = 'none';
  /** The URL last given to `set()`. */
  url: string | undefined;

  private pics: Pic[] = [];
  private on = false;
  private visible = false;
  private failed = false;
  private pending: string | undefined;
  private stale = false;
  private connected = false;
  private tok = 0;
  private gen = 0;
  private t: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  hostConnected(): void {
    this.connected = true;
    this.failed = false;
    this.visible = true;
    const el = this.host;
    if (typeof IntersectionObserver === 'function' && el instanceof Element) {
      this.visible = false;
      hosts.set(el, this);
      io ??= new IntersectionObserver(
        (es) => {
          for (const e of es) hosts.get(e.target)?.seen(e.isIntersecting);
        },
        { threshold: 0 },
      );
      io.observe(el);
    }
    if (this.stale) this.host.requestUpdate();
    this.stale = false;
    this.load();
  }

  hostDisconnected(): void {
    const el = this.host;
    if (io && el instanceof Element) {
      io.unobserve(el);
      hosts.delete(el);
    }
    this.connected = this.visible = false;
    this.pending = undefined;
    this.tok++;
    this.settle();
  }

  /** The cover URL, or `undefined` / `''` for no art. The same URL again does nothing. */
  set(url: string | undefined): void {
    if (url === this.url) return;
    this.url = url;
    this.failed = false;
    this.pending = undefined;
    this.tok++;
    if (url) this.load();
    else this.drop();
  }

  /** The layer template; use renderArtwork(). */
  template(motion: SliderMotion | undefined): TemplateResult | typeof nothing {
    if (!this.pics.length) return nothing;
    return html`<div class="art${this.on ? ' on' : ''}${motion === 'minimal' ? ' still' : ''}" aria-hidden="true">
      ${repeat(
        this.pics,
        (p) => p.id,
        (p) => html`<img class=${p.on ? 'on' : ''} src=${p.url} alt="" />`,
      )}
    </div>`;
  }

  /** Cancels timers and pending steps and keeps the end state: the top image if the layer shows or loads over it. */
  private settle(): void {
    clearTimeout(this.t);
    this.gen++;
    const top = this.pics[this.pics.length - 1];
    const keep = !!top && (this.layer === 'shown' || (this.on && this.layer === 'loading'));
    this.stale ||= this.pics.length !== +keep || this.on !== keep || (keep && !top.on);
    if (top) top.on = true;
    this.pics = keep ? [top] : [];
    this.on = keep;
    this.layer = keep ? 'shown' : 'none';
  }

  private seen(visible: boolean): void {
    this.visible = visible;
    this.load();
  }

  private state(layer: ArtworkLayer): void {
    if (this.layer === layer) return;
    this.layer = layer;
    this.host.requestUpdate();
  }

  private load(): void {
    const url = this.url;
    if (!url || !this.connected || this.failed || url === this.pending) return;
    if (this.on && this.pics[this.pics.length - 1].url === url) return this.state('shown');
    const ok = cache.get(url)?.ok;
    if (!this.visible && !ok) return this.state(this.on ? 'shown' : 'none');
    const tok = ++this.tok;
    this.pending = url;
    if (!ok) this.state('loading');
    decode(url).p.then(
      () => {
        if (tok !== this.tok) return;
        this.pending = undefined;
        void this.show(url);
      },
      () => {
        if (tok !== this.tok) return;
        this.pending = undefined;
        this.failed = true;
        this.drop();
      },
    );
  }

  /** Adds the decoded image on top: a new layer fades in, an existing one (also one fading out) crossfades. */
  private async show(url: string): Promise<void> {
    clearTimeout(this.t);
    const g = ++this.gen;
    const fresh = !this.pics.length;
    const pic: Pic = { id: ++seq, url, on: fresh };
    this.pics = [...this.pics, pic];
    this.layer = 'shown';
    if (!fresh) this.on = true;
    this.host.requestUpdate();
    await this.host.updateComplete;
    if (g !== this.gen) return;
    // Commit opacity 0 of the inserted layer or image (style flush only), so turning it on transitions.
    const el = (this.host as unknown as ReactiveElement).renderRoot?.querySelector('.art');
    if (el) void getComputedStyle((fresh ? el : el.lastElementChild) ?? el).opacity;
    this.on = pic.on = true;
    this.host.requestUpdate();
    this.t = setTimeout(() => this.end(), ART.fade);
  }

  private drop(): void {
    if (!this.pics.length) return this.state('none');
    this.on = false;
    this.layer = 'none';
    // Detached (set() during a disconnected update): settle at once, no timer.
    if (!this.connected) return this.settle();
    clearTimeout(this.t);
    this.gen++;
    this.host.requestUpdate();
    this.t = setTimeout(() => this.end(), ART.fade);
  }

  /**
   * After a fade: only the top image stays, or none after a fade out. No generation check needed: every show() and
   * drop() clears the previous timer first and show() arms its own only while still current, so one timer is armed.
   */
  private end(): void {
    const n = this.on ? 1 : 0;
    if (this.pics.length === n) return;
    this.pics = this.pics.slice(this.pics.length - n);
    this.host.requestUpdate();
  }
}

/**
 * The art layer: `<div class="art" aria-hidden="true">` with one `img` at rest and two during a crossfade, or `nothing`
 * without art. Render it as the first child of the card's glass surface. `motion` is the card's look.motion; it only
 * sets the class at render time (`minimal` makes changes instant, as prefers-reduced-motion does through CSS).
 */
export const renderArtwork = (ctrl: ArtworkController, opts: { motion: SliderMotion | undefined }): TemplateResult | typeof nothing =>
  ctrl.template(opts.motion);

const FADE = unsafeCSS(`opacity ${ART.fade}ms ease`);

/**
 * Styles for the art layer, added next to the host's glass styles. The element the layer is rendered into (the
 * glass surface) must generate a box (not `display: contents`) and be positioned; the rule `:has(> .art)` isolates it, so the layer at z-index -1 stays above
 * the host's own fill and below its content and `.rim::before`. Inside the layer: the image (cover, ART.scale,
 * ART.blur), on light glass ART.scrimLight, then the glass fill `--lc-bg`, so all fade together and the raw cover
 * never flashes. Where the blurred image edges are translucent the host fill and the layer fill both show (by design).
 * `filter` only: the host keeps the card's single backdrop-filter.
 */
export const artworkStyles = css`
  :has(> .art) {
    isolation: isolate;
  }
  .art {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    transition: ${FADE};
  }
  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scale(${ART.scale});
    filter: blur(${ART.blur}px);
    opacity: 0;
    transition: ${FADE};
  }
  .art.on,
  .art img.on {
    opacity: 1;
  }
  .art::before,
  .g-light .art::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    background: var(--lc-bg);
  }
  .g-light .art::after {
    z-index: 1;
    background: ${unsafeCSS(ART.scrimLight)};
  }
  .art.still,
  .art.still img {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .art,
    .art img {
      transition: none;
    }
  }
`;

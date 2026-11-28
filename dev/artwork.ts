// Dev harness for the artwork backdrop: the core card (.lc, dialChrome) and tile (.tile, tileChrome) glass with the
// art layer, on dark and light glass. Harness only: core itself never defines a tag (the dev tags below are not part of
// the package, dev/ is not in "files"). Covers are the six synthetic ones from the gate 2 prototype, no real artwork.
import { LitElement, css, html, svg, type PropertyDeclarations } from 'lit';
import {
  ArtworkController,
  ICONS,
  LIQUID_FONT_STACK,
  artworkStyles,
  dialChrome,
  ensureLiquidFont,
  glassTokens,
  renderArtwork,
  tileChrome,
  type SliderMotion,
} from '../src/index';

ensureLiquidFont(new URL('../fonts/liquid-inter.woff2', import.meta.url).href);
document.body.style.fontFamily = LIQUID_FONT_STACK;

// Slow URL (harness only): a decode for a URL with `slow=` waits 4 s, past the 3 s cap, so the cap is visible.
const NativeImage = window.Image;
class SlowImage extends NativeImage {
  override decode(): Promise<void> {
    if (!this.src.includes('slow=')) return super.decode();
    return new Promise<void>((r) => setTimeout(r, 4000)).then(() => super.decode());
  }
}
window.Image = SlowImage as typeof Image;

const NAMES = ['dark', 'light', 'saturated', 'busy', '43', 'wide'] as const;
const COVER = (n: string) => new URL(`./covers/cover-${n}.png`, import.meta.url).href;
const BROKEN = 'data:image/png;base64,AAAA';
const SLOW = `${COVER('busy')}?slow=1`;

const icon = (d: string) => html`<svg class="i" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">${svg`<path d=${d} />`}</svg>`;

abstract class DevArt extends LitElement {
  static override properties: PropertyDeclarations = {
    url: {},
    glass: {},
    motion: {},
    name: {},
    sub: {},
  };
  url: string | undefined;
  glass: 'dark' | 'light' = 'dark';
  motion: SliderMotion = 'rich';
  name = 'Kitchen';
  sub = 'Playing, Technohead';
  art = new ArtworkController(this);

  protected override willUpdate(): void {
    this.art.set(this.url);
  }

  protected override updated(): void {
    this.dataset.layer = this.art.layer;
    this.dispatchEvent(new CustomEvent('layer', { detail: this.art.layer }));
  }

  /** Elements in the shadow tree whose computed backdrop-filter is not none (the card's single glass surface). */
  backdropCount(): number {
    return [...this.shadowRoot!.querySelectorAll('*')].filter((e) => {
      const s = getComputedStyle(e);
      const v = s.backdropFilter || (s as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter;
      return !!v && v !== 'none';
    }).length;
  }
}

class CoreDevArtCard extends DevArt {
  static override styles = [
    glassTokens,
    dialChrome,
    artworkStyles,
    css`
      .lc { width: 320px; }
      .np { display: flex; flex-direction: column; gap: 4px; }
      .t { font-size: 17px; font-weight: 600; }
      .a { font-size: 13px; color: var(--lc-fg2); }
      .x { font-size: 12px; color: var(--lc-fg3); }
    `,
  ];
  protected override render() {
    return html`<div class="g-${this.glass}">
      <article class="lc rim" style="--_blur: 30px">
        ${renderArtwork(this.art, { motion: this.motion })}
        <header>
          <span class="titles"><h2>${this.name}</h2><span class="sub">${this.sub}</span></span>
          <span class="actions"><button class="power press" type="button" aria-label="Power">${icon(ICONS.power)}</button></span>
        </header>
        <div class="np">
          <span class="t">I Wanna Be A Hippy</span><span class="a">Technohead</span><span class="x">Bounzz, layer ${this.art.layer}</span>
        </div>
      </article>
    </div>`;
  }
}
customElements.define('core-dev-art-card', CoreDevArtCard);

class CoreDevArtTile extends DevArt {
  static override styles = [glassTokens, tileChrome, artworkStyles, css`.tile { width: 320px; }`];
  protected override render() {
    return html`<div class="g-${this.glass}">
      <div class="tile rim" style="--_blur: 30px">
        ${renderArtwork(this.art, { motion: this.motion })}
        <button class="power press" type="button" aria-label="Play">${icon(ICONS.power)}</button>
        <span class="body"><span class="name">${this.name}</span><span class="sub">${this.sub}</span></span>
      </div>
    </div>`;
  }
}
customElements.define('core-dev-art-tile', CoreDevArtTile);

type Props = Partial<Pick<DevArt, 'url' | 'glass' | 'motion' | 'name' | 'sub' | 'id'>>;
const card = (p: Props) => Object.assign(document.createElement('core-dev-art-card') as CoreDevArtCard, p);
const tile = (p: Props) => Object.assign(document.createElement('core-dev-art-tile') as CoreDevArtTile, p);
const row = (id: string) => document.querySelector(`#${id} .row`)!;

for (const glass of ['dark', 'light'] as const) {
  row(`covers-${glass}`).append(...NAMES.map((n) => card({ url: COVER(n), glass, name: `cover-${n}`, id: `c-${glass}-${n}` })));
  row(`tiles-${glass}`).append(tile({ url: COVER('dark'), glass, name: 'cover-dark' }), tile({ url: COVER('light'), glass, name: 'cover-light' }));
  row(`states-${glass}`).append(
    card({ url: undefined, glass, name: 'No URL', sub: 'Fallback: plain glass', id: `none-${glass}` }),
    card({ url: BROKEN, glass, name: 'Broken URL', sub: 'Undecodable: plain glass', id: `broken-${glass}` }),
    card({ url: SLOW, glass, name: 'Slow URL', sub: 'No decode in 3 s: plain glass', id: `slow-${glass}` }),
  );
}

// Crossfade: one card per glass, cycling through the six covers and no art.
const fades = (['dark', 'light'] as const).map((glass) => card({ url: COVER('dark'), glass, name: 'Crossfade', id: `fade-${glass}` }));
fades.forEach((c) => document.getElementById(`fade-slot-${c.glass}`)!.append(c));
let i = 0;
const step = (url: string | undefined) => fades.forEach((c) => (c.url = url));
document.getElementById('next')!.addEventListener('click', () => step(COVER(NAMES[++i % NAMES.length])));
document.getElementById('clear')!.addEventListener('click', () => step(undefined));
document.getElementById('motion')!.addEventListener('change', (e) => {
  const m = (e.target as HTMLSelectElement).value as SliderMotion;
  fades.forEach((c) => (c.motion = m));
});

// One backdrop-filter per host: measured on the computed styles after the first render.
requestAnimationFrame(() => {
  const all = [...document.querySelectorAll<DevArt>('core-dev-art-card, core-dev-art-tile')];
  const counts = new Set(all.map((h) => h.backdropCount()));
  document.getElementById('bf')!.textContent = `backdrop-filter elements per host: ${[...counts].join(', ')} (${all.length} hosts)`;
});

Object.assign(window, { __art: { COVER, NAMES, BROKEN, SLOW, step } });

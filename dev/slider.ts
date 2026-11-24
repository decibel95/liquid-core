// Dev harness for the slider: renders it the way a card would, so scripts/slider-shots.mjs can put it
// next to the gate 2 prototype. Harness only: core itself never defines a tag (the dev tag below is
// not part of the package, dev/ is not in "files").
import { LitElement, css, html, unsafeCSS, type PropertyDeclarations } from 'lit';
import {
  READOUT,
  SLIDER,
  SPECTRUM,
  SliderController,
  brightnessPercent,
  entityColour,
  LIQUID_FONT_STACK,
  ensureLiquidFont,
  focusRing,
  glassTokens,
  levelPercent,
  renderSlider,
  sliderStyles,
  type SliderKind,
} from '../src/index';

// The local font file, served by the Vite dev server, instead of a Google Fonts request. Body text uses the same stack.
ensureLiquidFont(new URL('../fonts/liquid-inter.woff2', import.meta.url).href);
document.body.style.fontFamily = LIQUID_FONT_STACK;

const params = new URLSearchParams(location.search);
const glass: 'dark' | 'light' = params.get('glass') === 'light' ? 'light' : 'dark';
document.body.classList.add(glass);

// Kitchen Lights in the HA demo (hs 345,75 => rgb 255,64,112), as the prototype's default entity.
const KITCHEN = entityColour([255, 64, 112], glass).hex;
const NEUTRAL = entityColour([255, 255, 255], glass).hex;

class CoreDevSlider extends LitElement {
  static override properties: PropertyDeclarations = {
    kind: {},
    value: { type: Number },
    on: { type: Boolean },
    available: { type: Boolean },
    color: {},
    height: { type: Number },
    card: { type: Boolean },
    stops: { attribute: false },
  };
  kind: SliderKind = 'level';
  value = brightnessPercent(180);
  on = true;
  available = true;
  color = KITCHEN;
  height?: number;
  card = false;
  stops?: readonly string[];
  private preview?: number;
  slider = new SliderController(this, {
    onPreview: (v) => {
      this.preview = v;
      this.requestUpdate();
    },
    // An instant HA echo: the harness has no write queue.
    onEnd: (v) => {
      this.preview = undefined;
      if (v !== null) {
        this.value = v;
        if (this.kind === 'level') this.on = v > 0;
        else this.on = true;
      }
    },
    onToggle: (next) => (this.on = next),
  });

  static override styles = [
    glassTokens,
    focusRing,
    sliderStyles,
    css`
      :host { display: block; }
      /* The prototype's card and body row (canvas values). Harness only. */
      .patch,
      .card {
        position: relative;
        box-sizing: border-box;
        color: var(--lc-fg);
        background: var(--lc-bg);
        -webkit-backdrop-filter: blur(30px) saturate(170%);
        backdrop-filter: blur(30px) saturate(170%);
        border: 1px solid var(--lc-edge);
        box-shadow: inset 0 1px 0 var(--lc-shine), 0 40px 80px -24px rgba(0, 0, 0, 0.45);
        font-family: ${unsafeCSS(LIQUID_FONT_STACK)};
      }
      .patch { display: inline-block; padding: 24px; border-radius: 40px; }
      .card { width: 320px; padding: 22px; border-radius: 40px; }
      .body { container-type: inline-size; width: 100%; }
      .bodyrow { display: flex; align-items: center; justify-content: space-between; gap: ${SLIDER.row.gap}px; height: ${SLIDER.height}px; }
      .ro { display: flex; flex-direction: column; gap: ${SLIDER.row.readoutGap}px; min-width: 0; }
      .ro-v { display: flex; align-items: flex-start; }
      .big { font-size: ${unsafeCSS(READOUT.value.size)}; font-weight: ${READOUT.value.weight}; letter-spacing: ${unsafeCSS(READOUT.value.letterSpacing)}; line-height: 1; }
      .unit { font-size: ${unsafeCSS(READOUT.unit.size)}; font-weight: ${READOUT.unit.weight}; margin-top: 1.5cqw; color: var(--lc-fg2); }
      .sub { font-size: 13px; color: var(--lc-fg2); }
      .slwrap { position: relative; flex: none; margin-right: ${SLIDER.row.pillInset}px; }
      @container (max-width: ${SLIDER.row.narrowMax}px) {
        .slwrap { margin-right: 0; }
      }
    `,
  ];

  private pill() {
    return renderSlider(this.slider, {
      kind: this.kind,
      value: this.preview ?? this.value,
      on: this.preview !== undefined && this.kind === 'level' ? this.preview > 0 : this.on,
      available: this.available,
      color: this.color,
      stops: this.stops,
      height: this.height,
      label: `Kitchen ${this.kind === 'position' ? 'warmth' : 'brightness'}`,
      valueText: this.kind === 'position' ? (v) => `${Math.round(SPECTRUM.kelvinMin + (v / 100) * (SPECTRUM.kelvinMax - SPECTRUM.kelvinMin))} K` : undefined,
    });
  }

  protected override render() {
    if (!this.card) return html`<div class="g-${glass}"><div class="patch rim">${this.pill()}</div></div>`;
    const shown = this.preview ?? this.value;
    const on = this.preview !== undefined ? this.preview > 0 : this.on;
    return html`<div class="g-${glass}">
      <article class="card rim">
        <div class="body">
          <div class="bodyrow">
            <span class="ro"
              ><span class="ro-v"><span class="big">${on ? levelPercent(shown, on) : 'Off'}</span><span class="unit">${on ? '%' : ''}</span></span
              ><span class="sub">Brightness</span></span
            >
            <div class="slwrap">${this.pill()}</div>
          </div>
        </div>
      </article>
    </div>`;
  }
}
customElements.define('core-dev-slider', CoreDevSlider);

const make = (props: Partial<CoreDevSlider>): CoreDevSlider => Object.assign(document.createElement('core-dev-slider') as CoreDevSlider, props);
document.getElementById('bare')!.append(make({ id: 'bare-slider' }));
document.getElementById('narrow')!.append(make({ id: 'narrow-card', card: true }));
document.querySelector('#states .row')!.append(
  make({ on: false }),
  make({ value: brightnessPercent(1) }),
  make({ available: false }),
  make({ kind: 'toggle', color: NEUTRAL }),
  make({ kind: 'toggle', on: false, color: NEUTRAL }),
  make({ kind: 'position', value: 14, color: SPECTRUM.toned[glass].kelvin[1], stops: SPECTRUM.toned[glass].kelvin }),
  make({ height: 120 }),
);

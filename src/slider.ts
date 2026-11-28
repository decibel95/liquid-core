import { css, html, nothing, unsafeCSS, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { coreT, type I18n, type I18nHass } from './i18n';
import { clamp } from './math';
import { SLIDER } from './tokens';

/**
 * The vertical slider (decision 5): the Apple Home pill of the gate 2 approved prototype, V1 fill.
 * One spec for every card (plan section 2.9): 96 x 280 (min 200), radius 26, no knob, the fill grows
 * from the bottom in the colour the caller passes (the entity colour), the empty part is the glass track.
 *
 * Three kinds share the frame:
 * - `level`: brightness in percent, 0 is off. Keys per CHO-8 (arrows 1 %, Page Up/Down 10 %, Home 1 %,
 *   End 100 %, Down from 1 % turns off). aria-valuenow is max(1, round(value)) while on, 0 when off.
 * - `position`: a 0 to 100 position along the pill with no off (White: kelvin position, Colour: hue
 *   position). Arrows 1, Page Up/Down 10, Home 0, End 100. The caller supplies the value text.
 * - `toggle` (TOK-8): on/off-only lights. Full or empty, role switch. A tap, a drag (Q6), Space or Enter toggles.
 *
 * Drag is relative (CHO-8, gate 2): the value moves by the pointer delta from the grab point, so a tap
 * without movement changes nothing. The controller never writes: it reports gestures through callbacks so
 * the card can preview, and hold() and release() its write queue around a gesture.
 *
 * Horizontal (P3-TOK-5, the media seek bar) is the same pill laid on its side: full width, `SLIDER.horizontal`
 * height and radius, the fill grows from the start edge (right in RTL), the drag reads clientX (sign flipped in
 * RTL, read once at gesture start), and only Left/Right swap in RTL (WAI-ARIA slider pattern).
 */

export type SliderKind = 'level' | 'position' | 'toggle';
export type SliderSource = 'pointer' | 'key';
export type SliderMotion = 'rich' | 'subtle' | 'minimal';

export interface SliderCallbacks {
  /** A gesture starts: pointer down on the pill, or the first key press. Cards call hold() on their write queue. */
  onStart?(source: SliderSource): void;
  /** Every value change inside a gesture (each pointer move that moves the value, each key step). 0 to `max` (100); for `level` 0 is off. */
  onPreview?(value: number, source: SliderSource): void;
  /** The gesture ends (pointer up or cancel, key up, blur). `value` is the last previewed value, or null when nothing changed. Cards call release(). */
  onEnd?(value: number | null, source: SliderSource): void;
  /** The `toggle` kind: the next on state after a tap, a drag, Space or Enter. */
  onToggle?(next: boolean): void;
}

/** What the card draws, passed to renderSlider() on every render. */
export interface SliderView {
  kind: SliderKind;
  /** Fill position 0 to `max` (default 100). `level`: brightness percent (unrounded is fine). Ignored by `toggle`. */
  value: number;
  /** Whether the entity is on. Off draws an empty pill. */
  on: boolean;
  /** False draws the pill at TOK-9 opacity and ignores input. Default true. */
  available?: boolean;
  /** Fill colour: the entity colour (entityColour().hex) or the neutral. */
  color: string;
  /** Optional toned spectrum stops (TOK-21), bottom to top, drawn inside the fill and anchored to the whole pill. Vertical only. */
  stops?: readonly string[];
  /** aria-label, from the caller: entity name plus mode ("Kitchen brightness"). */
  label: string;
  /** aria-valuetext for a value while on. Required in spirit for `position` (kelvin, colour position); `level` defaults to the core percent text. */
  valueText?: (value: number) => string;
  /** The next value for a handled key from `cur`; undefined falls back to SliderController.step(). Ignored by `toggle`. */
  keyStep?: (cur: number, key: string) => number | undefined;
  /**
   * Maps the value read out by aria-valuenow and aria-valuetext (the fill still follows the finger). Runs before
   * `valueText`. On `level` a snapped 0 reads as off. Unset: the value as is.
   */
  snap?: (value: number) => number;
  /** Pill height in px, default TOK-2 280, never below 200. Vertical only (horizontal is `SLIDER.horizontal.height`). */
  height?: number;
  /**
   * Default `vertical`. `horizontal` is full width of its container at `SLIDER.horizontal` height, fills from the
   * start edge (right in RTL), has no knob, and reads clientX (P3-TOK-5, P3-CHO-2 option 1).
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Top of the value range, default 100. Drives aria-valuemax, drag scaling and Home/End (the media seek bar passes the
   * duration in seconds). Meant for `position`: the `level` rules (under half a percent is off, 1 % minimum) work in
   * value units, so they are percent only at the default 100.
   */
  max?: number;
  /**
   * P3-CHO-3: the same drawing as `role="progressbar"` with no focus, tabindex, pointer or key handling, and no
   * aria-disabled (unavailable still draws at TOK-9 opacity). Ignored by `toggle`, which stays a switch.
   */
  readOnly?: boolean;
  /** GD3, horizontal: non-drag value changes move the fill with `SLIDER.ticker` (1 s linear) instead of TOK-10; none under reduced or minimal motion. */
  ticker?: boolean;
  /** The card's look.motion. `minimal` removes the fill transition, as reduced motion does. */
  motion?: SliderMotion;
  /** For localized value text. */
  hass?: I18nHass;
  /** The product's i18n, so product overrides of `core.*` strings apply. Default: core strings only. */
  i18n?: Pick<I18n, 't'>;
}

/** p0: the grab coordinate; size: the pill length in px; sign: -1 flips the delta (vertical, and horizontal RTL). */
type Drag = { id: number; p0: number; start: number; size: number; sign: number; last: number; moved: boolean };

/** The level a percentage shows as, per CHO-8: never 0 while on. */
export const levelPercent = (value: number, on: boolean): number => (on ? Math.max(1, Math.round(value)) : 0);

/** Brightness 0 to 255 as an unrounded percent, the fill position of the `level` kind. */
export const brightnessPercent = (brightness: number | null | undefined): number => clamp(((brightness ?? 0) / 255) * 100, 0, 100);

/** CSS gradient for toned spectrum stops, bottom to top, evenly spaced (the prototype's grad()). */
export function spectrumGradient(stops: readonly string[]): string {
  const n = stops.length - 1;
  return `linear-gradient(to top, ${stops.map((s, i) => `${s} ${n > 0 ? ((i * 100) / n).toFixed(1) : 0}%`).join(', ')})`;
}

const KEYS_LEVEL = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End'];
const REDUCED = '(prefers-reduced-motion: reduce)';
const rtl = (el: Element): boolean => getComputedStyle(el).direction === 'rtl';
const maxOf = (v: SliderView): number => v.max ?? 100;

/**
 * Pointer, keyboard and motion state of one slider. Create it in the card's constructor
 * (`slider = new SliderController(this, { onPreview, onStart, onEnd, onToggle })`) and render it with
 * renderSlider(this.slider, view). It requests a host update when its gesture state changes.
 */
export class SliderController implements ReactiveController {
  /** True while a pointer or key gesture runs: the fill follows without a transition. */
  dragging = false;
  /** True when the OS asks for reduced motion. */
  reducedMotion = false;
  /** The value previewed inside the running gesture, drawn instead of view.value until the gesture ends. */
  preview: number | undefined;
  /** The last view renderSlider() drew; input is read against it. */
  view: SliderView | undefined;

  private drag: Drag | undefined;
  private key: { start: number; last: number; moved: boolean; rtl: boolean } | undefined;
  private tap: number | undefined;
  private tapAt = -Infinity;
  private mq: MediaQueryList | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    public callbacks: SliderCallbacks = {},
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.mq = typeof matchMedia === 'function' ? matchMedia(REDUCED) : undefined;
    this.reducedMotion = !!this.mq?.matches;
    this.mq?.addEventListener?.('change', this.onMotion);
  }

  hostDisconnected(): void {
    this.mq?.removeEventListener?.('change', this.onMotion);
    this.mq = undefined;
    // A gesture cut off by removal still ends, so a held write queue is released.
    this.endPointer();
    this.endKey();
  }

  /** The drawn state: the preview inside a gesture, otherwise the view. */
  shown(view: SliderView = this.view as SliderView): { value: number; on: boolean } {
    if (this.preview === undefined) return { value: view.on ? clamp(view.value, 0, maxOf(view)) : 0, on: view.on };
    return { value: this.preview, on: view.kind === 'level' ? this.preview > 0 : true };
  }

  /** Whether the fill moves without a transition now (TOK-10). */
  still(view: SliderView | undefined = this.view): boolean {
    return this.dragging || this.reducedMotion || view?.motion === 'minimal';
  }

  private onMotion = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
    this.host.requestUpdate();
  };

  private usable(): SliderView | undefined {
    const v = this.view;
    return v && v.available !== false && !(v.readOnly && v.kind !== 'toggle') ? v : undefined;
  }

  private setDragging(on: boolean): void {
    if (this.dragging === on) return;
    this.dragging = on;
    this.host.requestUpdate();
  }

  private emit(value: number, source: SliderSource): void {
    this.preview = value;
    this.host.requestUpdate();
    this.callbacks.onPreview?.(value, source);
  }

  // ---- Pointer -------------------------------------------------------------------

  /** @internal Bound to the pill by renderSlider(). */
  onPointerDown = (e: PointerEvent): void => {
    const v = this.usable();
    if (!v || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // A gesture whose pointer up never arrived (no capture, pointer released outside) ends here, so it
    // cannot keep the queue held. The new gesture is relative, so restarting it never jumps.
    this.endPointer();
    const el = e.currentTarget as HTMLElement;
    e.preventDefault();
    el.focus?.({ preventScroll: true });
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is a nicety: without it moves outside the pill end at the pill edge.
    }
    if (v.kind === 'toggle') {
      this.tap = e.pointerId;
      return;
    }
    this.endKey();
    const start = this.shown(v).value;
    const box = el.getBoundingClientRect?.();
    this.drag =
      v.orientation === 'horizontal'
        ? { id: e.pointerId, p0: e.clientX, start, size: box?.width || 1, sign: rtl(el) ? -1 : 1, last: start, moved: false }
        : { id: e.pointerId, p0: e.clientY, start, size: box?.height || Math.max(SLIDER.minHeight, v.height ?? SLIDER.height), sign: -1, last: start, moved: false };
    this.setDragging(true);
    this.callbacks.onStart?.('pointer');
  };

  /** @internal */
  onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    const v = this.view;
    if (!d || !v || e.pointerId !== d.id) return;
    const max = maxOf(v);
    const p = v.orientation === 'horizontal' ? e.clientX : e.clientY;
    const raw = clamp(d.start + ((d.sign * (p - d.p0)) / d.size) * max, 0, max);
    // As the prototype: under half a percent is off, anything above shows at least 1 %.
    const value = v.kind === 'level' ? (raw < 0.5 ? 0 : Math.max(1, raw)) : raw;
    if (value === d.last) return;
    d.last = value;
    d.moved = true;
    this.emit(value, 'pointer');
  };

  /** @internal Pointer up: ends a drag, or toggles the `toggle` kind (a drag counts as a tap there, Q6). */
  onPointerUp = (e: PointerEvent): void => {
    if (this.tap !== undefined && e.pointerId === this.tap) {
      this.tap = undefined;
      const v = this.usable();
      if (v && e.type === 'pointerup') {
        this.tapAt = Date.now();
        this.callbacks.onToggle?.(!v.on);
      }
      return;
    }
    if (this.drag && e.pointerId === this.drag.id) this.endPointer();
  };

  private endPointer(): void {
    this.tap = undefined;
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    this.preview = undefined;
    this.setDragging(false);
    this.host.requestUpdate();
    this.callbacks.onEnd?.(d.moved ? d.last : null, 'pointer');
  }

  /** @internal Click without a pointer gesture (assistive tech, element.click()) toggles the switch. */
  onClick = (): void => {
    const v = this.usable();
    if (!v || v.kind !== 'toggle') return;
    if (Date.now() - this.tapAt < 600) return; // the click that follows our own pointerup
    this.callbacks.onToggle?.(!v.on);
  };

  // ---- Keyboard (CHO-8) ------------------------------------------------------------

  /** The value a key leads to from `cur`, or undefined for a key the slider does not handle. `max` tops the range (End). */
  static step(kind: Exclude<SliderKind, 'toggle'>, key: string, cur: number, max = 100): number | undefined {
    if (kind === 'level') {
      switch (key) {
        case 'ArrowUp':
        case 'ArrowRight':
          return Math.min(max, cur + 1);
        case 'ArrowDown':
        case 'ArrowLeft':
          return Math.max(0, cur - 1); // from 1 % this is 0: off
        case 'PageUp':
          return Math.min(max, Math.max(1, cur + 10));
        case 'PageDown':
          return cur === 0 ? 0 : Math.max(1, cur - 10);
        case 'Home':
          return 1; // the lowest on level
        case 'End':
          return max;
      }
      return undefined;
    }
    const delta: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    if (key === 'Home') return 0;
    if (key === 'End') return max;
    return key in delta ? clamp(cur + delta[key], 0, max) : undefined;
  }

  /** @internal */
  onKeyDown = (e: KeyboardEvent): void => {
    const v = this.usable();
    if (!v || e.altKey || e.ctrlKey || e.metaKey) return;
    if (v.kind === 'toggle') {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) this.callbacks.onToggle?.(!v.on);
      return;
    }
    if (!KEYS_LEVEL.includes(e.key) || this.drag) return;
    const shown = this.shown(v);
    const cur = v.kind === 'level' ? levelPercent(shown.value, shown.on) : Math.round(shown.value);
    const max = maxOf(v);
    // Horizontal RTL: Left increases, Right decreases; Up and Down never swap. Read once per key gesture.
    const flip = this.key ? this.key.rtl : v.orientation === 'horizontal' && rtl(e.currentTarget as Element);
    const k = flip && e.key === 'ArrowLeft' ? 'ArrowRight' : flip && e.key === 'ArrowRight' ? 'ArrowLeft' : e.key;
    // V9 follow-up 3: a keyStep result outside the range is clamped before it is previewed and written.
    const next = clamp((v.keyStep?.(cur, k) ?? SliderController.step(v.kind, k, cur, max)) as number, 0, max);
    e.preventDefault();
    if (!this.key) {
      this.key = { start: cur, last: cur, moved: false, rtl: flip };
      this.setDragging(true);
      this.callbacks.onStart?.('key');
    }
    if (next === this.key.last) return;
    this.key.last = next;
    this.key.moved = true;
    this.emit(next, 'key');
  };

  /** @internal Key up flushes: the card releases its queue, which sends the final value. */
  onKeyUp = (e: KeyboardEvent): void => {
    if (this.key && KEYS_LEVEL.includes(e.key)) this.endKey();
  };

  /** @internal */
  onBlur = (): void => {
    this.endKey();
  };

  private endKey(): void {
    const k = this.key;
    if (!k) return;
    this.key = undefined;
    this.preview = undefined;
    this.setDragging(false);
    this.host.requestUpdate();
    this.callbacks.onEnd?.(k.moved ? k.last : null, 'key');
  }
}

const EDGE = SLIDER.edge.width;
/** TOK-10 on the fill's size property (height, or width when horizontal), then the colour. */
const motion = (size: string): string =>
  SLIDER.motion.properties.map((p) => `${p === 'height' ? size : p} ${SLIDER.motion.durationMs}ms ${SLIDER.motion.easing}`).join(', ');

/** Styles of renderSlider(). Add them to the card's static styles next to focusRing (focus.ts). */
export const sliderStyles = css`
  .lc-slider {
    position: relative;
    flex: none;
    box-sizing: border-box;
    width: ${SLIDER.width}px;
    height: ${SLIDER.height}px;
    min-height: ${SLIDER.minHeight}px;
    border-radius: ${SLIDER.radius}px;
    background: ${unsafeCSS(SLIDER.track)};
    border: ${EDGE}px solid ${unsafeCSS(SLIDER.edge.color)};
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: ns-resize;
  }
  .lc-slider[role='switch'] {
    cursor: pointer;
  }
  .lc-slider[aria-disabled='true'] {
    opacity: ${SLIDER.unavailableOpacity};
    cursor: default;
  }
  .lc-slider-h {
    width: 100%;
    height: ${SLIDER.horizontal.height}px;
    min-height: 0;
    border-radius: ${SLIDER.horizontal.radius}px;
    touch-action: pan-y;
    cursor: ew-resize;
    contain: layout paint;
  }
  .lc-slider[role='progressbar'] {
    touch-action: auto;
    cursor: default;
  }
  .lc-slider-na {
    opacity: ${SLIDER.unavailableOpacity};
  }
  .lc-slider-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: ${SLIDER.fill.opacity};
    background-position: bottom;
    background-repeat: no-repeat;
    transition: ${unsafeCSS(motion('height'))};
  }
  .lc-slider-h > .lc-slider-fill {
    top: 0;
    left: auto;
    right: auto;
    inset-inline-start: 0;
    transition: ${unsafeCSS(motion('width'))};
  }
  .lc-slider-fill.tick {
    transition: width ${SLIDER.ticker.ms}ms ${unsafeCSS(SLIDER.ticker.easing)};
  }
  .lc-slider-fill.still {
    transition: none;
  }
  @media ${unsafeCSS(REDUCED)} {
    .lc-slider-fill {
      transition: none;
    }
  }
  @media ${unsafeCSS(REDUCED)} {
    .lc-slider-h > .lc-slider-fill {
      transition: none;
    }
  }
`;

/** The pill. Pass the same controller every render; the view is the card's current state. */
export function renderSlider(c: SliderController, view: SliderView): TemplateResult {
  c.view = view;
  const t = view.i18n?.t ?? coreT;
  const available = view.available !== false;
  const { value, on } = c.shown(view);
  const height = Math.max(SLIDER.minHeight, view.height ?? SLIDER.height);
  const toggle = view.kind === 'toggle';
  const h = view.orientation === 'horizontal';
  const ro = !!view.readOnly && !toggle;
  const max = maxOf(view);
  // value / (max / 100) is exact for the default max 100, so unset fields draw today's numbers.
  const fillSize = toggle ? (on ? 100 : 0) : max > 0 ? value / (max / 100) : 0;
  let valueNow: number | undefined;
  let valueText: string | undefined;
  if (!toggle) {
    // snap maps the read-out value only (the fill stays unsnapped); on `level` a snapped 0 is off.
    const sv = view.snap ? view.snap(value) : value;
    const off = !on || (!!view.snap && view.kind === 'level' && sv === 0);
    valueNow = view.kind === 'level' ? levelPercent(sv, !off) : off ? 0 : Math.round(sv);
    valueText = !available
      ? t(view.hass, 'core.unavailable')
      : off
        ? t(view.hass, 'core.off')
        : (view.valueText?.(valueNow) ?? t(view.hass, 'core.percent', { value: max > 0 ? Math.round(valueNow / (max / 100)) : 0 }));
  }
  const fill = h
    ? { width: `${fillSize}%`, 'background-color': view.color }
    : {
        height: `${fillSize}%`,
        'background-color': view.color,
        'background-image': view.stops?.length ? spectrumGradient(view.stops) : 'none',
        'background-size': `100% ${height - 2 * EDGE}px`,
      };
  // Read-only (P3-CHO-3): a progressbar with no tabindex, orientation or start handlers. The end handlers stay,
  // so a gesture cut off by a switch to read-only still ends and releases the card's write queue.
  return html`<div
    class=${`lc-slider${h ? ' lc-slider-h' : ''}${ro && !available ? ' lc-slider-na' : ''}`}
    role=${ro ? 'progressbar' : toggle ? SLIDER.toggle.role : 'slider'}
    tabindex=${ro ? nothing : '0'}
    aria-label=${view.label}
    aria-orientation=${toggle || ro ? nothing : h ? 'horizontal' : 'vertical'}
    aria-valuemin=${toggle ? nothing : 0}
    aria-valuemax=${toggle ? nothing : Math.round(max)}
    aria-valuenow=${valueNow ?? nothing}
    aria-valuetext=${valueText ?? nothing}
    aria-checked=${toggle ? String(on) : nothing}
    aria-disabled=${ro ? nothing : available ? 'false' : 'true'}
    style=${styleMap(h ? {} : { height: `${height}px` })}
    @pointerdown=${ro ? nothing : c.onPointerDown}
    @pointermove=${c.onPointerMove}
    @pointerup=${c.onPointerUp}
    @pointercancel=${c.onPointerUp}
    @lostpointercapture=${c.onPointerUp}
    @click=${ro ? nothing : c.onClick}
    @keydown=${ro ? nothing : c.onKeyDown}
    @keyup=${c.onKeyUp}
    @blur=${c.onBlur}
  >
    <div class=${classMap({ 'lc-slider-fill': true, tick: h && !!view.ticker, still: c.still(view) })} aria-hidden="true" style=${styleMap(fill)}></div>
  </div>`;
}

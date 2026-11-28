/**
 * Named design tokens approved at Liquid Home gate 1. Each value carries its item ID
 * (.omc/plans/liquid-home-gate1-items.md in the Liquid Climate repo). Lengths are px unless the key
 * or the value says otherwise. No new colours: every colour is a glass or palette value, or (SPECTRUM)
 * a pinned entityColour() output that test/colour.test.ts recomputes.
 */
import { MENU_GLASS } from './glass';

/**
 * A control that cannot be used now: a step at its limit, a step or mode button of an unavailable entity (CHO-11).
 * Liquid Climate: tile `.step:disabled` and cluster `.step[aria-disabled='true']` (opacity 0.3).
 */
export const DISABLED_OPACITY = 0.3;

/** The vertical brightness slider (the Apple Home pill). */
export const SLIDER = {
  /** TOK-1. */
  width: 96,
  /** TOK-2: default height and the lowest it may shrink to. */
  height: 280,
  minHeight: 200,
  /** TOK-3: the tile radius, reused. */
  radius: 26,
  /** TOK-4: entity-colour from the bottom at full opacity, no knob; the fill edge shows the level. */
  fill: { opacity: 1, knob: false },
  /**
   * The empty part of the pill and its edge, as the gate 2 approved prototype's `.sl` rule: the glass
   * track colour and the existing 1px button edge. Existing values, named here so slider.ts has no literal.
   */
  track: 'var(--lc-track)',
  edge: { width: 1, color: 'var(--lc-btn-edge)' },
  /** TOK-8: on/off-only lights get the same frame, full or empty, as a switch. */
  toggle: { role: 'switch' },
  /** TOK-9: the existing disabled step value, DISABLED_OPACITY. */
  unavailableOpacity: DISABLED_OPACITY,
  /** P3-TOK-5, P3-CHO-2 option 1: the horizontal slider (media seek and volume), full width of its container. */
  horizontal: { height: 44, radius: 22 },
  /** GD3: a ticking value (media position) moves its fill with this transition instead of the TOK-10 one. */
  ticker: { ms: 1000, easing: 'linear' },
  /**
   * TOK-10: the fill eases in 0.8s (the dial arc's transition) when HA reports a change; no transition
   * while dragging or under reduced motion. Height and colour both move, as the gate 2 approved
   * prototype's `.fill` rule (transition: height .8s, background-color .8s).
   */
  motion: { properties: ['height', 'background-color'], durationMs: 800, easing: 'ease', dragging: 'none', reducedMotion: 'none' },
  /**
   * The light card row that holds the readout and the pill, exactly as the gate 2 approved prototype
   * (lh-proto/index.html in the Liquid Home design archive). The row is as high as the pill.
   */
  row: {
    /** `.bodyrow { gap: 12px }`, lh-proto/index.html:69. */
    gap: 12,
    /** `.ro { gap: 8px }` (value above its label), lh-proto/index.html:70. */
    readoutGap: 8,
    /** `.slwrap { margin-right: 24px }`, lh-proto/index.html:74. */
    pillInset: 24,
    /** `@container (max-width: 353px) { .slwrap { margin-right: 0 } }`, lh-proto/index.html:75. */
    narrowMax: 353,
  },
} as const;

/**
 * Theme variables honoured by every card of both products (plan 4.1, D-3). `--lc-tint` scales Liquid Climate's mode
 * tint; Liquid Home draws no glass tint (CHO-6), so it has no effect there.
 */
export const THEME_VARS = { radius: '--lc-radius', blur: '--lc-blur', tint: '--lc-tint' } as const;

/** The power button of an unavailable entity (CHO-11). Liquid Climate: tile `.power:disabled` (opacity 0.5). */
export const UNAVAILABLE_POWER_OPACITY = 0.5;

/** TOK-19: the focus ring, existing Liquid Climate values under one name. Colour is lc-bright. */
export const FOCUS = {
  width: 2,
  color: 'var(--lc-bright)',
  /** Offset on buttons. */
  offset: 2,
  /** Offset on sliders (the dial's svg slider today). */
  sliderOffset: 3,
} as const;

/**
 * TOK-20: the big readout, as the dial (72px and 28px at a 400px content box). Value letter spacing as
 * the dial `.big`; unit 0 as the Foundations board type scale and the gate 2 prototype (the unit is not
 * inside the value there).
 */
export const READOUT = {
  value: { size: '18cqw', weight: 200, letterSpacing: '-0.04em' },
  unit: { size: '7cqw', weight: 300, letterSpacing: '0' },
} as const;

/** entity-colour rules, implemented by entityColour() in colour.ts. The neutral is TOK-14: tone(PALETTE.neutral). */
export const ENTITY = {
  /** TOK-11: against both the glass base and the slider track. */
  minContrast: 3,
  /** TOK-12: HSV saturation under this draws the neutral. */
  neutralBelow: 0.2,
  /** TOK-13: OKLCH lightness step (up on dark glass, down on light glass), hue kept, chroma clamped to sRGB. */
  step: 0.01,
} as const;

/**
 * The artwork backdrop: one blurred image layer under the single glass surface. No scrim on dark glass; on
 * light glass `scrimLight` sits inside the art layer between the image and the glass fill (P3-TOK-4).
 */
export const ART = {
  /** TOK-15: fixed, the look.blur default. */
  blur: 30,
  /** TOK-16. */
  scale: 1.15,
  /** TOK-17: fg and fg2 over any cover. */
  minText: 4.5,
  /** TOK-18: kept for compatibility. Not used together with `scrimLight`: fg2 and fg3 keep their glass values over art. */
  lightFg2: MENU_GLASS.light.fg2,
  /** P3-TOK-3: the crossfade between two covers, the TOK-10 duration in ms. */
  fade: 800,
  /** GD5: no decode within this many ms drops the layer to plain glass. */
  decodeCap: 3000,
  /** P3-TOK-4: the light glass colour at alpha 0.9, drawn on light glass only. */
  scrimLight: 'rgba(248,249,252,0.9)',
} as const;

/**
 * TOK-21: the toned spectrum. 13 kelvin stops (2000 to 6535 K, every 377.9 K) and 13 hue stops (every
 * 30 degrees), each through entityColour() with the target raised to 3.15:1 so the drawn sRGB blend
 * between stops stays at 3:1 or more (CON-15). spectrumStops() in colour.ts computes the same values.
 */
export const SPECTRUM = {
  stops: 13,
  kelvinMin: 2000,
  kelvinMax: 6535,
  hueStep: 30,
  target: 3.15,
  toned: {
    dark: {
      kelvin: ['#ff890e', '#ff9a3a', '#ffa95c', '#ffb677', '#ffc18d', '#ffcba1', '#ffd4b2', '#ffddc1', '#d5dce6', '#d5dce6', '#d5dce6', '#d5dce6', '#d5dce6'],
      hue: ['#ff2117', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#4078ff', '#9562ff', '#ff00ff', '#ff0080', '#ff2117'],
    },
    light: {
      kelvin: ['#b15c00', '#ae5f00', '#ac6000', '#a5631f', '#9f6835', '#976841', '#916b4c', '#8b6d54', '#64748b', '#64748b', '#64748b', '#64748b', '#64748b'],
      hue: ['#ea0000', '#b85a00', '#767600', '#3e8200', '#008600', '#00833f', '#008181', '#006fdf', '#0000ff', '#8000ff', '#cb00cb', '#e00070', '#ea0000'],
    },
  },
} as const;

/**
 * TOK-22 (V1): three mode buttons in the existing dial mode style switch the big pill between
 * brightness, warmth and colour. Active tint: fill 0.20, edge 0.45 of the colour.
 */
export const PILL_MODES = {
  height: 60,
  radius: 18,
  tint: { fill: 0.2, edge: 0.45 },
  modes: [
    { key: 'brightness', icon: 'bulb' },
    { key: 'white', icon: 'sun' },
    { key: 'colour', icon: 'rainbow' },
  ],
} as const;

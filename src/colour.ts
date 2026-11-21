/**
 * entity-colour: a lamp colour as it may be drawn where a mode colour goes today (slider fill, active
 * icon, tile power tint at the TINT levels). It is the generalisation of tone(): instead of a fixed
 * table it keeps any lamp colour at 3:1 against the glass base and the slider track (TOK-11 to 14).
 *
 * Ported from the gate 1 contrast script calc/ok.py (spectrum: calc/v315.py) in the Liquid Home design
 * archive; test/colour.test.ts checks the outputs against calc/ok.json. Rounding follows Python's
 * round() (half to even) so the port gives the same hexes.
 */
import { GLASS, composite, contrast, parseColor, type Rgb } from './glass';
import { clamp } from './math';
import { PALETTE, tone } from './palette';
import { ENTITY, SPECTRUM } from './tokens';

/** OKLCH: lightness 0..1, chroma, hue in radians. */
export type Oklch = [number, number, number];

export interface EntityColourOptions {
  /** Opaque glass base the colour is drawn on. Default: the glass over HA's own page colour. */
  base?: Rgb;
  /** Opaque slider track over that base. Default: the glass track composited over `base`. */
  track?: Rgb;
  /** Minimum contrast against both. Default ENTITY.minContrast (TOK-11); the toned spectrum uses SPECTRUM.target. */
  min?: number;
}

export interface EntityColour {
  hex: string;
  /** True when the colour fell back to the neutral (TOK-12, TOK-14), also for non-finite channels. */
  neutral: boolean;
  /**
   * True when `hex` reaches `min` against both base and track. Always true on the approved HA bases;
   * false only when the 100 lightness steps (or the neutral, on a custom base) do not get there.
   */
  ok: boolean;
}

/** HA's own page colours (dark #111111, light #fafafa): the measurement base of every CON item. */
const HA_PAGE: Record<'dark' | 'light', Rgb> = { dark: [17, 17, 17], light: [250, 250, 250] };
/** The step loop of calc/ok.py: at most 100 lightness steps, 30 halvings for the chroma clamp. */
const MAX_STEPS = 100;
const GAMUT_ITERATIONS = 30;

/** Python's round(): half to even. */
function pyRound(v: number): number {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function fix(c: readonly number[]): Rgb {
  return [0, 1, 2].map((i) => clamp(pyRound(c[i]), 0, 255)) as Rgb;
}

export function rgbToHex(c: Rgb): string {
  return '#' + c.map((v) => pyRound(v).toString(16).padStart(2, '0')).join('');
}

/** The opaque base and slider track of a glass over a page colour. */
export function glassGround(glass: 'dark' | 'light', page: Rgb = HA_PAGE[glass]): { base: Rgb; track: Rgb } {
  const base = composite(parseColor(GLASS[glass].bg), page);
  return { base, track: composite(parseColor(GLASS[glass].track), base) };
}

const srgbToLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

export function toOklch(c: Rgb): Oklch {
  const [r, g, b] = c.map(srgbToLinear);
  const l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3);
  const m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3);
  const s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** sRGB channels 0..255, unrounded; a channel with negative linear light is -1 (out of gamut). */
export function fromOklch(L: number, C: number, h: number): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, b].map((x) => (x >= 0 ? linearToSrgb(x) : -1)) as [number, number, number];
}

const inGamut = (c: readonly number[]) => c.every((v) => v >= -0.5 && v <= 255.5);

/** The largest chroma up to C that is inside sRGB at this lightness and hue. */
export function clampChroma(L: number, C: number, h: number): number {
  if (inGamut(fromOklch(L, C, h))) return C;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < GAMUT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(fromOklch(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** TOK-12: HSV saturation under 0.20 (white, near-white and cool white lamps). */
export function isNeutral(c: Rgb): boolean {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const s = max === min ? 0 : (max - min) / max;
  return s < ENTITY.neutralBelow;
}

/** HSV to sRGB 0..255 (hue in degrees, saturation and value 0..1), as Python's colorsys. */
export function hsvToRgb(hue: number, s: number, v: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 360;
  if (s === 0) return fix([v * 255, v * 255, v * 255]);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const rgb = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  return fix(rgb.map((x) => x * 255));
}

/** Colour temperature to sRGB, HA's formula (color_temperature_to_rgb): 2631 K gives 255, 164, 82. */
export function kelvinToRgb(kelvin: number): Rgb {
  // HA clamps the input to 1000..40000 K.
  const k = clamp(kelvin, 1000, 40000) / 100;
  const r = k <= 66 ? 255 : clamp(329.698727446 * (k - 60) ** -0.1332047592, 0, 255);
  const g = clamp(k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * (k - 60) ** -0.0755148492, 0, 255);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : clamp(138.5177312231 * Math.log(k - 10) - 305.0447927307, 0, 255);
  return fix([r, g, b]);
}

/**
 * TOK-11 to 14: the lamp colour as drawn on the glass. A colour with HSV saturation under 0.20 draws the
 * neutral, tone(PALETTE.neutral). A colour at 3:1 or more against both base and track is kept. Otherwise
 * its OKLCH lightness steps by 0.01 (up on dark glass, down on light), hue kept and chroma clamped to the
 * sRGB gamut, until it reaches 3:1 against both.
 */
export function entityColour(rgb: Rgb, glass: 'dark' | 'light', options: EntityColourOptions = {}): EntityColour {
  const base = options.base ?? glassGround(glass).base;
  const track = options.track ?? composite(parseColor(GLASS[glass].track), base);
  const min = options.min ?? ENTITY.minContrast;
  const worst = (c: Rgb) => Math.min(contrast(c, base), contrast(c, track));
  const result = (c: Rgb, neutral: boolean): EntityColour => ({ hex: rgbToHex(c), neutral, ok: worst(c) >= min });
  const neutral = parseColor(tone(PALETTE.neutral, glass)).slice(0, 3) as Rgb;
  if (!rgb.every(Number.isFinite)) return result(neutral, true);
  const input = fix(rgb);
  if (isNeutral(input)) return result(neutral, true);
  if (worst(input) >= min) return result(input, false);
  const [L0, C, h] = toOklch(input);
  let L = L0;
  let cur = input;
  for (let i = 0; i < MAX_STEPS; i++) {
    L = clamp(glass === 'light' ? L - ENTITY.step : L + ENTITY.step, 0, 1);
    cur = fix(fromOklch(L, clampChroma(L, C, h), h));
    if (worst(cur) >= min) break;
  }
  return result(cur, false);
}

/**
 * TOK-21: the 13 toned stops of the kelvin (2000 to 6535 K) or hue (0 to 360 degrees) spectrum on a glass,
 * each through entityColour() at the SPECTRUM.target contrast. Equal to SPECTRUM.toned.
 */
export function spectrumStops(kind: 'kelvin' | 'hue', glass: 'dark' | 'light'): string[] {
  const n = SPECTRUM.stops - 1;
  return Array.from({ length: SPECTRUM.stops }, (_, i) => {
    const raw =
      kind === 'kelvin'
        ? kelvinToRgb(SPECTRUM.kelvinMin + (i * (SPECTRUM.kelvinMax - SPECTRUM.kelvinMin)) / n)
        : hsvToRgb(i * SPECTRUM.hueStep, 1, 1);
    return entityColour(raw, glass, { min: SPECTRUM.target }).hex;
  });
}

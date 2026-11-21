/**
 * Glass palettes. The bases are opaque enough to keep text readable over any backdrop,
 * from a near-white page to a black one. test/glass.test.ts checks the contrast.
 */
export interface GlassPalette {
  bg: string;
  fg: string;
  fg2: string;
  fg3: string;
  /** Lit rings, lit ticks, knob fill. */
  bright: string;
  track: string;
  tick: string;
  /** Warning accent for text. */
  warn: string;
}

export const GLASS: Record<'dark' | 'light', GlassPalette> = {
  dark: {
    bg: 'rgba(18,20,26,0.78)',
    fg: '#f4f6fa',
    fg2: 'rgba(235,240,248,0.78)',
    // 12px footers: 4.5:1 on a cluster room even when the dark glass sits over a white page.
    fg3: 'rgba(235,240,248,0.76)',
    bright: '#ffffff',
    track: 'rgba(255,255,255,0.14)',
    tick: 'rgba(255,255,255,0.28)',
    warn: '#ffb067',
  },
  light: {
    bg: 'rgba(248,249,252,0.72)',
    fg: '#10141b',
    fg2: 'rgba(16,20,27,0.62)',
    fg3: 'rgba(16,20,27,0.62)',
    bright: '#10141b',
    track: 'rgba(16,20,27,0.16)',
    tick: 'rgba(16,20,27,0.32)',
    warn: '#7c3a05',
  },
};

export interface MenuPalette {
  fg2: string;
  warn: string;
  panel: string;
  /** Section headers (Scripts, Automations): text, 4.5:1 on the panel. */
  head: string;
  /** Ring of the Run pill and of the off switch: 3:1 against the panel. */
  edge: string;
  /** Switch on: a neutral bright track (never the mode colour) and the thumb on it. */
  onTrack: string;
  onThumb: string;
  /** Switch off: a faint track inside the ring, and its thumb. */
  offTrack: string;
  offThumb: string;
  /** Hover tint of an item, over the panel. */
  hover: string;
  /** Fill of the Run pill and of a checked option, over the panel (and over the hover tint). */
  pill: string;
  /** Fill of the Running pill. */
  pillOn: string;
}

/**
 * Colours of the status menu panel, a little stronger than the card's own fg2 and warn because
 * the panel adds a tint over the glass. test/glass.test.ts checks 4.5:1 for text and 3:1 for
 * the switch and pill edges on the panel, and on against off for the switch.
 */
export const MENU_GLASS: Record<'dark' | 'light', MenuPalette> = {
  dark: {
    fg2: 'rgba(235,240,248,0.94)',
    warn: '#ffc490',
    panel: 'rgba(255,255,255,0.05)',
    head: '#f0f3f8',
    edge: 'rgba(235,240,248,0.62)',
    onTrack: '#e9edf5',
    onThumb: '#10141b',
    offTrack: 'rgba(255,255,255,0.08)',
    offThumb: 'rgba(235,240,248,0.78)',
    hover: 'rgba(255,255,255,0.07)',
    pill: 'rgba(255,255,255,0.05)',
    pillOn: 'rgba(255,255,255,0.1)',
  },
  light: {
    fg2: 'rgba(16,20,27,0.86)',
    warn: '#5c2a04',
    panel: 'rgba(0,0,0,0.04)',
    head: '#161b23',
    edge: 'rgba(16,20,27,0.62)',
    onTrack: '#10141b',
    onThumb: '#ffffff',
    offTrack: 'rgba(0,0,0,0.06)',
    offThumb: 'rgba(16,20,27,0.66)',
    hover: 'rgba(0,0,0,0.06)',
    pill: 'rgba(0,0,0,0.04)',
    pillOn: 'rgba(0,0,0,0.08)',
  },
};

/** Ring around the badge's attention dot, close to each glass base. */
export const DOT_RING: Record<'dark' | 'light', string> = { dark: '#15171d', light: '#f3f4f7' };

/** Below this relative luminance a theme background counts as dark (HA's own dark default is #111111, mid greys stay light). */
const DARK_BACKGROUND_LUMINANCE = 0.2;

let probe: HTMLElement | null = null;

/** Resolve any CSS colour (names, hsl(), color-mix()) to rgb() text through the browser. Empty when unknown. */
function browserColor(value: string): string {
  try {
    if (typeof document === 'undefined') return '';
    if (!probe || !probe.isConnected) {
      probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = value;
    if (!probe.style.color) return '';
    return getComputedStyle(probe).color;
  } catch {
    return '';
  }
}

/** Is a CSS colour string dark? null when it is unknown (var(), gradient, url(), unparseable) or mostly transparent. */
export function cssColorIsDark(value: string): boolean | null {
  const v = value.trim();
  if (!v || /gradient\(|url\(|var\(/i.test(v)) return null;
  let rgba: Rgba | null = null;
  try {
    rgba = parseColor(v);
  } catch {
    rgba = null;
  }
  if (!rgba || !rgba.every(Number.isFinite)) {
    try {
      rgba = parseColor(browserColor(v));
    } catch {
      return null;
    }
    if (!rgba.every(Number.isFinite)) return null;
  }
  const [r, g, b, a] = rgba;
  if (a < 0.5) return null;
  return luminance([r, g, b]) < DARK_BACKGROUND_LUMINANCE;
}

/** Does the theme in effect at `host` have a dark page background? Reads the theme's own custom properties. */
export function themeIsDark(host: Element | null | undefined): boolean {
  if (!host) return false;
  try {
    const style = getComputedStyle(host);
    for (const name of ['--primary-background-color', '--card-background-color']) {
      const value = style.getPropertyValue(name).trim();
      if (!value) continue;
      const dark = cssColorIsDark(value);
      if (dark !== null) return dark;
    }
  } catch {
    // no computed style (detached host, odd environment): fall back to light
  }
  return false;
}

/**
 * "theme" follows the HA dark mode, or else a dark theme background (a single-mode dark theme
 * leaves darkMode false); dark and light are explicit.
 */
export function resolveGlass(
  glass: 'dark' | 'light' | 'theme',
  hass: { themes?: { darkMode?: boolean } | unknown },
  host?: Element | null,
): 'dark' | 'light' {
  if (glass !== 'theme') return glass;
  // On purpose: darkMode true wins even over a light background, keeping the earlier behaviour.
  if ((hass.themes as { darkMode?: boolean } | undefined)?.darkMode === true) return 'dark';
  return themeIsDark(host) ? 'dark' : 'light';
}

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

export function parseColor(c: string): Rgba {
  const t = c.trim();
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (!/^[0-9a-f]+$/i.test(h) || ![3, 4, 6, 8].includes(h.length)) throw new Error(`Unsupported colour ${c}`);
    if (h.length <= 4) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = t.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) throw new Error(`Unsupported colour ${c}`);
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const num = (x: string) => (x.endsWith('%') ? (Number(x.slice(0, -1)) * 255) / 100 : Number(x));
  const [r, g, b] = parts.slice(0, 3).map(num);
  const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
  return [r, g, b, a];
}

/** Composite a colour with alpha over an opaque backdrop. */
export function composite(fg: Rgba, bg: Rgb): Rgb {
  const a = fg[3];
  return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a))) as Rgb;
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Cluster room tiles over the glass base: fill and edge, resting and selected. Light rooms
 * are lifted with white rather than darkened, so the warning footer keeps its contrast when
 * the light glass sits over a dark page; there the selected edge carries the selection.
 * The dark selected fill is a cool tint, not a white lift, which would eat into the footer
 * contrast when the dark glass sits over a white page.
 */
export const ROOM_FILL: Record<'dark' | 'light', { rest: string; on: string; edge: string; onEdge: string }> = {
  dark: { rest: 'rgba(255,255,255,0.04)', on: 'rgba(100,140,240,0.1)', edge: 'rgba(255,255,255,0.07)', onEdge: 'rgba(255,255,255,0.26)' },
  light: { rest: 'rgba(255,255,255,0.55)', on: 'rgba(255,255,255,0.7)', edge: 'rgba(16,20,27,0.08)', onEdge: 'rgba(16,20,27,0.3)' },
};

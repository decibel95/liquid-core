/**
 * Generic colour tokens, copied from Liquid Climate 0.11.1 (src/ui/modes.ts, commit 373b340).
 * The blocks below the PALETTE are byte-identical to the original, except that LIGHT_TONES is exported and TINT
 * gains `power` (the dial power tint Liquid Climate wrote inline).
 */

/**
 * Mode name to colour hex. The values are the ones Liquid Climate's MODES table uses; MODES itself
 * (icons, setpoint flags) stays in Liquid Climate. `neutral` is the grey for TOK-14.
 */
export const PALETTE = {
  off: '#9aa3b2',
  heat: '#ff9447',
  cool: '#5ab0ff',
  heat_cool: '#a99cff',
  auto: '#a99cff',
  dry: '#40d3c8',
  fan_only: '#d5dce6',
  neutral: '#d5dce6',
} as const;

/** Badge states that are not hvac modes. */
export const STATUS_COLORS = {
  error: '#f87171',
  paused: '#facc15',
  off: '#6b7280',
} as const;

/** How much of the mode or status colour sits behind an icon. */
export const TINT = {
  /** Tile power button while on, and its edge. */
  tile: 0.24,
  tileEdge: 0.45,
  /** Badge icon circle. */
  badge: 0.3,
  /**
   * Power button of the dial-family card while on (CHO-7). Liquid Climate draws it inline as rgba(color, 0.28)
   * (src/cards/dial/liquid-climate-card.ts:534); named here, so the TINT above it stays byte-identical.
   */
  power: 0.28,
} as const;

/**
 * Light glass needs darker versions of the pale colours: amber, red and the fan grey
 * would wash out on a near-white base. test/glass.test.ts checks the result.
 */
export const LIGHT_TONES: Record<string, string> = {
  '#facc15': '#b45309',
  '#f87171': '#dc2626',
  '#d5dce6': '#64748b',
};

/** A mode or status colour as it is drawn on the given glass. */
export function tone(color: string, glass: 'dark' | 'light'): string {
  return glass === 'light' ? (LIGHT_TONES[color.toLowerCase()] ?? color) : color;
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Generic number helpers, copied from Liquid Climate 0.11.1 (src/ui/geometry.ts, commit 373b340).
// The function bodies and doc comments are byte-identical to the original.

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Position of a value on the scale, 0..1. */
export function valueToFraction(v: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((v - min) / (max - min), 0, 1);
}

/**
 * The value on the step grid that starts at `origin` (min by default), clamped to the limits. Climate
 * steps from min; a water heater or humidifier passes 0, so limits of 43.3 to 60 step 45, 46, 47.
 */
export function snap(v: number, step: number, min: number, max: number, origin = min): number {
  const s = step > 0 ? step : 1;
  const snapped = Math.round((v - origin) / s) * s + origin;
  // Trim float noise (e.g. 20.500000000000004).
  return clamp(Number(snapped.toFixed(4)), min, max);
}

export function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.abs(step * 10 - Math.round(step * 10)) < 1e-9 ? 1 : 2;
}

import { describe, expect, it } from 'vitest';
import { clamp, decimalsForStep, snap, valueToFraction } from '../src/math';

// The first three tests are copied from Liquid Climate's test/geometry.test.ts (commit 373b340).
describe('number helpers', () => {
  it('clamps values outside the scale', () => {
    expect(valueToFraction(5, 10, 30)).toBe(0);
    expect(valueToFraction(99, 10, 30)).toBe(1);
  });

  it('snaps to the step and trims float noise', () => {
    expect(snap(20.26, 0.5, 10, 30)).toBe(20.5);
    expect(snap(20.24, 0.5, 10, 30)).toBe(20);
    expect(snap(99, 0.5, 10, 30)).toBe(30);
    expect(snap(16.3, 1, 15, 28)).toBe(16);
    expect(snap(0.3 + 0.6, 0.1, 0, 5)).toBe(0.9);
  });

  it('picks decimals from the step', () => {
    expect(decimalsForStep(0.5)).toBe(1);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.25)).toBe(2);
    expect(decimalsForStep(1)).toBe(0);
  });

  it('clamps to the limits', () => {
    expect(clamp(5, 10, 30)).toBe(10);
    expect(clamp(99, 10, 30)).toBe(30);
    expect(clamp(20, 10, 30)).toBe(20);
  });

  it('maps a value to a 0..1 fraction and an empty range to 0', () => {
    expect(valueToFraction(20, 10, 30)).toBe(0.5);
    expect(valueToFraction(20, 30, 30)).toBe(0);
  });

  it('steps from an origin other than min', () => {
    expect(snap(46.2, 1, 43.3, 60, 0)).toBe(46);
    expect(snap(10, 0, 0, 30)).toBe(10);
  });
});

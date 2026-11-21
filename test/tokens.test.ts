import { describe, expect, it } from 'vitest';
import { MENU_GLASS } from '../src/glass';
import { ICONS } from '../src/icons';
import { PALETTE, tone } from '../src/palette';
import { ART, DISABLED_OPACITY, ENTITY, FOCUS, PILL_MODES, READOUT, SLIDER, SPECTRUM } from '../src/tokens';

// Values from the live gate 1 items (liquid-home-gate1-items.md); the ID is in each test name.
describe('gate 1 tokens', () => {
  it('SLIDER: TOK-1 to TOK-4, TOK-8 to TOK-10', () => {
    expect(SLIDER.width).toBe(96); // TOK-1
    expect([SLIDER.height, SLIDER.minHeight]).toEqual([280, 200]); // TOK-2
    expect(SLIDER.radius).toBe(26); // TOK-3
    expect(SLIDER.fill).toEqual({ opacity: 1, knob: false }); // TOK-4
    // Track and edge: existing glass values, as the approved gate 2 prototype `.sl`.
    expect([SLIDER.track, SLIDER.edge]).toEqual(['var(--lc-track)', { width: 1, color: 'var(--lc-btn-edge)' }]);
    expect(SLIDER.toggle).toEqual({ role: 'switch' }); // TOK-8
    // The pill row of the gate 2 prototype (lh-proto/index.html:69 to 75).
    expect(SLIDER.row).toEqual({ gap: 12, readoutGap: 8, pillInset: 24, narrowMax: 353 });
    expect(SLIDER.unavailableOpacity).toBe(0.3); // TOK-9
    expect(SLIDER.unavailableOpacity).toBe(DISABLED_OPACITY); // one value, two names
    expect(SLIDER.motion).toEqual({ properties: ['height', 'background-color'], durationMs: 800, easing: 'ease', dragging: 'none', reducedMotion: 'none' }); // TOK-10
  });

  it('FOCUS: TOK-19', () => {
    expect(FOCUS).toEqual({ width: 2, color: 'var(--lc-bright)', offset: 2, sliderOffset: 3 });
  });

  it('READOUT: TOK-20', () => {
    expect(READOUT.value).toEqual({ size: '18cqw', weight: 200, letterSpacing: '-0.04em' });
    expect(READOUT.unit).toEqual({ size: '7cqw', weight: 300, letterSpacing: '0' });
  });

  it('ENTITY: TOK-11 to TOK-13, and the TOK-14 neutral is the existing toned fan_only grey', () => {
    expect(ENTITY).toEqual({ minContrast: 3, neutralBelow: 0.2, step: 0.01 });
    expect(PALETTE.neutral).toBe(PALETTE.fan_only);
    expect([tone(PALETTE.neutral, 'dark'), tone(PALETTE.neutral, 'light')]).toEqual(['#d5dce6', '#64748b']);
  });

  it('ART: TOK-15 to TOK-18', () => {
    expect([ART.blur, ART.scale, ART.minText]).toEqual([30, 1.15, 4.5]);
    expect(ART.lightFg2).toBe('rgba(16,20,27,0.86)');
    expect(ART.lightFg2).toBe(MENU_GLASS.light.fg2);
  });

  it('SPECTRUM: TOK-21 shape (the stops are recomputed in colour.test.ts)', () => {
    expect([SPECTRUM.stops, SPECTRUM.kelvinMin, SPECTRUM.kelvinMax, SPECTRUM.hueStep, SPECTRUM.target]).toEqual([13, 2000, 6535, 30, 3.15]);
    expect((SPECTRUM.kelvinMax - SPECTRUM.kelvinMin) / (SPECTRUM.stops - 1)).toBeCloseTo(377.9, 1);
    for (const g of ['dark', 'light'] as const) {
      for (const kind of ['kelvin', 'hue'] as const) expect(SPECTRUM.toned[g][kind]).toHaveLength(13);
      // Hue wraps: the 360 degree stop is the 0 degree stop.
      expect(SPECTRUM.toned[g].hue[12]).toBe(SPECTRUM.toned[g].hue[0]);
      // From 5000 K up the kelvin stops are the neutral (saturation under 0.20).
      expect(SPECTRUM.toned[g].kelvin.slice(8)).toEqual(Array(5).fill(tone(PALETTE.neutral, g)));
    }
  });

  it('PILL_MODES: TOK-22, the dial mode button style with ICO-1 to ICO-3', () => {
    expect([PILL_MODES.height, PILL_MODES.radius]).toEqual([60, 18]);
    expect(PILL_MODES.tint).toEqual({ fill: 0.2, edge: 0.45 });
    expect(PILL_MODES.modes.map((m) => m.key)).toEqual(['brightness', 'white', 'colour']);
    for (const m of PILL_MODES.modes) expect(ICONS[m.icon]).toBeTypeOf('string');
  });
});

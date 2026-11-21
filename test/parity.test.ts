import { describe, expect, it } from 'vitest';
import fixture from './fixtures/lc-0.11.1-tokens.json';
import { GLASS, MENU_GLASS, DOT_RING, ROOM_FILL } from '../src/glass';
import { ICONS } from '../src/icons';
import { LIGHT_TONES, PALETTE, STATUS_COLORS, TINT, tone } from '../src/palette';
import { FOCUS } from '../src/tokens';

// The fixture is written by scripts/parity-fixture.mjs from Liquid Climate 0.11.1 (commit 373b340) and committed,
// so this test never needs the Liquid Climate repo. An intended change needs a new fixture and a core minor bump.
describe('token parity with Liquid Climate 0.11.1', () => {
  it('names the source', () => {
    expect(fixture.source).toEqual({ project: 'liquid-climate', version: '0.11.1', commit: '373b340' });
  });

  it('GLASS', () => expect(GLASS).toEqual(fixture.GLASS));
  it('MENU_GLASS', () => expect(MENU_GLASS).toEqual(fixture.MENU_GLASS));
  it('DOT_RING', () => expect(DOT_RING).toEqual(fixture.DOT_RING));
  it('ROOM_FILL', () => expect(ROOM_FILL).toEqual(fixture.ROOM_FILL));
  it('palette hexes', () => expect(PALETTE).toEqual(fixture.palette));
  it('STATUS_COLORS', () => expect(STATUS_COLORS).toEqual(fixture.STATUS_COLORS));
  // TINT.power is the inline dial power tint (chrome.test.ts); the rest is the Liquid Climate TINT.
  it('TINT', () => expect({ ...TINT, power: undefined }).toEqual({ ...fixture.TINT, power: undefined }));
  it('LIGHT_TONES', () => expect(LIGHT_TONES).toEqual(fixture.LIGHT_TONES));
  // The 24 Liquid Climate icons stay first and exact; gate 1 icons (ICO-1 to ICO-3) are added after them.
  it('ICONS paths', () => {
    const lc = Object.keys(fixture.ICONS);
    expect(lc).toHaveLength(24);
    expect(Object.keys(ICONS).slice(0, lc.length)).toEqual(lc);
    expect(Object.fromEntries(lc.map((k) => [k, ICONS[k as keyof typeof ICONS]]))).toEqual(fixture.ICONS);
  });

  it('the neutral grey is the fan_only colour and tones to the light neutral', () => {
    expect(PALETTE.neutral).toBe('#d5dce6');
    expect(PALETTE.neutral).toBe(PALETTE.fan_only);
    expect(tone(PALETTE.neutral, 'dark')).toBe('#d5dce6');
    expect(tone(PALETTE.neutral, 'light')).toBe('#64748b');
  });

  // The fixture pins what Liquid Climate draws: 2px of lc-bright, offset 2px, 3px on the dial sliders, -2px in the menu.
  // FOCUS (TOK-19) names the button and slider rings; focusRing (P10) extends this test.
  it('the fixture records every Liquid Climate focus ring', () => {
    expect(fixture.focusRing.map((f) => f.outline)).toEqual(Array(7).fill('2px solid var(--lc-bright)'));
    expect(fixture.focusRing.map((f) => f.offset).sort()).toEqual(['-2px', '2px', '2px', '2px', '2px', '2px', '3px']);
    expect(fixture.focusRing.find((f) => f.offset === '-2px')?.file).toBe('src/ui/menu.ts');
  });

  it('FOCUS (TOK-19) equals the Liquid Climate focus rings', () => {
    for (const f of fixture.focusRing) expect(f.outline).toBe(`${FOCUS.width}px solid ${FOCUS.color}`);
    // Buttons: every ring outside the dial slider and the inset menu ring.
    const buttons = fixture.focusRing.filter((f) => f.offset !== '3px' && f.offset !== '-2px');
    expect(buttons).toHaveLength(5);
    for (const f of buttons) expect(f.offset).toBe(`${FOCUS.offset}px`);
    // Sliders: the dial's svg slider.
    const sliders = fixture.focusRing.filter((f) => f.offset === `${FOCUS.sliderOffset}px`);
    expect(sliders.map((f) => f.file)).toEqual(['src/cards/dial/styles.ts']);
  });
});

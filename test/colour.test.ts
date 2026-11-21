import { describe, expect, it } from 'vitest';
import ok from './fixtures/entity-colour-ok.json';
import {
  clampChroma,
  entityColour,
  fromOklch,
  glassGround,
  hsvToRgb,
  isNeutral,
  kelvinToRgb,
  rgbToHex,
  spectrumStops,
  toOklch,
} from '../src/colour';
import { GLASS, composite, contrast, parseColor, type Rgb } from '../src/glass';
import { PALETTE, TINT, tone } from '../src/palette';
import { ENTITY, SPECTRUM } from '../src/tokens';

// Measurement base of every CON item (gate 1 items file): the glass over HA's own page colours.
// test/fixtures/entity-colour-ok.json is calc/ok.json from the Liquid Home design archive, unchanged.
const GLASSES = ['dark', 'light'] as const;
type Glass = (typeof GLASSES)[number];
const BASE: Record<Glass, string> = { dark: '#121318', light: '#f9f9fb' };
const TRACK: Record<Glass, string> = { dark: '#333438', light: '#d4d4d7' };
const NEUTRAL: Record<Glass, string> = { dark: '#d5dce6', light: '#64748b' };

const rgb = (hex: string) => parseColor(hex).slice(0, 3) as Rgb;
const r2 = (v: number) => Math.round(v * 100) / 100;
const ratios = (hex: string, g: Glass) => {
  const c = rgb(hex);
  const base = rgb(BASE[g]);
  const icon = contrast(rgb(GLASS[g].bright), composite([...c, TINT.tile], base));
  return { base: r2(contrast(c, base)), track: r2(contrast(c, rgb(TRACK[g]))), icon: r2(icon) };
};
// Python's round() (half to even), for the gradient blend of calc/v315.py.
const pyRound = (v: number) => {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

describe('measurement base', () => {
  it('glass over the HA page gives the CON base and track', () => {
    for (const g of GLASSES) {
      const { base, track } = glassGround(g);
      expect(rgbToHex(base)).toBe(BASE[g]);
      expect(rgbToHex(track)).toBe(TRACK[g]);
    }
  });

  it('the neutral is tone(PALETTE.neutral) (TOK-14)', () => {
    for (const g of GLASSES) expect(tone(PALETTE.neutral, g)).toBe(NEUTRAL[g]);
  });

  it('defaults equal passing the HA base and track explicitly', () => {
    for (const g of GLASSES) {
      for (const c of [[255, 0, 0], [0, 0, 255], [255, 164, 82]] as Rgb[]) {
        expect(entityColour(c, g)).toEqual(entityColour(c, g, { base: rgb(BASE[g]), track: rgb(TRACK[g]) }));
      }
    }
  });
});

describe('options and edge inputs', () => {
  it('a custom base without a track derives the track from the glass track over that base', () => {
    for (const g of GLASSES) {
      const base: Rgb = g === 'dark' ? [0, 0, 0] : [255, 255, 255];
      const track = composite(parseColor(GLASS[g].track), base);
      for (const c of [[255, 0, 0], [0, 0, 255], [255, 255, 0], [255, 64, 112]] as Rgb[]) {
        expect(entityColour(c, g, { base })).toEqual(entityColour(c, g, { base, track }));
      }
    }
    // The derived track differs from the HA one, so the default track is not reused.
    expect(rgbToHex(composite(parseColor(GLASS.dark.track), [0, 0, 0]))).not.toBe(TRACK.dark);
  });

  it('ok is true on the approved bases for the swatches, the sweep corners and the spectrum', () => {
    for (const g of GLASSES) {
      for (const row of ok) expect(entityColour(rgb(row.in), g).ok).toBe(true);
      for (let h = 0; h < 360; h += 15) for (const s of [0, 0.2, 0.5, 1]) expect(entityColour(hsvToRgb(h, s, 1), g).ok).toBe(true);
    }
  });

  it('ok is false when the steps cannot reach the target on a contrived mid-grey base', () => {
    const grey: Rgb = [128, 128, 128];
    const out = entityColour([255, 0, 0], 'dark', { base: grey, track: grey, min: 4.5 });
    expect(out.neutral).toBe(false);
    expect(out.ok).toBe(false);
    expect(contrast(rgb(out.hex), grey)).toBeLessThan(4.5);
  });

  it('non-finite channels draw the neutral', () => {
    for (const g of GLASSES) {
      for (const c of [[NaN, 0, 0], [255, Infinity, 0], [0, 0, -Infinity]] as Rgb[]) {
        expect(entityColour(c, g)).toEqual({ hex: NEUTRAL[g], neutral: true, ok: true });
      }
    }
  });

  it('kelvinToRgb clamps to 1000..40000 K like HA', () => {
    expect(kelvinToRgb(500)).toEqual(kelvinToRgb(1000));
    expect(kelvinToRgb(0)).toEqual(kelvinToRgb(1000));
    expect(kelvinToRgb(100000)).toEqual(kelvinToRgb(40000));
    expect(kelvinToRgb(1000).every(Number.isFinite)).toBe(true);
    expect(kelvinToRgb(1000)).not.toEqual(kelvinToRgb(1500));
  });
});

describe('equals calc/ok.json', () => {
  for (const row of ok) {
    for (const g of GLASSES) {
      const want = row[g];
      it(`${row.name} on ${g} glass: ${want.out} (${want.how})`, () => {
        const out = entityColour(rgb(row.in), g);
        expect(out.hex).toBe(want.out);
        expect(out.neutral).toBe(want.how === 'neutral');
        expect(out.hex === row.in).toBe(want.how === 'kept');
        expect(ratios(out.hex, g)).toEqual({ base: want.base, track: want.track, icon: want.icon });
        const inWorst = Math.min(contrast(rgb(row.in), rgb(BASE[g])), contrast(rgb(row.in), rgb(TRACK[g])));
        expect(r2(inWorst)).toBe(want.inb);
      });
    }
  }
});

// CON-1 to CON-9, written out from the gate 1 items file: input, glass, output hex, base / track, icon.
type Con = [id: string, input: Rgb, glass: Glass, out: string, base: number, track: number, icon?: number];
const CON: Con[] = [
  ['CON-1 5000 K', kelvinToRgb(5000), 'dark', '#d5dce6', 13.43, 9.0, 9.89],
  ['CON-1 5000 K', kelvinToRgb(5000), 'light', '#64748b', 4.53, 3.22, 13.03],
  ['CON-1 6500 K', kelvinToRgb(6500), 'dark', '#d5dce6', 13.43, 9.0, 9.89],
  ['CON-1 6500 K', kelvinToRgb(6500), 'light', '#64748b', 4.53, 3.22, 13.03],
  ['CON-2 red', [255, 0, 0], 'dark', '#ff0000', 4.64, 3.11, 15.32],
  ['CON-2 red', [255, 0, 0], 'light', '#ef0000', 4.28, 3.04, 11.41],
  ['CON-3 yellow', [255, 255, 0], 'dark', '#ffff00', 17.27, 11.58, 8.97],
  ['CON-3 yellow', [255, 255, 0], 'light', '#797900', 4.39, 3.12, 12.97],
  ['CON-4 blue', [0, 0, 255], 'dark', '#3b74ff', 4.53, 3.04, 14.06],
  ['CON-4 blue', [0, 0, 255], 'light', '#0000ff', 8.17, 5.81, 10.41],
  ['CON-5 pastel', rgb('#b2e5ff'), 'dark', '#b2e5ff', 13.73, 9.2, 9.85],
  ['CON-5 pastel', rgb('#b2e5ff'), 'light', '#4d7d94', 4.27, 3.04, 13.11],
  ['CON-6 #ff4070', rgb('#ff4070'), 'dark', '#ff4070', 5.49, 3.68, 13.79],
  ['CON-6 #ff4070', rgb('#ff4070'), 'light', '#e51f5c', 4.27, 3.03, 12.12],
  ['CON-7 #ff7f7d', rgb('#ff7f7d'), 'dark', '#ff7f7d', 7.58, 5.08, 12.23],
  ['CON-7 #ff7f7d', rgb('#ff7f7d'), 'light', '#c74c4e', 4.37, 3.11, 12.7],
  ['CON-8 #ff8080', rgb('#ff8080'), 'dark', '#ff8080', 7.64, 5.12, 12.22],
  ['CON-8 #ff8080', rgb('#ff8080'), 'light', '#c74e51', 4.31, 3.06, 12.79],
  ['CON-9 2700 K', kelvinToRgb(2700), 'dark', '#ffa757', 9.64, 6.46],
  ['CON-9 4000 K', kelvinToRgb(4000), 'dark', '#ffcea6', 12.92, 8.66],
  ['CON-9 4500 K', kelvinToRgb(4500), 'dark', '#ffdabb', 14.13, 9.47],
  ['CON-9 2631 K', kelvinToRgb(2631), 'dark', '#ffa452', 9.44, 6.33],
  ['CON-9 2700 K', kelvinToRgb(2700), 'light', '#ae6200', 4.39, 3.12],
  ['CON-9 4000 K', kelvinToRgb(4000), 'light', '#9a6e49', 4.25, 3.02],
  ['CON-9 4500 K', kelvinToRgb(4500), 'light', '#917054', 4.3, 3.05],
  ['CON-9 2631 K', kelvinToRgb(2631), 'light', '#b16200', 4.33, 3.08],
];

describe('CON-1 to CON-9 exact', () => {
  for (const [id, input, g, out, base, track, icon] of CON) {
    it(`${id} on ${g} glass: ${out} ${base} / ${track}`, () => {
      const got = entityColour(input, g);
      expect(got.hex).toBe(out);
      expect(got.neutral).toBe(out === NEUTRAL[g]);
      const r = ratios(got.hex, g);
      expect([r.base, r.track]).toEqual([base, track]);
      if (icon !== undefined) expect(r.icon).toBe(icon);
    });
  }

  it('kelvin inputs follow HA (2631 K is the demo 255, 164, 82)', () => {
    expect(kelvinToRgb(2631)).toEqual([255, 164, 82]);
    expect(rgbToHex(kelvinToRgb(2700))).toBe('#ffa757');
    expect(rgbToHex(kelvinToRgb(5000))).toBe('#ffe4ce');
    expect(rgbToHex(kelvinToRgb(6500))).toBe('#fffefa');
  });
});

describe('sweep: hue 0 to 359 x saturation 0.20 to 1 holds 3:1 (TOK-11)', () => {
  const sats = Array.from({ length: 17 }, (_, i) => 0.2 + i * 0.05);
  for (const g of GLASSES) {
    it(`${g} glass: every output is at least 3:1 against base ${BASE[g]} and track ${TRACK[g]}`, () => {
      const base = rgb(BASE[g]);
      const track = rgb(TRACK[g]);
      let worst = 99;
      let count = 0;
      for (let h = 0; h < 360; h++) {
        for (const s of sats) {
          const out = rgb(entityColour(hsvToRgb(h, s, 1), g).hex);
          worst = Math.min(worst, contrast(out, base), contrast(out, track));
          count++;
        }
      }
      expect(count).toBe(360 * 17);
      expect(worst).toBeGreaterThanOrEqual(ENTITY.minContrast);
    });
  }
});

describe('neutral below saturation 0.20 (TOK-12)', () => {
  for (const g of GLASSES) {
    it(`${g} glass: every hue at saturation 0 to 0.19 draws ${NEUTRAL[g]}`, () => {
      for (let h = 0; h < 360; h++) {
        for (const s of [0, 0.05, 0.1, 0.15, 0.19]) {
          expect(entityColour(hsvToRgb(h, s, 1), g)).toEqual({ hex: NEUTRAL[g], neutral: true, ok: true });
        }
      }
      for (const c of [[255, 255, 255], [0, 0, 0], [128, 128, 128], kelvinToRgb(6500)] as Rgb[]) {
        expect(entityColour(c, g)).toEqual({ hex: NEUTRAL[g], neutral: true, ok: true });
      }
    });
  }

  it('the threshold matches Python colorsys at the edge', () => {
    expect(isNeutral([255, 205, 205])).toBe(true); // 0.196
    expect(isNeutral([255, 204, 204])).toBe(true); // 1 - 0.8 in floats is just under 0.20
    expect(isNeutral([255, 203, 203])).toBe(false); // 0.204
    expect(isNeutral([255, 0, 0])).toBe(false);
  });
});

describe('OKLCH helpers', () => {
  it('round-trip sRGB through OKLCH', () => {
    for (const c of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 164, 82], [18, 19, 24], [128, 128, 128]] as Rgb[]) {
      const back = fromOklch(...toOklch(c));
      // A zero channel can come back as a tiny negative linear value, which fromOklch reports as -1 (out of gamut).
      back.forEach((v, i) => expect(Math.max(0, v)).toBeCloseTo(c[i], 3));
    }
  });

  it('clampChroma stays inside sRGB and keeps an in-gamut chroma', () => {
    const [L, C, h] = toOklch([0, 0, 255]);
    expect(clampChroma(L, C, h)).toBe(C);
    const cc = clampChroma(0.8, C, h);
    expect(cc).toBeLessThan(C);
    expect(fromOklch(0.8, cc, h).every((v) => v >= -0.5 && v <= 255.5)).toBe(true);
  });
});

describe('TOK-21 toned spectrum', () => {
  for (const g of GLASSES) {
    for (const kind of ['kelvin', 'hue'] as const) {
      it(`${g} ${kind} stops are exact`, () => {
        expect(spectrumStops(kind, g)).toEqual([...SPECTRUM.toned[g][kind]]);
      });
    }
  }

  // CON-15: the minimum along the drawn sRGB blend at 0.04% sampling (2401 samples, as calc/v315.py).
  const CON15: [Glass, 'kelvin' | 'hue', number, number, string, number][] = [
    ['dark', 'kelvin', 5.23, 7.81, '#ff890e', 0],
    ['light', 'kelvin', 3.14, 4.42, '#a06833', 32.5],
    ['dark', 'hue', 3.09, 4.61, '#ae4aff', 77],
    ['light', 'hue', 3.15, 4.43, '#b75b00', 8.5],
  ];
  for (const [g, kind, minTrack, minBase, at, pct] of CON15) {
    it(`CON-15 ${g} ${kind}: ${minTrack} / ${minBase} at ${at} (${pct}%)`, () => {
      const cols = SPECTRUM.toned[g][kind].map(rgb);
      const base = rgb(BASE[g]);
      const track = rgb(TRACK[g]);
      let mt = 99;
      let mb = 99;
      let worst = '';
      let where = 0;
      for (let i = 0; i <= 2400; i++) {
        const t = i / 2400;
        const j = Math.min(Math.floor(t * 12), 11);
        const f = t * 12 - j;
        const c = [0, 1, 2].map((q) => pyRound(cols[j][q] + (cols[j + 1][q] - cols[j][q]) * f)) as Rgb;
        const a = contrast(c, track);
        if (a < mt) {
          mt = a;
          worst = rgbToHex(c);
          where = Math.round(t * 1000) / 10;
        }
        mb = Math.min(mb, contrast(c, base));
      }
      expect([r2(mt), r2(mb), worst, where]).toEqual([minTrack, minBase, at, pct]);
      expect(mt).toBeGreaterThanOrEqual(ENTITY.minContrast);
      expect(mb).toBeGreaterThanOrEqual(ENTITY.minContrast);
    });
  }
});

// As Liquid Climate test/glass.test.ts:122: each glass over a white, a black and both HA page colours.
// entityColour() is computed for the approved HA base of its glass (the card cannot see the page), then
// measured over every backdrop. 3:1 is asserted only on the approved HA bases. The other backdrops are
// the CON-14 gap: their worst numbers over the CON swatches (calc/ok.json inputs) are recorded here
// exactly, so a change shows up, and never skipped.
describe('four backdrops (CON-14 gap recorded)', () => {
  const PAGES: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0], 'HA dark': [17, 17, 17], 'HA light': [250, 250, 250] };
  const APPROVED: Record<Glass, string> = { dark: 'HA dark', light: 'HA light' };
  // glass, page, worst against base, worst against track, swatch giving the worst
  const RECORDED: [Glass, string, number, number, string][] = [
    ['dark', 'white', 2.24, 1.49, 'Blue'],
    ['dark', 'black', 4.65, 3.17, 'Blue'],
    ['dark', 'HA light', 2.27, 1.52, 'Blue'],
    ['light', 'white', 4.31, 3.07, '4000 K'],
    ['light', 'black', 2.13, 1.59, '4000 K'],
    ['light', 'HA dark', 2.25, 1.66, '4000 K'],
  ];

  const worstOver = (g: Glass, page: Rgb) => {
    const { base, track } = glassGround(g, page);
    let mb = 99;
    let mt = 99;
    let name = '';
    for (const row of ok) {
      const c = rgb(entityColour(rgb(row.in), g).hex);
      const b = contrast(c, base);
      const t = contrast(c, track);
      if (b < mb) {
        mb = b;
        name = row.name;
      }
      mt = Math.min(mt, t);
    }
    return { mb, mt, name };
  };

  for (const g of GLASSES) {
    for (const page of Object.keys(PAGES)) {
      const recorded = RECORDED.find(([rg, rp]) => rg === g && rp === page);
      if (page === APPROVED[g]) {
        it(`${g} glass over ${page}: at least 3:1 against base and track`, () => {
          const { mb, mt } = worstOver(g, PAGES[page]);
          expect(mb).toBeGreaterThanOrEqual(ENTITY.minContrast);
          expect(mt).toBeGreaterThanOrEqual(ENTITY.minContrast);
        });
      } else {
        it(`${g} glass over ${page}: recorded ${recorded?.[2]} / ${recorded?.[3]} (${recorded?.[4]})`, () => {
          expect(recorded).toBeDefined();
          const { mb, mt, name } = worstOver(g, PAGES[page]);
          expect([r2(mb), r2(mt), name]).toEqual(recorded!.slice(2));
        });
      }
    }
  }

  it('records every non-approved backdrop', () => expect(RECORDED).toHaveLength(6));
});

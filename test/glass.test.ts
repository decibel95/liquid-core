// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOT_RING, GLASS, MENU_GLASS, ROOM_FILL, composite, contrast, cssColorIsDark, parseColor, resolveGlass, type Rgb } from '../src/glass';
import { PALETTE, STATUS_COLORS, TINT, rgba, tone } from '../src/palette';

// Liquid Climate's MODES table lives in Liquid Climate; its colours are the PALETTE hexes.
const MODES = Object.entries(PALETTE).map(([id, color]) => ({ id, color }));

describe('glass resolution', () => {
  it('theme follows the HA dark mode', () => {
    expect(resolveGlass('theme', { themes: { darkMode: true } })).toBe('dark');
    expect(resolveGlass('theme', { themes: { darkMode: false } })).toBe('light');
    expect(resolveGlass('theme', { themes: {} })).toBe('light');
    expect(resolveGlass('theme', {})).toBe('light');
  });

  it('dark and light stay explicit whatever the theme says', () => {
    expect(resolveGlass('dark', { themes: { darkMode: false } })).toBe('dark');
    expect(resolveGlass('light', { themes: { darkMode: true } })).toBe('light');
  });

  describe('theme background detection', () => {
    const hostWith = (props: Record<string, string>) => {
      const el = document.createElement('div');
      for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
      document.body.appendChild(el);
      return el;
    };
    const off = { themes: { darkMode: false } };
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('darkMode true wins without a host', () => {
      expect(resolveGlass('theme', { themes: { darkMode: true } }, hostWith({ '--primary-background-color': '#fafafa' }))).toBe('dark');
    });

    it('a dark single-mode theme background gives dark glass', () => {
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': '#111111' }))).toBe('dark');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': '#111' }))).toBe('dark');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': 'rgb(20, 22, 30)' }))).toBe('dark');
      expect(resolveGlass('theme', off, hostWith({ '--card-background-color': 'rgba(10, 10, 10, 1)' }))).toBe('dark');
    });

    it('light and mid backgrounds give light glass', () => {
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': '#fafafa' }))).toBe('light');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': '#808080' }))).toBe('light');
    });

    it('no host, no property or an unusable value gives light glass', () => {
      expect(resolveGlass('theme', off)).toBe('light');
      expect(resolveGlass('theme', off, null)).toBe('light');
      expect(resolveGlass('theme', off, hostWith({}))).toBe('light');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': 'var(--x)' }))).toBe('light');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': 'transparent' }))).toBe('light');
      expect(resolveGlass('theme', off, hostWith({ '--primary-background-color': 'rgba(0, 0, 0, 0)' }))).toBe('light');
    });

    it('darkMode true gives dark even over a light background', () => {
      expect(resolveGlass('theme', { themes: { darkMode: true } }, hostWith({ '--primary-background-color': '#ffffff' }))).toBe('dark');
    });

    it('understands modern colour syntax', () => {
      expect(cssColorIsDark('rgb(0 0 0)')).toBe(true);
      expect(cssColorIsDark('rgb(17 17 17 / 100%)')).toBe(true);
      expect(cssColorIsDark('#000000ff')).toBe(true);
      expect(cssColorIsDark('#000f')).toBe(true);
      expect(cssColorIsDark('#00000000')).toBeNull();
      expect(cssColorIsDark('linear-gradient(#000, #111)')).toBeNull();
      expect(cssColorIsDark('var(--x)')).toBeNull();
      expect(cssColorIsDark('')).toBeNull();
    });

    it('resolves named colours through the browser probe (happy-dom does not, so computed colour is stubbed)', () => {
      const real = window.getComputedStyle.bind(window);
      const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
        const st = real(el);
        const named: Record<string, string> = { black: 'rgb(0, 0, 0)', white: 'rgb(255, 255, 255)' };
        return new Proxy(st, { get: (t, k) => (k === 'color' ? named[(el as HTMLElement).style.color] ?? '' : Reflect.get(t, k)) });
      });
      try {
        expect(cssColorIsDark('black')).toBe(true);
        expect(cssColorIsDark('white')).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('skips an unknown primary background and uses the card background', () => {
      const host = hostWith({
        '--primary-background-color': 'linear-gradient(#fff, #eee)',
        '--card-background-color': '#111111',
      });
      expect(resolveGlass('theme', off, host)).toBe('dark');
    });

    it('inherits the theme variable from a parent element', () => {
      const parent = hostWith({ '--primary-background-color': '#111111' });
      const child = document.createElement('div');
      parent.appendChild(child);
      // happy-dom does not inherit custom properties; a browser does, so mimic that here.
      const real = window.getComputedStyle.bind(window);
      const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => (el === child ? real(parent) : real(el)));
      try {
        expect(resolveGlass('theme', off, child)).toBe('dark');
      } finally {
        spy.mockRestore();
      }
    });

    it('parseColor reads 3, 4, 6 and 8 digit hex', () => {
      expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
      expect(parseColor('#000f')).toEqual([0, 0, 0, 1]);
      expect(parseColor('#ff000080')[3]).toBeCloseTo(0.502, 2);
      expect(() => parseColor('#12')).toThrow();
    });

    it('explicit choices ignore the host', () => {
      expect(resolveGlass('light', off, hostWith({ '--primary-background-color': '#000000' }))).toBe('light');
      expect(resolveGlass('dark', off, hostWith({ '--primary-background-color': '#ffffff' }))).toBe('dark');
    });
  });
});

describe('glass contrast on any backdrop', () => {
  const WHITE: [number, number, number] = [255, 255, 255];
  const BLACK: [number, number, number] = [0, 0, 0];

  for (const kind of ['dark', 'light'] as const) {
    for (const [name, backdrop] of [['white', WHITE], ['black', BLACK]] as const) {
      const g = GLASS[kind];
      const base = composite(parseColor(g.bg), backdrop);

      it(`${kind} glass over ${name}: primary text is at least 4.5:1`, () => {
        expect(contrast(composite(parseColor(g.fg), base), base)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${kind} glass over ${name}: secondary text is at least 3:1`, () => {
        expect(contrast(composite(parseColor(g.fg2), base), base)).toBeGreaterThanOrEqual(3);
        expect(contrast(composite(parseColor(g.fg3), base), base)).toBeGreaterThanOrEqual(3);
      });

      it(`${kind} glass over ${name}: rings and ticks are at least 3:1 where lit and visible when dim`, () => {
        expect(contrast(composite(parseColor(g.bright), base), base)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(composite(parseColor(g.tick), base), base)).toBeGreaterThanOrEqual(1.3);
        expect(contrast(composite(parseColor(g.track), base), base)).toBeGreaterThanOrEqual(1.2);
      });
    }
  }

  it('the warning colour stays readable on light glass over white', () => {
    const base = composite(parseColor(GLASS.light.bg), [255, 255, 255]);
    expect(contrast(parseColor(GLASS.light.warn).slice(0, 3) as [number, number, number], base)).toBeGreaterThanOrEqual(4.5);
  });

  it('parses hex and rgba', () => {
    expect(parseColor('#10141b')).toEqual([16, 20, 27, 1]);
    expect(parseColor('rgba(18,20,26,0.78)')).toEqual([18, 20, 26, 0.78]);
  });
});

describe('tile and badge contrast on any backdrop', () => {
  const backdrops: [string, Rgb][] = [
    ['white', [255, 255, 255]],
    ['black', [0, 0, 0]],
  ];
  // Every colour that can sit behind a tile or badge icon.
  const colours: [string, string][] = [
    ...MODES.filter((m) => m.id !== 'auto').map((m) => [m.id, m.color] as [string, string]),
    ...Object.entries(STATUS_COLORS),
  ];

  for (const kind of ['dark', 'light'] as const) {
    for (const [name, backdrop] of backdrops) {
      const g = GLASS[kind];
      const base = composite(parseColor(g.bg), backdrop);
      const icon = (alpha: number, colour: string) => {
        const behind = composite(parseColor(rgba(tone(colour, kind), alpha)), base);
        return contrast(composite(parseColor(g.bright), behind), behind);
      };

      it(`${kind} glass over ${name}: tile name, subline and target text stay readable`, () => {
        // Name, target and badge value use fg; the subline, the badge name and the off power icon fg2.
        expect(contrast(composite(parseColor(g.fg), base), base)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(composite(parseColor(g.fg2), base), base)).toBeGreaterThanOrEqual(3);
      });

      for (const [id, colour] of colours) {
        it(`${kind} glass over ${name}: icons on the ${id} tint are at least 3:1`, () => {
          expect(icon(TINT.tile, colour)).toBeGreaterThanOrEqual(3);
          expect(icon(TINT.badge, colour)).toBeGreaterThanOrEqual(3);
        });
        if (id !== 'off') {
          // A coloured state must be told apart from the bare glass (the fan grey used to vanish on light).
          it(`${kind} glass over ${name}: the ${id} tint is visible against the glass`, () => {
            // Hue, not lightness, carries the state here, so measure colour distance.
            const tinted = composite(parseColor(rgba(tone(colour, kind), TINT.badge)), base);
            expect(Math.hypot(...tinted.map((c, i) => c - base[i]))).toBeGreaterThanOrEqual(20);
          });
        }
      }
    }
  }
});

describe('attention dot', () => {
  for (const kind of ['dark', 'light'] as const) {
    for (const id of ['error', 'paused'] as const) {
      it(`${kind} glass: the ${id} dot is at least 3:1 against its ring`, () => {
        const dot = parseColor(tone(STATUS_COLORS[id], kind)).slice(0, 3) as Rgb;
        const ring = parseColor(DOT_RING[kind]).slice(0, 3) as Rgb;
        expect(contrast(dot, ring)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('cluster room tiles on any backdrop', () => {
  const backdrops: [string, Rgb][] = [
    ['white', [255, 255, 255]],
    ['black', [0, 0, 0]],
  ];
  for (const kind of ['dark', 'light'] as const) {
    for (const [name, backdrop] of backdrops) {
      const g = GLASS[kind];
      const base = composite(parseColor(g.bg), backdrop);
      for (const state of ['rest', 'on'] as const) {
        const room = composite(parseColor(ROOM_FILL[kind][state]), base);
        it(`${kind} glass over ${name}, ${state} room: name and target 4.5:1, inside and footer 3:1, lit ring 3:1`, () => {
          expect(contrast(composite(parseColor(g.fg), room), room)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(composite(parseColor(g.fg2), room), room)).toBeGreaterThanOrEqual(3);
          expect(contrast(composite(parseColor(g.fg3), room), room)).toBeGreaterThanOrEqual(3);
          expect(contrast(composite(parseColor(g.bright), room), room)).toBeGreaterThanOrEqual(3);
          expect(contrast(composite(parseColor(g.track), room), room)).toBeGreaterThanOrEqual(1.2);
        });
      }
      it(`${kind} glass over ${name}: the selected room is told apart by its fill or its edge`, () => {
        const rest = composite(parseColor(ROOM_FILL[kind].rest), base);
        const on = composite(parseColor(ROOM_FILL[kind].on), base);
        const fill = Math.hypot(...on.map((c, i) => c - rest[i]));
        const edge = contrast(composite(parseColor(ROOM_FILL[kind].onEdge), on), on);
        expect(fill >= 10 || edge >= 1.5).toBe(true);
        expect(edge).toBeGreaterThan(contrast(composite(parseColor(ROOM_FILL[kind].edge), rest), rest));
      });
      for (const state of ['rest', 'on'] as const) {
        // Footers are 12px text, so AA asks 4.5:1 for the plain and the warning footer alike.
        it(`${kind} glass over ${name}: footer and warning footer are at least 4.5:1 on a ${state} room`, () => {
          const room = composite(parseColor(ROOM_FILL[kind][state]), base);
          expect(contrast(composite(parseColor(g.fg3), room), room)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(parseColor(g.warn).slice(0, 3) as Rgb, room)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe('status menu text on the panel surface', () => {
  for (const kind of ['dark', 'light'] as const) {
    for (const [name, backdrop] of [['white', [255, 255, 255]], ['black', [0, 0, 0]]] as const) {
      it(`${kind} glass over ${name}: secondary and error text are at least 4.5:1`, () => {
        const base = composite(parseColor(GLASS[kind].bg), [...backdrop] as Rgb);
        const panel = composite(parseColor(MENU_GLASS[kind].panel), base);
        expect(contrast(composite(parseColor(MENU_GLASS[kind].fg2), panel), panel)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(parseColor(MENU_GLASS[kind].warn).slice(0, 3) as Rgb, panel)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(composite(parseColor(GLASS[kind].fg), panel), panel)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('status menu section headers, Run pill and switch', () => {
  for (const kind of ['dark', 'light'] as const) {
    for (const [name, backdrop] of [['white', [255, 255, 255]], ['black', [0, 0, 0]]] as const) {
      const m = MENU_GLASS[kind];
      const base = composite(parseColor(GLASS[kind].bg), [...backdrop] as Rgb);
      const panel = composite(parseColor(m.panel), base);
      const on = (c: string, under: Rgb) => composite(parseColor(c), under);

      it(`${kind} glass over ${name}: section headers and the Run label are at least 4.5:1`, () => {
        expect(contrast(on(m.head, panel), panel)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${kind} glass over ${name}: every menu text and icon is at least 4.5:1 at rest and hovered`, () => {
        const hover = on(m.hover, panel);
        const checked = on(m.pillOn, panel);
        const surfaces: [string, Rgb][] = [['panel', panel], ['hover', hover], ['checked', checked]];
        for (const [label, bg] of surfaces) {
          expect(contrast(on(m.fg2, bg), bg), `fg2 on ${label}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(on(GLASS[kind].fg, bg), bg), `fg on ${label}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(on(m.head, hover), hover), 'head on hover').toBeGreaterThanOrEqual(4.5);
        // Pills stack on the item, which may be hovered.
        for (const [label, under] of [['panel', panel], ['hover', hover]] as [string, Rgb][]) {
          const run = on(m.pill, under);
          const running = on(m.pillOn, under);
          expect(contrast(on(GLASS[kind].fg, run), run), `Run on ${label}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(on(GLASS[kind].fg, running), running), `Running on ${label}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${kind} glass over ${name}: the Run pill ring and the off switch ring are at least 3:1 against the panel`, () => {
        expect(contrast(on(m.edge, panel), panel)).toBeGreaterThanOrEqual(3);
      });

      it(`${kind} glass over ${name}: the switch on track is at least 3:1 against the panel and against the off track`, () => {
        const onTrack = on(m.onTrack, panel);
        const offTrack = on(m.offTrack, panel);
        expect(contrast(onTrack, panel)).toBeGreaterThanOrEqual(3);
        expect(contrast(onTrack, offTrack)).toBeGreaterThanOrEqual(3);
      });

      it(`${kind} glass over ${name}: each switch thumb is at least 3:1 against its track`, () => {
        const onTrack = on(m.onTrack, panel);
        const offTrack = on(m.offTrack, panel);
        expect(contrast(on(m.onThumb, onTrack), onTrack)).toBeGreaterThanOrEqual(3);
        expect(contrast(on(m.offThumb, offTrack), offTrack)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('the on track is neutral: it does not borrow any mode colour', () => {
    for (const kind of ['dark', 'light'] as const) {
      const [r, g, b] = parseColor(MENU_GLASS[kind].onTrack);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(24);
      for (const mode of MODES) expect(MENU_GLASS[kind].onTrack.toLowerCase()).not.toBe(mode.color.toLowerCase());
    }
  });
});

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/lc-0.11.1-tokens.json';
import { cssRules } from './helpers/css-rules';
import { BADGE, CHEVRON, CLUSTER, CLUSTER_ICON, DIAL, TILE, badgeChrome, clusterChrome, clusterRoomLayout, clusterStyles, dialChrome, tileChrome } from '../src/chrome';
import { LIQUID_FONT_STACK } from '../src/font';
import { ICONS } from '../src/icons';
import { TINT } from '../src/palette';
import { DISABLED_OPACITY, PILL_MODES, THEME_VARS, UNAVAILABLE_POWER_OPACITY } from '../src/tokens';

// Every rule core ships must be the same rule, with the same declarations, in Liquid Climate 0.11.1 (373b340).
const sheets = { dial: dialChrome, tile: tileChrome, badge: badgeChrome, cluster: clusterChrome } as const;
// The one rule that is not a Liquid Climate value: the room value block of the gate 2 prototype (CHO-12).
const NOT_LC = new Set(['.room .rv']);
// The one declaration that differs on purpose: core puts its own 'Liquid Inter' face before the Liquid Climate stack.
const LC_FONT = "font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const CORE_FONT = `font-family: ${LIQUID_FONT_STACK}`;
const asLc = (list: string[]) => list.map((d) => (d === CORE_FONT ? LC_FONT : d));

describe.each(Object.entries(sheets))('%sChrome', (name, sheet) => {
  const core = cssRules(sheet.cssText);
  const lc = cssRules(fixture.chrome[name as keyof typeof fixture.chrome]);

  it('has rules', () => expect(core.size).toBeGreaterThan(10));

  it('every rule equals the Liquid Climate rule with the same selector', () => {
    for (const [key, list] of core) {
      if (NOT_LC.has(key)) continue;
      expect(lc.has(key), `${name}: ${key} is not in Liquid Climate`).toBe(true);
      expect(asLc(list), `${name}: ${key}`).toEqual(lc.get(key));
    }
  });

  it("every font-family is the core stack, 'Liquid Inter' first, then the Liquid Climate stack", () => {
    const fonts = [...core.values()].flat().filter((d) => d.startsWith('font-family:'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const d of fonts) expect(d).toBe(`font-family: 'Liquid Inter', ${LC_FONT.slice('font-family: '.length)}`);
  });

  it('has no focus rule (products add focusRing) and no climate-only rule', () => {
    const climate = /flick|\.dot|\.mini|\.floor|\.fig|\.range|\.dial|\.pt\b|\.spin|\.knob|\.prog|\.track|\.fan-|\.status|\.info|\.glow|\.tint|\.inside|\.group|\.osc|\.climb|\.battery|@keyframes/;
    for (const key of core.keys()) {
      expect(key, name).not.toMatch(climate);
      if (!key.includes('.who:focus-visible')) expect(core.get(key)!.join(';'), `${name} ${key}`).not.toMatch(/outline/);
    }
  });
});

describe('chrome rule coverage', () => {
  it('copies the generic rules of each card', () => {
    const keys = (s: keyof typeof sheets) => [...cssRules(sheets[s].cssText).keys()];
    expect(keys('dial')).toEqual(
      [':host', '.lc', 'h2', 'button', 'button:disabled', '.press', '.press:active:not(:disabled)', 'header', 'header .titles', 'header .sub', 'header .actions', '.power', '.modes', '.mode', '.mode span', '.chips', '.chip', '.chip .txt', '.chip .k', '.chip .v', '.chip svg', '.alert', '.unavailable', '@media (prefers-reduced-motion: reduce) | .press'],
    );
    expect(keys('tile')).toEqual([':host', '.tile', 'button', 'button:disabled', '.press', '.press:active:not(:disabled)', '.power', '.power:disabled', '.body', '.name', '.sub', '.sub.err', '.sr', '.steps', '.step', '.step:disabled', '.target', '@media (prefers-reduced-motion: reduce) | .press']);
    expect(keys('badge')).toEqual([':host', '.wrap', '.badge', 'button.badge', '.pill', '.round', '.ic', '.ic svg', '.pill .ic', '.txt', '.n', '.v']);
    const c440 = (k: string) => `@container (min-width: 440px) | ${k}`;
    const c720 = (k: string) => `@container (min-width: 720px) | ${k}`;
    expect(keys('cluster')).toEqual([
      ':host', '.g-dark', '.g-light', '.cluster', 'button', 'button:disabled', '.press', ".press:active:not(:disabled):not([aria-disabled='true'])",
      'header', '.title', 'h2', '.sum', '.rooms', '.rooms::-webkit-scrollbar', '.room', '.room.sel', '.rhead', '.rname', '.ricon',
      '.tline', '.big', '.deg', '.foot', '.foot.warn', '.sverb.warn', '.empty',
      '.strip', '.strip.nomodes', '.who', '.who:hover', '.who:focus-visible', '.wtext', '.chev', '.sname', '.sverb', '.modes', '.mode', '.steps', '.step', ".step[aria-disabled='true']", '.target', '.sr',
      ...['.cluster', '.rooms', '.room', '.big', '.deg'].map(c440),
      ...['.cluster', '.rooms', '.room', '.big', '.deg', '.strip', '.strip.nomodes', '.steps'].map(c720),
      '@media (prefers-reduced-motion: reduce) | .press', '@media (prefers-reduced-motion: reduce) | .who',
      '.room .rv',
    ]);
  });

  it('dialChrome .lc blurs through the card-set --_blur with no fallback, so cards must set it inline', () => {
    expect(cssRules(dialChrome.cssText).get('.lc')).toContain('backdrop-filter: blur(var(--lc-blur, var(--_blur))) saturate(170%)');
  });

  it('the room value block is the gate 2 prototype rule (CHO-12)', () => {
    expect(cssRules(clusterRoomLayout.cssText).get('.room .rv')).toEqual(['display: flex', 'align-items: flex-start', 'justify-content: center', 'padding: 22px 0 18px']);
    expect(clusterStyles).toBe(clusterChrome);
  });
});

describe('chrome tokens', () => {
  const lc = (s: keyof typeof fixture.chrome) => cssRules(fixture.chrome[s]);
  it('DIAL is what the Liquid Climate dial draws', () => {
    const r = lc('dial');
    expect(r.get(':host')).toContain(`--lc-radius-default: ${DIAL.radius}px`);
    expect(r.get('.lc')).toEqual(expect.arrayContaining([`max-width: ${DIAL.maxWidth}px`, `padding: ${DIAL.padding}px`, `gap: ${DIAL.gap}px`, `box-shadow: inset 0 1px 0 var(--lc-shine), var(--lc-drop, ${DIAL.shadow})`]));
    expect(r.get('h2')).toEqual(expect.arrayContaining([`font-size: ${DIAL.title.size}px`, `font-weight: ${DIAL.title.weight}`, `letter-spacing: ${DIAL.title.letterSpacing}`]));
    expect(r.get('.power')).toEqual(expect.arrayContaining([`width: ${DIAL.power}px`, `height: ${DIAL.power}px`]));
    expect(r.get('.chip')).toEqual(expect.arrayContaining([`height: ${DIAL.chip.height}px`, `border-radius: ${DIAL.chip.radius}px`]));
    expect(r.get('.alert')).toEqual(expect.arrayContaining([`border-radius: ${DIAL.alert.radius}px`, `font-size: ${DIAL.alert.size}px`]));
    // The mode buttons are TOK-22, one value under two names.
    expect(r.get('.mode')).toEqual(expect.arrayContaining([`height: ${PILL_MODES.height}px`, `border-radius: ${PILL_MODES.radius}px`]));
  });

  it('TILE, BADGE and CLUSTER are what Liquid Climate draws', () => {
    expect(lc('tile').get('.tile')).toEqual(expect.arrayContaining([`height: ${TILE.height}px`, `border-radius: var(--lc-radius, ${TILE.radius}px)`, `box-shadow: inset 0 1px 0 var(--lc-shine), ${TILE.shadow}`]));
    expect(lc('tile').get('.power')).toEqual(expect.arrayContaining([`width: ${TILE.power.size}px`, `border-radius: ${TILE.power.radius}px`]));
    expect(lc('badge').get('.badge')).toEqual(expect.arrayContaining([`--_size: var(--ha-badge-size, ${BADGE.size}px)`, `box-shadow: inset 0 1px 0 var(--lc-shine), ${BADGE.shadow}`]));
    expect(lc('cluster').get('.cluster')).toEqual(expect.arrayContaining([`padding: ${CLUSTER.padding.narrow}px`, `border-radius: var(--lc-radius, ${CLUSTER.radius}px)`, `box-shadow: inset 0 1px 0 var(--lc-shine), ${CLUSTER.shadow}`]));
    expect(lc('cluster').get('@container (min-width: 720px) | .big')).toEqual([`font-size: ${CLUSTER.value.wide}px`]);
  });

  it('CR-2: TINT.power, DISABLED_OPACITY and UNAVAILABLE_POWER_OPACITY come from Liquid Climate', () => {
    expect(TINT.power).toBe(fixture.powerTint);
    const { power: _p, ...rest } = TINT;
    expect(rest).toEqual(fixture.TINT);
    expect(lc('tile').get('.power:disabled')).toEqual([`opacity: ${UNAVAILABLE_POWER_OPACITY}`]);
    expect(lc('tile').get('.step:disabled')).toEqual([`opacity: ${DISABLED_OPACITY}`]);
    expect(lc('cluster').get(".step[aria-disabled='true']")).toEqual([`opacity: ${DISABLED_OPACITY}`, 'cursor: default']);
    expect([TINT.power, DISABLED_OPACITY, UNAVAILABLE_POWER_OPACITY]).toEqual([0.28, 0.3, 0.5]);
  });

  it('CHEVRON and CLUSTER_ICON are the cluster code values; CHEVRON is not an ICONS entry', () => {
    expect(CHEVRON).toBe(fixture.chevron);
    expect(Object.values(ICONS)).not.toContain(CHEVRON);
    const icons = Object.fromEntries(fixture.clusterIcons.map((i) => [i.icon, [i.size, i.stroke]]));
    expect([CLUSTER_ICON.room.size, CLUSTER_ICON.room.stroke]).toEqual(icons.icon);
    expect([CLUSTER_ICON.chevron.size, CLUSTER_ICON.chevron.stroke]).toEqual(icons.CHEVRON);
    expect([CLUSTER_ICON.mode.size, CLUSTER_ICON.mode.stroke]).toEqual(icons['info.icon']);
    expect([CLUSTER_ICON.step.size, CLUSTER_ICON.step.stroke]).toEqual(icons['ICONS.minus']);
    expect(icons['ICONS.plus']).toEqual(icons['ICONS.minus']);
  });
});

describe('THEME_VARS (plan 4.1, D-3)', () => {
  it('are the variables Liquid Climate reads and never sets', () => {
    expect(Object.values(THEME_VARS).sort()).toEqual(fixture.themeVars);
  });
  it('the chrome reads radius and blur through them', () => {
    const all = [dialChrome, tileChrome, badgeChrome, clusterChrome].map((c) => c.cssText).join('\n');
    expect(all).toContain(`var(${THEME_VARS.radius}, `);
    expect(all).toContain(`var(${THEME_VARS.blur}, `);
  });
});

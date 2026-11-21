import { describe, expect, it } from 'vitest';
import { hassNeedsRender } from '../src/render-gate';
import type { HassEntity, HomeAssistant } from '../src/types';

const state = (entity_id: string, s: string): HassEntity => ({ entity_id, state: s, attributes: {} });
const hass = (): HomeAssistant => ({
  states: { 'climate.a': state('climate.a', 'heat'), 'climate.b': state('climate.b', 'cool') },
  entities: {},
  devices: {},
  areas: {},
  floors: {},
  config: { unit_system: { temperature: '°C' } },
  callService: () => undefined,
});

// Modelled on the render gate tests of Liquid Climate (test/writer.test.ts and test/cluster.test.ts, commit 373b340).
describe('render gate', () => {
  it('ignores unrelated state changes and reacts to watched ones, registries and theme', () => {
    const h = hass();
    const other = { ...h, states: { ...h.states, 'climate.b': state('climate.b', 'off') } };
    expect(hassNeedsRender(h, other, ['climate.a'])).toBe(false);
    expect(hassNeedsRender(h, other, ['climate.b'])).toBe(true);
    expect(hassNeedsRender(h, { ...h, entities: {} }, ['climate.a'])).toBe(true);
    expect(hassNeedsRender(h, { ...h, themes: { darkMode: true } }, ['climate.a'])).toBe(true);
    expect(hassNeedsRender(undefined, h, [])).toBe(true);
  });

  it('a change to the area or floor registry re-renders', () => {
    const h = hass();
    expect(hassNeedsRender(h, { ...h }, ['climate.a'])).toBe(false);
    expect(hassNeedsRender(h, { ...h, areas: { ...h.areas } }, ['climate.a'])).toBe(true);
    expect(hassNeedsRender(h, { ...h, floors: { ...h.floors } }, ['climate.a'])).toBe(true);
  });

  it('translations arriving later (a new localize or format function) re-render', () => {
    const h = hass();
    expect(hassNeedsRender(h, { ...h, localize: () => 'x' }, ['climate.a'])).toBe(true);
    expect(hassNeedsRender(h, { ...h, formatEntityState: () => 'x' }, ['climate.a'])).toBe(true);
    expect(hassNeedsRender(h, { ...h, formatEntityAttributeValue: () => 'x' }, ['climate.a'])).toBe(true);
  });

  it('an awaited entity that appears re-renders', () => {
    const h = hass();
    const now = { ...h, states: { ...h.states, 'climate.c': state('climate.c', 'heat') } };
    expect(hassNeedsRender(h, now, ['climate.a'], ['climate.c'])).toBe(true);
    expect(hassNeedsRender(h, now, ['climate.a'], ['climate.d'])).toBe(false);
  });

  it('a change of temperature unit re-renders', () => {
    const h = hass();
    expect(hassNeedsRender(h, { ...h, config: { unit_system: { temperature: '°F' } } }, ['climate.a'])).toBe(true);
  });
});

// Test doubles for the writer and write queue: a climate build copied from Liquid Climate 0.11.1
// (src/cards/dial/write-queue.ts buildCalls, climate path) so its queue, hold and lease cases run unchanged under the
// debounce policy, and a brightness light build in the shape Liquid Home uses (brightness_pct, turn_off at 0).
import { vi } from 'vitest';
import { EntityWriter, type WriterOptions } from '../../src/writer';
import { debounceWrites, throttleWrites, type WriteCall } from '../../src/write-queue';
import type { HassEntity, HomeAssistant } from '../../src/types';

/** Fake timers that also fake performance.now, the queue's default clock. Date stays at 0 for readable stamps. */
export function fakeClock(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Date', 'performance'],
  });
  vi.setSystemTime(0);
}

export interface Optimistic {
  hvac_mode?: string;
  temperature?: number;
  target_temp_low?: number;
  target_temp_high?: number;
  fan_mode?: string;
  swing_mode?: string;
  swing_horizontal_mode?: string;
  preset_mode?: string;
}

const NO_SETPOINT = ['off', 'dry', 'fan_only'];

const CLIMATE_ATTRS = {
  hvac_modes: ['off', 'fan_only', 'heat', 'cool', 'heat_cool', 'dry'],
  fan_modes: ['auto', 'quiet', '1', '2', '3', '4', '5'],
  preset_modes: ['away', 'boost', 'none'],
  swing_modes: ['stop', 'swing', 'windnice'],
  swing_horizontal_modes: ['stop', 'swing'],
  fan_mode: '2',
  preset_mode: 'none',
  swing_mode: 'stop',
  swing_horizontal_mode: 'stop',
};

/** The Liquid Climate Keuken (heat, 19.5) and Slaapkamer (cool, 21) units, the attributes the writes read. */
export function climateStates(): Record<string, HassEntity> {
  return {
    'climate.keuken_airco': { entity_id: 'climate.keuken_airco', state: 'heat', attributes: { ...CLIMATE_ATTRS, temperature: 19.5 } },
    'climate.slaapkamer_airco': { entity_id: 'climate.slaapkamer_airco', state: 'cool', attributes: { ...CLIMATE_ATTRS, temperature: 21 } },
  };
}

function expected(stateObj: HassEntity, inflight: Optimistic): { a: Record<string, any>; mode: string } {
  const a: Record<string, any> = { ...stateObj.attributes };
  for (const [k, v] of Object.entries(inflight)) if (k !== 'hvac_mode' && v !== undefined) a[k] = v;
  return { a, mode: inflight.hvac_mode ?? stateObj.state };
}

/** Liquid Climate buildCalls, climate path. */
export function buildCalls(entityId: string, change: Optimistic, stateObj: HassEntity, inflight: Optimistic = {}): WriteCall<Optimistic>[] {
  const { a, mode: currentMode } = expected(stateObj, inflight);
  const calls: WriteCall<Optimistic>[] = [];
  const base = { entity_id: entityId };
  const finalMode = change.hvac_mode ?? currentMode;
  if (change.hvac_mode !== undefined && change.hvac_mode !== currentMode) calls.push({ service: 'set_hvac_mode', data: { ...base, hvac_mode: change.hvac_mode } });
  if (!NO_SETPOINT.includes(finalMode)) {
    const t: Record<string, unknown> = {};
    if (change.temperature !== undefined && change.temperature !== a.temperature) t.temperature = change.temperature;
    const lowChanged = change.target_temp_low !== undefined && change.target_temp_low !== a.target_temp_low;
    const highChanged = change.target_temp_high !== undefined && change.target_temp_high !== a.target_temp_high;
    if (lowChanged || highChanged) {
      t.target_temp_low = change.target_temp_low ?? a.target_temp_low;
      t.target_temp_high = change.target_temp_high ?? a.target_temp_high;
    }
    if (Object.keys(t).length) calls.push({ service: 'set_temperature', data: { ...base, ...t } });
  }
  const simple: [keyof Optimistic, string][] = [
    ['fan_mode', 'set_fan_mode'],
    ['swing_mode', 'set_swing_mode'],
    ['swing_horizontal_mode', 'set_swing_horizontal_mode'],
    ['preset_mode', 'set_preset_mode'],
  ];
  for (const [key, service] of simple) {
    const v = change[key];
    if (v !== undefined && v !== a[key]) calls.push({ service, data: { ...base, [key]: v } });
  }
  return calls;
}

export const climateOptions: WriterOptions<Optimistic, WriteCall<Optimistic>> = {
  build: (change, entity, baseline) => buildCalls(entity.entity_id, change, entity, baseline),
  schedule: debounceWrites(1500),
  stateOf: (e, key) => (key === 'hvac_mode' ? e.state : e.attributes[key]),
};

/** Liquid Climate's mode memory and power button, as a subclass, to show the climate half fits on the core writer. */
export class ClimateWriter extends EntityWriter<Optimistic> {
  static lastModes = new Map<string, string>();

  constructor(entityId: string) {
    super(entityId, climateOptions);
  }

  override observe(hass: HomeAssistant): void {
    const s = hass.states[this.entityId];
    if (s && !['off', 'unavailable', 'unknown'].includes(s.state)) ClimateWriter.lastModes.set(this.entityId, s.state);
    super.observe(hass);
  }

  togglePower(currentMode: string): void {
    if (currentMode !== 'off') return this.set({ hvac_mode: 'off' });
    const target = ClimateWriter.lastModes.get(this.entityId);
    if (target) this.set({ hvac_mode: target });
  }
}

export function makeHass(
  states: Record<string, HassEntity>,
  onCall: (domain: string, service: string, data: any) => unknown = () => {},
): HomeAssistant {
  return {
    states,
    entities: {},
    devices: {},
    config: { unit_system: { temperature: '°C' } },
    callService: (d, s, data) => onCall(d, s, data) as Promise<unknown> | void,
  };
}

// ---- Light ----

export interface LightPatch {
  brightness_pct?: number;
  hs_color?: [number, number];
  color_temp_kelvin?: number;
}

/** HA stores colour temperature in mireds, so a kelvin value comes back as floor(1e6 / round(1e6 / k)): 2700 K is 2702 K. */
export const viaMireds = (k: number): number => Math.floor(1e6 / Math.round(1e6 / k));

/** Kelvin within one mired of the value sent counts as that value. */
export const kelvinMatches = (key: string, actual: unknown, sent: unknown): boolean =>
  key === 'color_temp_kelvin' && typeof actual === 'number' && typeof sent === 'number'
    ? Math.abs(1e6 / actual - 1e6 / sent) <= 1
    : JSON.stringify(actual) === JSON.stringify(sent);

/** Brightness in percent as the card shows it; 0 when off. */
export const pctOf = (e: HassEntity): number => (e.state === 'on' ? Math.round((e.attributes.brightness ?? 0) / 2.55) : 0);

export const lightStateOf = (e: HassEntity, key: string): unknown => {
  if (key === 'brightness_pct') return pctOf(e);
  if (key === 'hs_color') return Array.isArray(e.attributes.hs_color) ? e.attributes.hs_color.map((v: number) => Math.round(v)) : undefined;
  return e.attributes[key];
};

/** Brightness 0 turns the light off; a value HA has or will have once in-flight writes land is dropped. */
export function lightBuild(change: LightPatch, e: HassEntity, baseline: LightPatch): WriteCall<LightPatch>[] {
  const has: LightPatch = {
    brightness_pct: pctOf(e),
    hs_color: lightStateOf(e, 'hs_color') as [number, number],
    color_temp_kelvin: e.attributes.color_temp_kelvin,
    ...baseline,
  };
  const base = { entity_id: e.entity_id };
  const data: Record<string, unknown> = {};
  const p = change.brightness_pct;
  if (p !== undefined && p !== has.brightness_pct) {
    if (p === 0) return [{ domain: 'light', service: 'turn_off', data: base, sets: { brightness_pct: 0 } }];
    data.brightness_pct = p;
  }
  const hs = change.hs_color;
  if (hs && !(has.hs_color && hs[0] === has.hs_color[0] && hs[1] === has.hs_color[1])) data.hs_color = hs;
  const k = change.color_temp_kelvin;
  if (k !== undefined && k !== has.color_temp_kelvin) data.color_temp_kelvin = k;
  return Object.keys(data).length ? [{ domain: 'light', service: 'turn_on', data: { ...base, ...data } }] : [];
}

export const lightOptions = (schedule = 300): WriterOptions<LightPatch, WriteCall<LightPatch>> => ({
  build: lightBuild,
  schedule: throttleWrites(schedule),
  stateOf: lightStateOf,
  sendOnRelease: (c) => c.brightness_pct === 0,
});

/**
 * A fake HA for one light: applies each call and reports the new state `echoMs` later (0 is a demo light, 2000 a slow
 * one, null never reports). Each report is a new hass object passed to `onState`, as HA does.
 */
export class FakeLightHA {
  calls: { at: number; service: string; data: Record<string, any> }[] = [];
  private state: HassEntity;
  onState?: (hass: HomeAssistant) => void;
  /** Calls for which this is true are rejected. */
  fail: (data: Record<string, any>) => boolean = () => false;

  constructor(
    readonly entityId: string,
    private readonly echoMs: number | null,
    brightness = 128,
  ) {
    this.state = { entity_id: entityId, state: 'on', attributes: { brightness, hs_color: [30, 80] } };
  }

  get hass(): HomeAssistant {
    return makeHass({ [this.entityId]: this.state }, (_d, service, data) => this.call(service, data));
  }

  get pct(): number {
    return pctOf(this.state);
  }

  private async call(service: string, data: Record<string, any>): Promise<void> {
    this.calls.push({ at: Date.now(), service, data });
    if (this.fail(data)) throw new Error('');
    const prev = this.state;
    const next: HassEntity =
      service === 'turn_off'
        ? { ...prev, state: 'off', attributes: { ...prev.attributes, brightness: null } }
        : {
            ...prev,
            state: 'on',
            attributes: {
              ...prev.attributes,
              ...(data.brightness_pct !== undefined ? { brightness: Math.round(data.brightness_pct * 2.55) } : {}),
              ...(data.hs_color ? { hs_color: [data.hs_color[0] + 0.2, data.hs_color[1] - 0.3] } : {}),
              ...(data.color_temp_kelvin !== undefined ? { color_temp_kelvin: viaMireds(data.color_temp_kelvin) } : {}),
            },
          };
    if (this.echoMs === null) return;
    setTimeout(() => {
      this.state = next;
      this.onState?.(this.hass);
    }, this.echoMs);
  }
}

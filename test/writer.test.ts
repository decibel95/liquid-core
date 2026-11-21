import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityWriter, WriterLease, WriterRegistry, type WriterOptions } from '../src/writer';
import { debounceWrites, type WriteCall } from '../src/write-queue';
import {
  ClimateWriter,
  FakeLightHA,
  climateStates,
  fakeClock,
  kelvinMatches,
  lightOptions,
  makeHass,
  pctOf,
  type LightPatch,
} from './fixtures/writes';

// ---- Copied from Liquid Climate 0.11.1 test/writer.test.ts ('climate writer'), bodies unchanged, under debounce. ----
// acquireWriter, releaseWriter and writerRefs are the module functions of Liquid Climate, here backed by a registry.

const registry = new WriterRegistry((id) => new ClimateWriter(id));
const acquireWriter = (id: string) => registry.acquire(id);
const releaseWriter = (w: ClimateWriter) => registry.release(w);
const writerRefs = (id: string) => registry.refs(id);

describe('climate writer', () => {
  beforeEach(() => {
    fakeClock();
    ClimateWriter.lastModes.clear();
  });
  afterEach(() => vi.useRealTimers());

  const make = (entity: string, state?: string) => {
    const states = climateStates();
    if (state) states[entity].state = state;
    const calls: { service: string; data: any }[] = [];
    const hass = makeHass(states, (_d, service, data) => void calls.push({ service, data }));
    const w = acquireWriter(entity);
    held.push(w);
    w.hass = hass;
    return { w, calls, hass };
  };
  const held: ReturnType<typeof acquireWriter>[] = [];
  afterEach(() => held.splice(0).forEach(releaseWriter));

  it('turns an off unit back on to the mode it was last seen in', async () => {
    const { w, calls, hass } = make('climate.slaapkamer_airco');
    w.observe(hass); // seen in cool
    hass.states['climate.slaapkamer_airco'] = { ...hass.states['climate.slaapkamer_airco'], state: 'off' };
    w.observe(hass);
    w.togglePower('off');
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toEqual([{ service: 'set_hvac_mode', data: { entity_id: 'climate.slaapkamer_airco', hvac_mode: 'cool' } }]);
  });

  it('keeps sent values as optimistic until the entity reports them', async () => {
    const { w, hass } = make('climate.keuken_airco');
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.local).toEqual({ temperature: 22 });
    hass.states['climate.keuken_airco'].attributes.temperature = 22;
    w.observe(hass);
    expect(w.local).toEqual({});
  });

  it('is one shared writer per entity, ref-counted, and sends pending changes when the last user leaves', async () => {
    const { calls, hass } = make('climate.keuken_airco');
    const seen: string[] = [];
    const a = new WriterLease(registry, () => seen.push('a'));
    const b = new WriterLease(registry, () => seen.push('b'));
    const wa = a.get('climate.keuken_airco');
    const wb = b.get('climate.keuken_airco');
    expect(wa).toBe(wb);
    expect(writerRefs('climate.keuken_airco')).toBe(3);
    wa.hass = hass;
    wa.set({ temperature: 22 });
    // Both cards hear about the change.
    expect(seen).toContain('a');
    expect(seen).toContain('b');
    expect(wb.queue.pending).toEqual({ temperature: 22 });
    a.release();
    await vi.advanceTimersByTimeAsync(0);
    // A card leaving sends what is pending, so nothing waits on a card that is gone.
    expect(calls).toEqual([{ service: 'set_temperature', data: { entity_id: 'climate.keuken_airco', temperature: 22 } }]);
    b.release();
    expect(writerRefs('climate.keuken_airco')).toBe(1);
  });
});

// ---- Core additions: hold expiry, errors, registry edges, injected reconciliation. ----

describe('entity writer', () => {
  beforeEach(() => {
    fakeClock();
  });
  afterEach(() => vi.useRealTimers());

  it('drops the held value when the hold expires, counted from the last send', async () => {
    const w = new ClimateWriter('climate.keuken_airco');
    w.hass = makeHass(climateStates());
    w.hold = 10;
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(5000);
    w.set({ fan_mode: '4' });
    await vi.advanceTimersByTimeAsync(1500);
    // Past 10 s after the first send (11.5 s): the second send at 8 s restarted the hold.
    await vi.advanceTimersByTimeAsync(4000);
    expect(w.local).toEqual({ temperature: 22, fan_mode: '4' });
    await vi.advanceTimersByTimeAsync(5999);
    expect(w.local).toEqual({ temperature: 22, fan_mode: '4' });
    await vi.advanceTimersByTimeAsync(1);
    expect(w.local).toEqual({});
    w.dispose();
  });

  it('shows the translated error when a call fails without a message, and clears it after 6 s', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = vi.fn((_h: unknown, key: string) => `T(${key})`);
    const w = new EntityWriter<LightPatch>('light.kitchen', { ...lightOptions(), t, errorKey: 'core.commandFailed' });
    const ha = new FakeLightHA('light.kitchen', 0);
    ha.fail = () => true;
    w.hass = ha.hass;
    w.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.error).toBe('T(core.commandFailed)');
    expect(w.local).toEqual({});
    expect(w.sending).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(w.error).toBeNull();
    errors.mockRestore();
    w.dispose();
  });

  it('calls the entity domain when a call names none', async () => {
    const w = new ClimateWriter('climate.keuken_airco');
    const domains: string[] = [];
    w.hass = makeHass(climateStates(), (d) => void domains.push(d));
    w.set({ temperature: 23 });
    void w.queue.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(domains).toEqual(['climate']);
    w.dispose();
  });

  it('drops a key the entity answered in its own way (water heater turn_on)', async () => {
    const id = 'water_heater.boiler';
    const states = { [id]: { entity_id: id, state: 'off', attributes: {} } };
    const w = new EntityWriter<{ hvac_mode?: string }>(id, {
      build: (c, e) => [{ service: 'turn_on', data: { entity_id: e.entity_id }, sets: { hvac_mode: c.hvac_mode } }],
      schedule: { policy: 'debounce', ms: 0 },
      stateOf: (e, key) => (key === 'hvac_mode' ? e.state : e.attributes[key]),
      answered: (e, key, from) => key === 'hvac_mode' && e.state !== from,
    });
    w.hass = makeHass(states);
    w.set({ hvac_mode: 'on' });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.local).toEqual({ hvac_mode: 'on' });
    w.observe(makeHass({ [id]: { ...states[id], state: 'eco' } }));
    expect(w.local).toEqual({});
    w.dispose();
  });

  it('a lease switches writers when its entity changes and releases the old one', () => {
    const lease = new WriterLease(registry, () => {});
    const a = lease.get('climate.keuken_airco');
    expect(lease.get('climate.keuken_airco')).toBe(a);
    lease.get('climate.slaapkamer_airco');
    expect(writerRefs('climate.keuken_airco')).toBe(0);
    expect(writerRefs('climate.slaapkamer_airco')).toBe(1);
    lease.release();
    expect(lease.current).toBeUndefined();
    expect(writerRefs('climate.slaapkamer_airco')).toBe(0);
  });

  it('releasing a writer the registry does not hold just disposes it', () => {
    const stray = new ClimateWriter('climate.keuken_airco');
    const dispose = vi.spyOn(stray, 'dispose');
    registry.release(stray);
    expect(dispose).toHaveBeenCalledOnce();
    expect(writerRefs('climate.keuken_airco')).toBe(0);
  });
});

// ---- Light writes under throttleWrites(300), against a fake HA. ----

const LIGHT = 'light.kitchen';

function lightRig(echoMs: number | null, extra: Partial<WriterOptions<LightPatch, WriteCall<LightPatch>>> = {}) {
  const ha = new FakeLightHA(LIGHT, echoMs); // starts at 50 %
  const w = new EntityWriter<LightPatch>(LIGHT, { ...lightOptions(300), ...extra });
  ha.onState = (h) => w.observe(h);
  w.hass = ha.hass;
  /** What the card shows: the held or pending value, else HA's. */
  const shown = () => w.local.brightness_pct ?? ha.pct;
  return { ha, w, shown };
}

describe('light writer with throttle', () => {
  beforeEach(() => {
    fakeClock();
  });
  afterEach(() => vi.useRealTimers());

  it('reconciles in percent: round(round(p * 2.55) / 2.55) = p for every percent', () => {
    for (let p = 0; p <= 100; p++) {
      expect(pctOf({ entity_id: LIGHT, state: 'on', attributes: { brightness: Math.round(p * 2.55) } })).toBe(p);
    }
  });

  it('reconciles in percent whatever rounding the integration uses: floor, ceil, Python half-even, p * 255 / 100', () => {
    // Python round(): half to even, on the exact double (JS and Python share IEEE 754 doubles).
    const halfEven = (x: number) => {
      const f = Math.floor(x);
      const d = x - f;
      return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
    };
    const roundings = { floor: Math.floor, ceil: Math.ceil, halfEven, round: Math.round };
    for (const [name, r] of Object.entries(roundings)) {
      for (let p = 0; p <= 100; p++) {
        for (const b of [r(p * 2.55), r((p * 255) / 100)]) {
          expect(pctOf({ entity_id: LIGHT, state: 'on', attributes: { brightness: b } }), `${name} ${p}`).toBe(p);
        }
      }
    }
    // Half-even really differs from Math.round on an exact half: 2.5 goes to 2.
    expect(halfEven(2.5)).toBe(2);
  });

  it('a return to the start value is not ended by the unchanged state, and stale echoes never show (slow HA)', async () => {
    const { ha, w, shown } = lightRig(2000); // starts at 50 %
    const trace: number[] = [];
    w.set({ brightness_pct: 60 }); // t 0
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 50 }); // t 300
    expect(ha.calls.map((c) => c.data.brightness_pct)).toEqual([60, 50]);
    // An unrelated hass update: the light still reports 50, which is not the echo of the send of 50.
    w.observe(ha.hass);
    trace.push(shown());
    expect(w.local).toEqual({ brightness_pct: 50 });
    await vi.advanceTimersByTimeAsync(1700); // echo 60 at 2000, stale
    expect(ha.pct).toBe(60);
    trace.push(shown());
    await vi.advanceTimersByTimeAsync(299);
    trace.push(shown());
    await vi.advanceTimersByTimeAsync(1); // echo 50 at 2300
    trace.push(shown());
    expect(trace).toEqual([50, 50, 50, 50]);
    expect(w.local).toEqual({});
  });

  it('a tolerant matcher ends the hold on 2702 K for 2700 K sent; exact matching holds until expiry', async () => {
    const tolerant = lightRig(0, { matches: kelvinMatches });
    tolerant.w.set({ color_temp_kelvin: 2700 });
    await vi.advanceTimersByTimeAsync(0);
    expect(tolerant.ha.hass.states[LIGHT].attributes.color_temp_kelvin).toBe(2702);
    expect(tolerant.w.local).toEqual({});
    const exact = lightRig(0);
    exact.w.set({ color_temp_kelvin: 2700 });
    await vi.advanceTimersByTimeAsync(0);
    expect(exact.w.local).toEqual({ color_temp_kelvin: 2700 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(exact.w.local).toEqual({});
  });

  it('assigning inflight from outside resets the send records', async () => {
    const { ha, w } = lightRig(2000);
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 50 });
    w.inflight = { brightness_pct: 50 };
    // Without records there is no start value to ignore: the light reporting 50 ends the hold.
    w.observe(ha.hass);
    expect(w.local).toEqual({});
  });

  it('slow HA (echo after 2 s): stale echoes never move the shown value back, the final echo ends the hold', async () => {
    const { ha, w, shown } = lightRig(2000);
    const trace: [number, number][] = [];
    const card = {};
    w.holdFor(card);
    w.set({ brightness_pct: 60 }); // t 0, sent
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 80 }); // sent at 300
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 90 }); // t 400
    w.endHoldFor(card); // release, sent at 400
    expect(ha.calls.map((c) => [c.at, c.data.brightness_pct])).toEqual([[0, 60], [300, 80], [400, 90]]);
    for (const t of [1999, 2000, 2300, 2399]) {
      await vi.advanceTimersByTimeAsync(t - Date.now());
      trace.push([t, shown()]);
    }
    expect(trace).toEqual([[1999, 90], [2000, 90], [2300, 90], [2399, 90]]);
    // HA has reported 60 and 80 by now, 90 is still held.
    expect(ha.pct).toBe(80);
    expect(w.local).toEqual({ brightness_pct: 90 });
    await vi.advanceTimersByTimeAsync(1);
    expect(ha.pct).toBe(90);
    expect(w.local).toEqual({});
    expect(shown()).toBe(90);
  });

  it('slow HA: going back to an earlier value is not ended by the echo of that earlier send', async () => {
    const { ha, w, shown } = lightRig(2000);
    w.set({ brightness_pct: 70 }); // t 0
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 30 }); // t 300
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 70 }); // t 600
    expect(ha.calls.map((c) => c.data.brightness_pct)).toEqual([70, 30, 70]);
    await vi.advanceTimersByTimeAsync(2000 - 600); // echo 70 (the first send)
    expect(shown()).toBe(70);
    await vi.advanceTimersByTimeAsync(300); // echo 30, stale
    expect(ha.pct).toBe(30);
    expect(shown()).toBe(70);
    await vi.advanceTimersByTimeAsync(300); // echo 70, the last send
    expect(w.local).toEqual({});
    expect(shown()).toBe(70);
  });

  it('HA that never reports: the sent value is held for write_hold, then HA state shows', async () => {
    const { w, shown } = lightRig(null);
    w.set({ brightness_pct: 75 });
    await vi.advanceTimersByTimeAsync(9999);
    expect(shown()).toBe(75);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.local).toEqual({});
    expect(shown()).toBe(50);
  });

  it('instant HA (demo light): every throttled write lands, the hold ends with each echo', async () => {
    const { ha, w, shown } = lightRig(0);
    const card = {};
    w.holdFor(card);
    for (let t = 0; t < 700; t += 16) {
      w.set({ brightness_pct: 51 + Math.round(t / 16) });
      await vi.advanceTimersByTimeAsync(16);
    }
    w.endHoldFor(card);
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.at)).toEqual([0, 300, 600, 704]);
    expect(ha.pct).toBe(94);
    expect(w.local).toEqual({});
    expect(shown()).toBe(94);
  });

  it('release at 0 % turns the light off and holds 0 until HA reports off', async () => {
    const { ha, w, shown } = lightRig(2000);
    const card = {};
    w.holdFor(card);
    w.set({ brightness_pct: 20 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(500);
    expect(ha.calls).toHaveLength(1);
    expect(shown()).toBe(0);
    w.endHoldFor(card);
    expect(ha.calls[1]).toMatchObject({ at: 600, service: 'turn_off', data: { entity_id: LIGHT } });
    await vi.advanceTimersByTimeAsync(2000); // echo 20 at 2000, stale
    expect(shown()).toBe(0);
    await vi.advanceTimersByTimeAsync(600); // echo off at 2600
    expect(w.local).toEqual({});
    expect(shown()).toBe(0);
  });

  it('stays sending until every overlapping send has resolved (debounce does not serialise)', async () => {
    const { w } = lightRig(0);
    w.schedule = debounceWrites(0);
    const done: (() => void)[] = [];
    w.hass = makeHass(w.hass!.states, () => new Promise<void>((r) => done.push(r)));
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 70 });
    expect(done).toHaveLength(2);
    done[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.sending).toBe(true);
    done[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.sending).toBe(false);
  });

  it('reconciles an hs_color sent as integers against the floats HA reports', async () => {
    const { ha, w } = lightRig(0);
    w.set({ hs_color: [200, 60] });
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls[0].data).toEqual({ entity_id: LIGHT, hs_color: [200, 60] });
    expect(w.local).toEqual({});
  });
});

describe('writer errors and shared use', () => {
  beforeEach(() => fakeClock());
  afterEach(() => vi.useRealTimers());

  it('dispose during a throttled send still sends the pending change when it resolves, and starts no timer', async () => {
    const done: (() => void)[] = [];
    const sent: unknown[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, lightOptions());
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, (_d, _s, data) => {
      sent.push(data.brightness_pct);
      return new Promise<void>((r) => done.push(r));
    });
    w.set({ brightness_pct: 60 });
    w.set({ brightness_pct: 70 });
    w.dispose();
    expect(sent).toEqual([60]);
    done[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([60, 70]);
    // Only the send timeout of the call still in flight; no hold timer.
    expect(vi.getTimerCount()).toBe(1);
    done[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(w.inflight).toEqual({});
  });

  it('dispose during a throttled send sends a return to the entity value (in-flight baseline kept until idle)', async () => {
    const done: (() => void)[] = [];
    const sent: unknown[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, lightOptions());
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, (_d, _s, data) => {
      sent.push(data.brightness_pct);
      return new Promise<void>((r) => done.push(r));
    });
    w.set({ brightness_pct: 60 }); // in flight; the light still reports 50
    w.set({ brightness_pct: 50 });
    w.dispose();
    done[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([60, 50]);
    done[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.inflight).toEqual({});
  });

  it('hold expiry while a throttled send is in flight keeps the baseline the queue builds against', async () => {
    const errors = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent: unknown[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, { ...lightOptions(), hold: 2 });
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, (_d, _s, data) => {
      sent.push(data.brightness_pct);
      return new Promise<void>(() => {}); // HA never answers
    });
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 50 });
    // At 2 s the hold expires, then the send timeout lets the next write go: 50 is still a change against 60.
    await vi.advanceTimersByTimeAsync(1900);
    expect(sent).toEqual([60, 50]);
    errors.mockRestore();
  });

  it('a throttled send that never resolves counts as resolved after the hold time, logged once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent: unknown[] = [];
    const late: (() => void)[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, lightOptions());
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, (_d, _s, data) => {
      sent.push(data.brightness_pct);
      return new Promise<void>((r) => late.push(r));
    });
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(500);
    w.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(9499);
    expect(sent).toEqual([60]);
    expect(w.queue.isBusy).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([60, 70]);
    expect(warn).toHaveBeenCalledOnce();
    // The late answer of the first send does not end the second one.
    late[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.queue.isBusy).toBe(true);
    late[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.queue.isBusy).toBe(false);
    warn.mockRestore();
    w.dispose();
  });

  it('a failed newer send drops only its own value: 60 landed, 70 fails, the card shows 60', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ha, w, shown } = lightRig(2000); // starts at 50 %
    ha.fail = (data) => data.brightness_pct === 70;
    w.set({ brightness_pct: 60 }); // lands, echo at 2000
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 70 }); // fails
    await vi.advanceTimersByTimeAsync(0);
    expect(w.error).not.toBeNull();
    expect(w.local).toEqual({ brightness_pct: 60 });
    expect(shown()).toBe(60);
    await vi.advanceTimersByTimeAsync(1700); // echo 60
    expect(w.local).toEqual({});
    expect(shown()).toBe(60);
    errors.mockRestore();
    w.dispose();
  });

  it('a partial failure in one climate flush keeps the call that landed held (set_hvac_mode ok, set_temperature fails)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = new ClimateWriter('climate.keuken_airco');
    const calls: string[] = [];
    w.hass = makeHass(climateStates(), (_d, service) => {
      calls.push(service);
      if (service === 'set_temperature') return Promise.reject(new Error('rejected'));
    });
    w.set({ hvac_mode: 'cool', temperature: 23 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toEqual(['set_hvac_mode', 'set_temperature']);
    expect(w.error).toBe('rejected');
    expect(w.local).toEqual({ hvac_mode: 'cool' });
    errors.mockRestore();
    w.dispose();
  });

  it('a call failing after dispose leaves no error and no timer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = new EntityWriter<LightPatch>(LIGHT, lightOptions());
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, () =>
      new Promise((_r, reject) => setTimeout(() => reject(new Error('')), 500)),
    );
    w.set({ brightness_pct: 70 });
    w.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(w.error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    errors.mockRestore();
  });

  it('a failed call drops only its own values; the hold of the others keeps running', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ha, w } = lightRig(null);
    ha.fail = (data) => data.hs_color !== undefined;
    w.set({ brightness_pct: 70 }); // t 0, lands
    await vi.advanceTimersByTimeAsync(300);
    w.set({ hs_color: [120, 50] }); // t 300, fails
    await vi.advanceTimersByTimeAsync(0);
    expect(w.error).toBe('Command failed');
    expect(w.local).toEqual({ brightness_pct: 70 });
    // The hold restarted with the send at 300 and still expires: 10 s later.
    await vi.advanceTimersByTimeAsync(9999);
    expect(w.local).toEqual({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(1);
    expect(w.local).toEqual({});
    w.dispose();
    errors.mockRestore();
  });

  it('a failed call that leaves nothing in flight also stops the hold timer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ha, w } = lightRig(null);
    ha.fail = () => true;
    w.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.local).toEqual({});
    // Only the 6 s error timer is left.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(w.error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    errors.mockRestore();
  });

  it('a card leaving mid-drag of another card sends no turn_off and keeps the drag hold (throttle)', async () => {
    const ha = new FakeLightHA(LIGHT, 0);
    const lights = new WriterRegistry((id) => new EntityWriter<LightPatch>(id, lightOptions()));
    const tile = new WriterLease(lights, () => {});
    const sheet = new WriterLease(lights, () => {});
    const w = sheet.get(LIGHT);
    tile.get(LIGHT);
    w.hass = ha.hass;
    sheet.hold(); // the sheet's drag
    w.set({ brightness_pct: 20 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 0 });
    tile.release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on']);
    expect(w.queue.isHeld).toBe(true);
    expect(w.queue.pending).toEqual({ brightness_pct: 0 });
    // The sheet's drag ends (or the sheet goes too): now it turns off.
    sheet.release();
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on', 'turn_off']);
  });

  it('a card leaving mid-drag of another card sends the pending change but keeps the drag hold (debounce)', async () => {
    const states = climateStates();
    const calls: string[] = [];
    const climates = new WriterRegistry((id) => new ClimateWriter(id));
    const tile = new WriterLease(climates, () => {});
    const sheet = new WriterLease(climates, () => {});
    const w = sheet.get('climate.keuken_airco');
    tile.get('climate.keuken_airco');
    w.hass = makeHass(states, (_d, service) => void calls.push(service));
    sheet.hold();
    w.set({ temperature: 22 });
    tile.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['set_temperature']);
    expect(w.queue.isHeld).toBe(true);
    // Still held: the next drag value waits for release, then the debounce delay.
    w.set({ temperature: 23 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
    sheet.release();
    expect(calls).toEqual(['set_temperature', 'set_temperature']);
  });

  it('the dragging card leaving first ends its hold: turn_off at 0 goes out (throttle)', async () => {
    const ha = new FakeLightHA(LIGHT, 0);
    const lights = new WriterRegistry((id) => new EntityWriter<LightPatch>(id, lightOptions()));
    const tile = new WriterLease(lights, () => {});
    const sheet = new WriterLease(lights, () => {});
    const w = sheet.get(LIGHT);
    tile.get(LIGHT);
    w.hass = ha.hass;
    sheet.hold();
    w.set({ brightness_pct: 20 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 0 });
    sheet.release(); // the sheet closes mid-drag; the tile stays
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on', 'turn_off']);
    expect(w.queue.isHeld).toBe(false);
    // The tile's writes are not stuck behind a hold nobody owns.
    await vi.advanceTimersByTimeAsync(1000);
    w.set({ brightness_pct: 40 });
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on', 'turn_off', 'turn_on']);
    tile.release();
  });

  it('the dragging card leaving first ends its hold: the debounced value goes out at once (debounce)', async () => {
    const calls: string[] = [];
    const climates = new WriterRegistry((id) => new ClimateWriter(id));
    const tile = new WriterLease(climates, () => {});
    const dial = new WriterLease(climates, () => {});
    const w = dial.get('climate.keuken_airco');
    tile.get('climate.keuken_airco');
    w.hass = makeHass(climateStates(), (_d, service) => void calls.push(service));
    dial.hold();
    w.set({ temperature: 23 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([]);
    dial.release(); // the dial disconnects mid-drag
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['set_temperature']);
    expect(w.queue.isHeld).toBe(false);
    tile.release();
  });

  it('with two holders, the queue stays held until the last one lets go', async () => {
    const ha = new FakeLightHA(LIGHT, 0);
    const lights = new WriterRegistry((id) => new EntityWriter<LightPatch>(id, lightOptions()));
    const tile = new WriterLease(lights, () => {});
    const sheet = new WriterLease(lights, () => {});
    const w = sheet.get(LIGHT);
    tile.get(LIGHT);
    w.hass = ha.hass;
    tile.hold(); // a held arrow key on the tile
    sheet.hold(); // and a drag in the sheet
    w.set({ brightness_pct: 0 });
    sheet.release();
    expect(ha.calls).toEqual([]);
    expect(w.queue.isHeld).toBe(true);
    tile.endHold();
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_off']);
    tile.release();
  });

  it('endHold of a card that does not hold leaves the other card\'s hold alone', () => {
    const lights = new WriterRegistry((id) => new EntityWriter<LightPatch>(id, lightOptions()));
    const tile = new WriterLease(lights, () => {});
    const sheet = new WriterLease(lights, () => {});
    const w = sheet.get(LIGHT);
    tile.get(LIGHT);
    sheet.hold();
    tile.endHold();
    expect(w.queue.isHeld).toBe(true);
    sheet.endHold();
    expect(w.queue.isHeld).toBe(false);
    tile.release();
    sheet.release();
  });

  it('a card leaving sends the pending change no sooner than the throttle window allows', async () => {
    const ha = new FakeLightHA(LIGHT, 0);
    const lights = new WriterRegistry((id) => new EntityWriter<LightPatch>(id, lightOptions()));
    const tile = new WriterLease(lights, () => {});
    const sheet = new WriterLease(lights, () => {});
    const w = sheet.get(LIGHT);
    tile.get(LIGHT);
    w.hass = ha.hass;
    w.set({ brightness_pct: 60 }); // t 0
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 61 }); // armed for 300
    await vi.advanceTimersByTimeAsync(50);
    tile.release(); // t 150
    expect(ha.calls.map((c) => c.at)).toEqual([0]);
    await vi.advanceTimersByTimeAsync(150);
    expect(ha.calls.map((c) => [c.at, c.data.brightness_pct])).toEqual([[0, 60], [300, 61]]);
    sheet.release();
  });

  it('a send after a hold expiry while busy starts a fresh hold that the idle queue keeps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done: (() => void)[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, { ...lightOptions(), hold: 2 });
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, () =>
      new Promise<void>((r) => done.push(r)),
    );
    w.set({ brightness_pct: 60 }); // in flight, never answered
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 70 });
    // 2 s: the hold expires while busy (cleared on idle), then the send timeout sends 70: a fresh hold.
    await vi.advanceTimersByTimeAsync(1900);
    expect(done).toHaveLength(2);
    done[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.queue.isBusy).toBe(false);
    expect(w.local).toEqual({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.local).toEqual({});
    warn.mockRestore();
    w.dispose();
  });

  it('a failure removes the newest matching value: 60, 70, 60 with the last 60 failing shows 70', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ha, w, shown } = lightRig(2000); // starts at 50 %
    let n = 0;
    ha.fail = () => ++n === 3;
    w.set({ brightness_pct: 60 }); // t 0
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 70 }); // t 300
    await vi.advanceTimersByTimeAsync(300);
    w.set({ brightness_pct: 60 }); // t 600, fails
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.data.brightness_pct)).toEqual([60, 70, 60]);
    expect(w.error).not.toBeNull();
    expect(shown()).toBe(70);
    await vi.advanceTimersByTimeAsync(1400); // echo 60 at 2000: 70 still held
    expect(shown()).toBe(70);
    await vi.advanceTimersByTimeAsync(300); // echo 70 at 2300
    expect(w.local).toEqual({});
    errors.mockRestore();
    w.dispose();
  });

  it('the send timeout is never shorter than 1 s, even with a short hold', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent: unknown[] = [];
    const w = new EntityWriter<LightPatch>(LIGHT, { ...lightOptions(), hold: 0.2 });
    w.hass = makeHass({ [LIGHT]: { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } } }, (_d, _s, data) => {
      sent.push(data.brightness_pct);
      return new Promise<void>(() => {});
    });
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(899);
    expect(sent).toEqual([60]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([60, 70]);
    warn.mockRestore();
  });
});

// ---- discard (CR-3): a room header power call cancels a trailing throttled step. ----

describe('EntityWriter.discard', () => {
  beforeEach(() => {
    fakeClock();
  });
  afterEach(() => vi.useRealTimers());

  it('drops the trailing throttled step, so it cannot turn the light back on', async () => {
    const { ha, w } = lightRig(0);
    w.set({ brightness_pct: 60 }); // leading write at once
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 70 }); // trailing, due at 300
    expect(w.queue.isPending).toBe(true);
    w.discard();
    // The room header turns the light off through another path.
    await ha.hass.callService('light', 'turn_off', { entity_id: LIGHT });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls.map((c) => c.service + ':' + (c.data.brightness_pct ?? ''))).toEqual(['turn_on:60', 'turn_off:']);
    expect(w.queue.isPending).toBe(false);
    expect(w.local).toEqual({});
    expect(ha.pct).toBe(0);
  });

  it('drops held values at once, and the hold expiry timer with them', async () => {
    const { w } = lightRig(null); // HA never reports: the value would stay held for 10 s
    w.set({ brightness_pct: 40 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.local).toEqual({ brightness_pct: 40 });
    const seen = vi.fn();
    w.subscribe(seen);
    w.discard();
    expect(w.local).toEqual({});
    expect(seen).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0); // the 10 s hold expiry is gone too
  });

  it('a send already issued still lands; nothing follows it when it resolves', async () => {
    const { ha, w } = lightRig(0);
    let resolve!: () => void;
    const slow = new Promise<void>((r) => (resolve = r));
    const hass = ha.hass;
    const call = hass.callService;
    w.hass = { ...hass, callService: async (...a: Parameters<typeof call>) => (await call(...a), slow) } as typeof hass;
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(0);
    w.set({ brightness_pct: 80 }); // coalesces behind the busy send
    w.discard();
    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls.map((c) => c.data.brightness_pct)).toEqual([60]);
  });

  it('a drag that still holds the queue keeps its hold', async () => {
    const { ha, w } = lightRig(0);
    const owner = {};
    w.holdFor(owner);
    w.set({ brightness_pct: 0 }); // turn_off waits for release while held
    w.discard();
    expect(w.queue.isHeld).toBe(true);
    w.set({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(500);
    expect(ha.calls).toEqual([]);
    w.endHoldFor(owner);
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_off']);
  });
});

// ---- sendNow: discrete actions (power, toggle) go out at once. ----

describe('EntityWriter.sendNow', () => {
  beforeEach(() => {
    fakeClock();
  });
  afterEach(() => vi.useRealTimers());

  it('sends at once inside the throttle window and starts a new window', async () => {
    const { ha, w } = lightRig(0);
    w.set({ brightness_pct: 60 }); // leading, t 0
    await vi.advanceTimersByTimeAsync(100);
    w.sendNow({ brightness_pct: 0 }); // t 100: no wait for the window
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => [c.at, c.service])).toEqual([
      [0, 'turn_on'],
      [100, 'turn_off'],
    ]);
    await vi.advanceTimersByTimeAsync(50);
    w.set({ brightness_pct: 40 }); // t 150: the window now runs from 100, so this goes at 400, not 300
    await vi.advanceTimersByTimeAsync(400);
    expect(ha.calls.map((c) => c.at)).toEqual([0, 100, 400]);
  });

  it('takes a pending step along, so a trailing step cannot follow it', async () => {
    const { ha, w } = lightRig(0);
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(100);
    w.set({ brightness_pct: 70 }); // trailing, due at 300
    w.sendNow({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls.map((c) => c.service + ':' + (c.data.brightness_pct ?? ''))).toEqual(['turn_on:60', 'turn_off:']);
  });

  it('is deduped against what HA has: no call for the current value', async () => {
    const { ha, w } = lightRig(0); // at 50 %
    w.sendNow({ brightness_pct: 50 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls).toEqual([]);
  });

  it('waits for a throttled send in flight, then goes out at once', async () => {
    const { ha, w } = lightRig(0);
    let resolve!: () => void;
    const slow = new Promise<void>((r) => (resolve = r));
    const hass = ha.hass;
    const call = hass.callService;
    let first = true;
    w.hass = {
      ...hass,
      callService: async (...a: Parameters<typeof call>) => {
        await call(...a);
        if (first) {
          first = false;
          await slow;
        }
      },
    } as typeof hass;
    w.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(0);
    w.sendNow({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on']); // no overlap
    vi.setSystemTime(5000);
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_on', 'turn_off']);
  });

  it('exception: under throttle while a drag holds, a sendOnRelease change (turn_off at 0) waits for the release', async () => {
    const { ha, w } = lightRig(0);
    const owner = {};
    w.holdFor(owner);
    w.sendNow({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls).toEqual([]);
    w.endHoldFor(owner);
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.service)).toEqual(['turn_off']);
  });

  it('under debounce it skips the delay too', async () => {
    const { ha, w } = lightRig(0, { schedule: debounceWrites(1500) });
    w.sendNow({ brightness_pct: 20 });
    await vi.advanceTimersByTimeAsync(0);
    expect(ha.calls.map((c) => c.data.brightness_pct)).toEqual([20]);
  });
});

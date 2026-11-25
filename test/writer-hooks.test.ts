import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityWriter } from '../src/writer';
import type { HassEntity } from '../src/types';
import { climateOptions, climateStates, fakeClock, makeHass, type Optimistic } from './fixtures/writes';

// The protected extension points of EntityWriter (0.3.0): reconcile, rollback, sendStarted and sendSettled, the
// protected state they read, and WriterOptions.logLabel. Overrides in the shape Liquid Climate Patch B uses to keep
// its 0.12.0 writer semantics; the default path is asserted unchanged.

const ID = 'climate.keuken_airco';

/** Liquid Climate 0.12.0 stale echo: a key goes once the entity reports the held value (strict), or answered it. */
class StrictWriter extends EntityWriter<Optimistic> {
  protected override reconcile(s: HassEntity): void {
    const next = { ...this._inflight } as Record<string, unknown>;
    for (const [key, value] of Object.entries(next)) {
      const from = this.sent.get(key)?.from;
      if (this.stateOf(s, key) === value || (from !== undefined && this.opts.answered?.(s, key, from))) delete next[key];
    }
    this._inflight = next as Optimistic;
  }
}

/** Liquid Climate 0.12.0 failure: every held value goes, the hold timer keeps running. */
class DropAllWriter extends EntityWriter<Optimistic> {
  failed: Record<string, unknown>[][] = [];
  errorAtRollback: (string | null)[] = [];

  protected override rollback(failed: Record<string, unknown>[]): void {
    this.failed.push(failed);
    this.errorAtRollback.push(this.error);
    this.inflight = {};
  }
}

/** Liquid Climate 0.12.0 `sending`: its own flag, set and cleared by the send hooks (each calls super). */
class FlagWriter extends EntityWriter<Optimistic> {
  events: string[] = [];
  private _sending = false;

  override get sending(): boolean {
    return this._sending;
  }

  protected override sendStarted(): void {
    super.sendStarted();
    this._sending = true;
    this.events.push(`started:${this.active}`);
  }

  protected override sendSettled(): void {
    super.sendSettled();
    this._sending = false;
    this.events.push(`settled:${this.active}`);
  }
}

/** Every hook overridden with only a super call, counted: must behave exactly as the base writer. */
class PassThroughWriter extends EntityWriter<Optimistic> {
  counts = { reconcile: 0, rollback: 0, sendStarted: 0, sendSettled: 0 };
  failed: Record<string, unknown>[][] = [];

  protected override reconcile(s: HassEntity): void {
    this.counts.reconcile++;
    super.reconcile(s);
  }

  protected override rollback(failed: Record<string, unknown>[]): void {
    this.counts.rollback++;
    this.failed.push(failed.map((f) => ({ ...f })));
    super.rollback(failed);
  }

  protected override sendStarted(): void {
    this.counts.sendStarted++;
    super.sendStarted();
  }

  protected override sendSettled(): void {
    this.counts.sendSettled++;
    super.sendSettled();
  }
}

/**
 * Partial failure (set_hvac_mode lands, set_temperature fails), a return to the start value (heat, cool, heat) with
 * an unchanged report, a stale cool echo, then the heat echo and the hold expiring. Returns calls and snapshots.
 */
async function scenario(w: EntityWriter<Optimistic>): Promise<unknown[]> {
  const trace: unknown[] = [];
  const states = climateStates();
  const hass = makeHass(states, (_d, service, data) => {
    trace.push([service, data]);
    if (service === 'set_temperature') return Promise.reject(new Error('rejected'));
  });
  w.hass = hass;
  const snap = (tag: string) => trace.push([tag, { ...w.local }, w.error, w.sending, vi.getTimerCount()]);
  w.set({ hvac_mode: 'cool', temperature: 23 });
  await vi.advanceTimersByTimeAsync(1500);
  snap('partial failure');
  w.observe(hass);
  snap('report unchanged');
  w.set({ hvac_mode: 'heat' });
  await vi.advanceTimersByTimeAsync(1500);
  w.observe(hass);
  snap('back to heat, entity still heat');
  states[ID] = { ...states[ID], state: 'cool' };
  w.observe(hass);
  snap('stale cool echo');
  states[ID] = { ...states[ID], state: 'heat' };
  w.observe(hass);
  snap('heat echo');
  await vi.advanceTimersByTimeAsync(10_000);
  snap('after hold and error');
  return trace;
}

/** The default trace, written out: the base writer as in 0.2.0. */
const DEFAULT_TRACE = [
  ['set_hvac_mode', { entity_id: ID, hvac_mode: 'cool' }],
  ['set_temperature', { entity_id: ID, temperature: 23 }],
  // The landed call stays held; hold timer and error timer run.
  ['partial failure', { hvac_mode: 'cool' }, 'rejected', false, 2],
  ['report unchanged', { hvac_mode: 'cool' }, 'rejected', false, 2],
  ['set_hvac_mode', { entity_id: ID, hvac_mode: 'heat' }],
  // A report that leaves the key unchanged since the send ends nothing (header note 1).
  ['back to heat, entity still heat', { hvac_mode: 'heat' }, 'rejected', false, 2],
  ['stale cool echo', { hvac_mode: 'heat' }, 'rejected', false, 2],
  ['heat echo', {}, 'rejected', false, 2],
  ['after hold and error', {}, null, false, 0],
];

describe('EntityWriter hooks: default path', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fakeClock();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errors.mockRestore();
    vi.useRealTimers();
  });

  it('the base writer behaves as in 0.2.0', async () => {
    const w = new EntityWriter<Optimistic>(ID, climateOptions);
    expect(await scenario(w)).toEqual(DEFAULT_TRACE);
    w.dispose();
  });

  it('overriding every hook with a super call changes nothing, and each hook runs where documented', async () => {
    const w = new PassThroughWriter(ID, climateOptions);
    expect(await scenario(w)).toEqual(DEFAULT_TRACE);
    // observe ran 4 times, always with values in flight.
    expect(w.counts).toEqual({ reconcile: 4, rollback: 1, sendStarted: 2, sendSettled: 2 });
    // The failed call and the ones after it, in patch terms.
    expect(w.failed).toEqual([[{ temperature: 23 }]]);
    w.dispose();
  });

  it('observe keeps its guard: no reconcile without an entity or without values in flight', async () => {
    const w = new PassThroughWriter(ID, climateOptions);
    const hass = makeHass(climateStates());
    w.observe(hass);
    w.observe(makeHass({}));
    expect(w.counts.reconcile).toBe(0);
    w.hass = hass;
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    w.observe(makeHass({}));
    expect(w.counts.reconcile).toBe(0);
    w.observe(hass);
    expect(w.counts.reconcile).toBe(1);
    w.dispose();
  });

  it('no rollback for a call failing after dispose; the send still settles', async () => {
    const w = new PassThroughWriter(ID, climateOptions);
    w.hass = makeHass(climateStates(), () => new Promise((_r, reject) => setTimeout(() => reject(new Error('late')), 500)));
    w.set({ temperature: 22 });
    w.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(w.counts).toEqual({ reconcile: 0, rollback: 0, sendStarted: 1, sendSettled: 1 });
    expect(w.error).toBeNull();
  });

  it('sending and changed() order of the base writer', async () => {
    const w = new EntityWriter<Optimistic>(ID, climateOptions);
    let answer!: () => void;
    w.hass = makeHass(climateStates(), () => new Promise<void>((r) => (answer = r)));
    const seen: string[] = [];
    w.subscribe(() => seen.push(`changed:${w.sending}`));
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.sending).toBe(true);
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.sending).toBe(false);
    expect(seen).toEqual(['changed:false', 'changed:true', 'changed:false', 'changed:false']);
    w.dispose();
  });
});

describe('EntityWriter hooks: overrides', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fakeClock();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errors.mockRestore();
    vi.useRealTimers();
  });

  it('reconcile: a strict rule drops a return to the start value at once, where the default holds it', async () => {
    const run = async (w: EntityWriter<Optimistic>) => {
      const hass = makeHass(climateStates());
      w.hass = hass;
      w.set({ hvac_mode: 'cool' });
      await vi.advanceTimersByTimeAsync(1500);
      w.set({ hvac_mode: 'heat' });
      await vi.advanceTimersByTimeAsync(1500);
      w.observe(hass); // still heat
      const local = { ...w.local };
      w.dispose();
      return local;
    };
    expect(await run(new StrictWriter(ID, climateOptions))).toEqual({});
    expect(await run(new EntityWriter<Optimistic>(ID, climateOptions))).toEqual({ hvac_mode: 'heat' });
  });

  it('reconcile: the override reads opts.answered with the recorded sentFrom state', async () => {
    const answered = vi.fn((s: HassEntity, key: string, from: string) => key === 'hvac_mode' && s.state !== from);
    const w = new StrictWriter(ID, { ...climateOptions, answered });
    const states = climateStates();
    const hass = makeHass(states);
    w.hass = hass;
    w.set({ hvac_mode: 'cool' });
    await vi.advanceTimersByTimeAsync(1500);
    states[ID] = { ...states[ID], state: 'dry' };
    w.observe(hass);
    expect(answered).toHaveBeenCalledWith(states[ID], 'hvac_mode', 'heat');
    expect(w.local).toEqual({});
    w.dispose();
  });

  it('rollback: gets the failed sets before the error is set; dropping everything keeps the hold timer', async () => {
    const make = (w: EntityWriter<Optimistic>) => {
      w.hass = makeHass(climateStates(), (_d, service) => {
        if (service === 'set_temperature') return Promise.reject(new Error('rejected'));
      });
      w.set({ hvac_mode: 'cool', temperature: 23 });
      return w;
    };
    const hooked = make(new DropAllWriter(ID, climateOptions)) as DropAllWriter;
    await vi.advanceTimersByTimeAsync(1500);
    expect(hooked.failed).toEqual([[{ temperature: 23 }]]);
    expect(hooked.errorAtRollback).toEqual([null]);
    expect(hooked.error).toBe('rejected');
    expect(hooked.local).toEqual({});
    // Hold timer (not cleared by the override) and error timer.
    expect(vi.getTimerCount()).toBe(2);
    hooked.dispose();
    vi.clearAllTimers();

    const plain = make(new EntityWriter<Optimistic>(ID, climateOptions));
    await vi.advanceTimersByTimeAsync(1500);
    expect(plain.local).toEqual({ hvac_mode: 'cool' });
    plain.dispose();
  });

  it('sendStarted / sendSettled: an overridden sending getter follows its own flag, the base count still runs', async () => {
    const w = new FlagWriter(ID, climateOptions);
    let answer!: () => void;
    w.hass = makeHass(climateStates(), () => new Promise<void>((r) => (answer = r)));
    const seen: string[] = [];
    w.subscribe(() => seen.push(`changed:${w.sending}`));
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.sending).toBe(true);
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.sending).toBe(false);
    // Each hook runs before its changed(), so cards re-render with the new flag.
    expect([...w.events, ...seen]).toEqual(['started:1', 'settled:0', 'changed:false', 'changed:true', 'changed:false', 'changed:false']);
    w.dispose();
  });

  it('sendSettled runs for a failed send too', async () => {
    const w = new FlagWriter(ID, climateOptions);
    w.hass = makeHass(climateStates(), () => Promise.reject(new Error('no')));
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.events).toEqual(['started:1', 'settled:0']);
    expect(w.sending).toBe(false);
    expect(w.error).toBe('no');
    w.dispose();
  });
});

describe('WriterOptions.logLabel', () => {
  beforeEach(() => fakeClock());
  afterEach(() => vi.useRealTimers());

  const fail = async (label?: string) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('rejected');
    const w = new EntityWriter<Optimistic>(ID, { ...climateOptions, ...(label === undefined ? {} : { logLabel: label }) });
    w.hass = makeHass(climateStates(), () => Promise.reject(err));
    w.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    const calls = errors.mock.calls.map((c) => [...c]);
    errors.mockRestore();
    w.dispose();
    return { calls, err };
  };

  it('defaults to liquid-core', async () => {
    const { calls, err } = await fail();
    expect(calls).toEqual([['liquid-core: service call failed', err]]);
  });

  it('prefixes the service-call-failed error with the given label', async () => {
    const { calls, err } = await fail('Liquid Climate');
    expect(calls).toEqual([['Liquid Climate: service call failed', err]]);
  });
});

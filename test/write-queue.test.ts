import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteQueue, debounceWrites, throttleWrites, type WriteCall, type WriteSchedule } from '../src/write-queue';
import type { HassEntity } from '../src/types';
import { buildCalls, climateStates, fakeClock, lightBuild, type LightPatch, type Optimistic } from './fixtures/writes';

const ID = 'climate.keuken_airco';
const entity = () => climateStates()[ID];

function makeQueue(delay = 1.5, baseline: () => Optimistic = () => ({}), entityFn: () => HassEntity = entity) {
  const sent: Omit<WriteCall, 'sets'>[][] = [];
  const q = new WriteQueue<Optimistic>({
    send: (calls) => {
      sent.push(calls);
    },
    build: (change, e, base) => buildCalls(ID, change, e, base),
    schedule: () => debounceWrites(delay * 1000),
    getEntity: entityFn,
    getBaseline: baseline,
  });
  return { q, sent };
}

// ---- Copied from Liquid Climate 0.11.1 test/write-queue.test.ts, bodies unchanged, under debounce. ----

describe('WriteQueue with an in-flight baseline', () => {
  beforeEach(() => fakeClock());
  afterEach(() => vi.useRealTimers());

  it('flushes cool, then a setpoint made before the entity caught up, as two batches', async () => {
    const off = { ...entity(), state: 'off' };
    let inflight: Optimistic = {};
    const { q, sent } = makeQueue(1.5, () => inflight, () => off);
    q.onFlushed = (c) => (inflight = { ...inflight, ...c });
    q.set({ hvac_mode: 'cool' });
    await vi.advanceTimersByTimeAsync(1500);
    q.set({ temperature: 22 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent.map((c) => c.map((x) => x.service))).toEqual([['set_hvac_mode'], ['set_temperature']]);
  });

  it('does not report no-op changes as sent', async () => {
    const { q } = makeQueue();
    const flushed: unknown[] = [];
    q.onFlushed = (c) => flushed.push(c);
    q.set({ temperature: 19.5 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(flushed).toEqual([]);
  });

  it('cancel also clears a hold, so the next interaction is sent', async () => {
    const { q, sent } = makeQueue();
    q.hold();
    q.set({ temperature: 24 });
    q.cancel();
    q.set({ temperature: 23 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent).toHaveLength(1);
  });
});

describe('WriteQueue debounce', () => {
  beforeEach(() => fakeClock());
  afterEach(() => vi.useRealTimers());

  it('sends nothing before the delay and one call after it', async () => {
    const { q, sent } = makeQueue();
    q.set({ temperature: 21 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(sent).toEqual([]);
    expect(q.isPending).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([[{ service: 'set_temperature', data: { entity_id: ID, temperature: 21 } }]]);
    expect(q.isPending).toBe(false);
  });

  it('restarts the timer on every interaction and coalesces a drag into one call', async () => {
    const { q, sent } = makeQueue();
    for (const t of [20, 20.5, 21, 21.5, 22]) {
      q.set({ temperature: t });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([{ service: 'set_temperature', data: { entity_id: ID, temperature: 22 } }]);
  });

  it('merges different controls into the minimum set of calls', async () => {
    const { q, sent } = makeQueue();
    q.set({ hvac_mode: 'cool' });
    await vi.advanceTimersByTimeAsync(400);
    q.set({ temperature: 23 });
    q.set({ temperature: 22.5 });
    await vi.advanceTimersByTimeAsync(400);
    q.set({ fan_mode: '5' });
    q.set({ fan_mode: '3' });
    q.set({ preset_mode: 'boost' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      { service: 'set_hvac_mode', data: { entity_id: ID, hvac_mode: 'cool' } },
      { service: 'set_temperature', data: { entity_id: ID, temperature: 22.5 } },
      { service: 'set_fan_mode', data: { entity_id: ID, fan_mode: '3' } },
      { service: 'set_preset_mode', data: { entity_id: ID, preset_mode: 'boost' } },
    ]);
  });

  it('sends nothing when the user ends back on the original value', async () => {
    const { q, sent } = makeQueue();
    q.set({ temperature: 22 });
    q.set({ temperature: 19.5 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent).toEqual([]);
  });

  it('sends a second batch for interactions after the first flush', async () => {
    const { q, sent } = makeQueue();
    q.set({ temperature: 21 });
    await vi.advanceTimersByTimeAsync(1500);
    q.set({ fan_mode: '1' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent.map((c) => c.map((x) => x.service))).toEqual([['set_temperature'], ['set_fan_mode']]);
  });

  it('writes immediately with a delay of zero', async () => {
    const { q, sent } = makeQueue(0);
    q.set({ fan_mode: '5' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([[{ service: 'set_fan_mode', data: { entity_id: ID, fan_mode: '5' } }]]);
  });

  it('reports the flushed change and bumps the generation per interaction', async () => {
    const { q } = makeQueue();
    const flushed: unknown[] = [];
    q.onFlushed = (c) => flushed.push(c);
    q.set({ temperature: 21 });
    q.set({ temperature: 22 });
    expect(q.generation).toBe(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(flushed).toEqual([{ temperature: 22 }]);
  });

  it('holds the timer during a drag and counts the delay from release', async () => {
    const { q, sent } = makeQueue();
    q.hold();
    q.set({ temperature: 24 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([]);
    q.release();
    await vi.advanceTimersByTimeAsync(1499);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(1);
  });

  it('cancel drops pending changes', async () => {
    const { q, sent } = makeQueue();
    q.set({ temperature: 25 });
    q.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([]);
    expect(q.isPending).toBe(false);
  });
});

// ---- Throttle (Liquid Home lights). ----

const LIGHT = 'light.kitchen';

/** A queue on a light at 50 %, keeping its own in-flight baseline as the writer does. Sends are stamped with fake time. */
function makeLightQueue(
  schedule: WriteSchedule | (() => WriteSchedule) = throttleWrites(300),
  resolveSend: () => Promise<void> | void = () => {},
) {
  const light: HassEntity = { entity_id: LIGHT, state: 'on', attributes: { brightness: 128 } };
  const sent: { at: number; service: string; data: Record<string, unknown> }[] = [];
  let inflight: LightPatch = {};
  const q = new WriteQueue<LightPatch>({
    send: (calls) => {
      for (const c of calls) sent.push({ at: Date.now(), service: `${c.domain}.${c.service}`, data: c.data });
      return resolveSend();
    },
    build: lightBuild,
    schedule,
    getEntity: () => light,
    getBaseline: () => inflight,
    sendOnRelease: (c) => c.brightness_pct === 0,
  });
  q.onFlushed = (c) => (inflight = { ...inflight, ...c });
  const values = () => sent.map((s) => (s.service === 'light.turn_off' ? 0 : s.data.brightness_pct));
  return { q, sent, values };
}

describe('WriteQueue throttle', () => {
  beforeEach(() => {
    fakeClock();
  });
  afterEach(() => vi.useRealTimers());

  it('sends the first change at once (leading edge)', () => {
    const { q, sent } = makeLightQueue();
    q.hold();
    q.set({ brightness_pct: 60 });
    expect(sent).toEqual([{ at: 0, service: 'light.turn_on', data: { entity_id: LIGHT, brightness_pct: 60 } }]);
    expect(q.isPending).toBe(false);
  });

  it('sends at most one call per 300 ms during a drag, always the latest value', async () => {
    const { q, sent, values } = makeLightQueue();
    q.hold();
    // A pointer move every 16 ms for one second, 51 % up to 113 % clamped by the card to 100.
    for (let t = 0; t <= 1000; t += 16) {
      q.set({ brightness_pct: Math.min(100, 51 + Math.round(t / 16)) });
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(sent.map((s) => s.at)).toEqual([0, 300, 600, 900]);
    for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(300);
    // Each throttled call carries the value of the last move before it.
    expect(values()).toEqual([51, 69, 88, 100]);
  });

  it('sends the final value on release at once, even inside the window', async () => {
    const { q, sent, values } = makeLightQueue();
    q.hold();
    q.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 65 });
    await vi.advanceTimersByTimeAsync(50);
    q.release();
    expect(values()).toEqual([60, 65]);
    expect(sent.map((s) => s.at)).toEqual([0, 150]);
    // The trailing timer was spent by the release: nothing else follows.
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
  });

  it('does not resend the value last sent (dedupe), on release or at the end of a window', async () => {
    const { q, sent } = makeLightQueue();
    q.hold();
    q.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 72 });
    q.set({ brightness_pct: 70 });
    await vi.advanceTimersByTimeAsync(300);
    expect(sent).toHaveLength(1);
    q.set({ brightness_pct: 70 });
    q.release();
    expect(sent).toHaveLength(1);
    // Back to the entity's own value is sent, since 70 is in flight.
    q.set({ brightness_pct: 50 });
    expect(sent).toHaveLength(2);
  });

  it('turns the light off on release at 0 %, and never mid-drag', async () => {
    const { q, sent, values } = makeLightQueue();
    q.hold();
    q.set({ brightness_pct: 30 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(values()).toEqual([30]);
    q.release();
    expect(sent[1]).toEqual({ at: 1100, service: 'light.turn_off', data: { entity_id: LIGHT } });
  });

  it('a drag through 0 % and back sends no turn_off', async () => {
    const { q, values } = makeLightQueue();
    q.hold();
    q.set({ brightness_pct: 30 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 0 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 5 });
    await vi.advanceTimersByTimeAsync(400);
    q.release();
    expect(values()).toEqual([30, 5]);
  });

  it('a step to 0 % outside a drag turns off through the throttle', async () => {
    const { q, sent } = makeLightQueue();
    q.set({ brightness_pct: 10 });
    q.set({ brightness_pct: 0 });
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent[1]).toEqual({ at: 300, service: 'light.turn_off', data: { entity_id: LIGHT } });
  });

  it('a held arrow key respects the window and keyup sends the final value', async () => {
    const { q, sent, values } = makeLightQueue();
    // Key repeat every 33 ms, 1 % per step, from 51 %; no hold() for the keyboard.
    let p = 50;
    for (let t = 0; t < 1000; t += 33) {
      q.set({ brightness_pct: ++p });
      await vi.advanceTimersByTimeAsync(33);
    }
    expect(sent.map((s) => s.at)).toEqual([0, 300, 600, 900]);
    // keyup
    q.release();
    expect(sent.map((s) => s.at)).toEqual([0, 300, 600, 900, 1023]);
    expect(values().at(-1)).toBe(p);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(5);
  });

  it('sends the next change at once when the window has passed', async () => {
    const { q, sent } = makeLightQueue();
    q.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(400);
    q.set({ brightness_pct: 61 });
    expect(sent.map((s) => s.at)).toEqual([0, 400]);
  });

  it('reads the schedule on every change, so a card can switch policy', async () => {
    let s = debounceWrites(1500);
    const { q, sent } = makeLightQueue(() => s);
    q.set({ brightness_pct: 60 });
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent).toHaveLength(1);
    s = throttleWrites(300);
    // The debounced send at 1500 opened a window: 61 goes at its end, 62 right after it.
    q.set({ brightness_pct: 61 });
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent.map((x) => x.at)).toEqual([1500, 1800]);
    await vi.advanceTimersByTimeAsync(300);
    q.set({ brightness_pct: 62 });
    expect(sent.map((x) => x.at)).toEqual([1500, 1800, 2100]);
  });

  it('hold() drops the window timer when the pending change waits for release', async () => {
    const { q, sent, values } = makeLightQueue();
    q.set({ brightness_pct: 30 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 0 }); // not held: armed for 300
    await vi.advanceTimersByTimeAsync(50);
    q.hold(); // a drag starts at 0 %: turn_off now waits for release
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(values()).toEqual([30]);
    q.release();
    expect(sent[1]).toMatchObject({ at: 1150, service: 'light.turn_off' });
  });

  it('a switch from debounce to throttle re-arms at the throttle window', async () => {
    let s = throttleWrites(300);
    const { q, sent } = makeLightQueue(() => s);
    q.set({ brightness_pct: 60 }); // sent at 0
    await vi.advanceTimersByTimeAsync(100);
    s = debounceWrites(1500);
    q.set({ brightness_pct: 61 }); // debounce timer for 1600
    await vi.advanceTimersByTimeAsync(100);
    s = throttleWrites(300);
    q.set({ brightness_pct: 62 });
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.map((x) => [x.at, x.data.brightness_pct])).toEqual([[0, 60], [300, 62]]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toHaveLength(2);
  });

  it('measures the window on the monotonic clock, so a wall clock jump does not open it early', async () => {
    const { q, sent } = makeLightQueue();
    q.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(0); // the send resolves
    vi.setSystemTime(Date.now() + 60_000);
    q.set({ brightness_pct: 61 });
    await vi.advanceTimersByTimeAsync(299);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(2);
  });
});

describe('WriteQueue throttle with slow sends', () => {
  beforeEach(() => fakeClock());
  afterEach(() => vi.useRealTimers());

  /** Sends that resolve only when the test says so, with a count of how many are in flight at once. */
  function manual() {
    const open: (() => void)[] = [];
    let inFlight = 0;
    let most = 0;
    const resolveSend = () =>
      new Promise<void>((r) => {
        most = Math.max(most, ++inFlight);
        open.push(() => {
          inFlight--;
          r();
        });
      });
    const finish = async () => {
      open.shift()!();
      await vi.advanceTimersByTimeAsync(0);
    };
    return { resolveSend, finish, open, most: () => most };
  }

  it('keeps one send in flight; changes made meanwhile coalesce and go out in order after it resolves', async () => {
    const m = manual();
    const { q, sent, values } = makeLightQueue(throttleWrites(300), m.resolveSend);
    q.hold();
    q.set({ brightness_pct: 60 }); // t 0, in flight
    for (const p of [61, 62, 63, 64]) {
      await vi.advanceTimersByTimeAsync(200);
      q.set({ brightness_pct: p });
    }
    // t 800: the window passed long ago, but the first call has not resolved.
    expect(values()).toEqual([60]);
    await m.finish(); // resolves at 800: the window has passed, so 64 goes at once
    expect(sent.map((s) => [s.at, s.data.brightness_pct])).toEqual([[0, 60], [800, 64]]);
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 65 });
    await m.finish(); // resolves at 900, inside the window of the send at 800: armed for 1100
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent.map((s) => [s.at, s.data.brightness_pct])).toEqual([[0, 60], [800, 64], [1100, 65]]);
    expect(m.most()).toBe(1);
  });

  it('a release while a send is in flight sends the final value as soon as it resolves', async () => {
    const m = manual();
    const { q, sent, values } = makeLightQueue(throttleWrites(300), m.resolveSend);
    q.hold();
    q.set({ brightness_pct: 60 });
    await vi.advanceTimersByTimeAsync(100);
    q.set({ brightness_pct: 70 });
    q.release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(values()).toEqual([60]);
    await m.finish();
    expect(sent.map((s) => [s.at, s.data.brightness_pct])).toEqual([[0, 60], [1100, 70]]);
    expect(m.most()).toBe(1);
  });

  it('a release at 0 % while a send is in flight turns off when it resolves', async () => {
    const m = manual();
    const { q, sent } = makeLightQueue(throttleWrites(300), m.resolveSend);
    q.hold();
    q.set({ brightness_pct: 20 });
    q.set({ brightness_pct: 0 });
    q.release();
    expect(sent).toHaveLength(1);
    await m.finish();
    expect(sent[1].service).toBe('light.turn_off');
  });

  it('cancel while a send is in flight drops the pending change; nothing follows the resolve', async () => {
    const m = manual();
    const { q, values } = makeLightQueue(throttleWrites(300), m.resolveSend);
    const idle = vi.fn();
    q.onIdle = idle;
    q.set({ brightness_pct: 60 });
    q.set({ brightness_pct: 70 });
    q.release();
    q.cancel();
    await m.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(values()).toEqual([60]);
    expect(q.isBusy).toBe(false);
    expect(idle).toHaveBeenCalledOnce();
  });

  it('cancel also forgets a release made during the send: a later change waits for its window', async () => {
    const m = manual();
    const { q, sent } = makeLightQueue(throttleWrites(300), m.resolveSend);
    q.set({ brightness_pct: 60 }); // t 0, in flight
    q.set({ brightness_pct: 70 });
    q.release(); // flush on resolve
    q.cancel();
    q.set({ brightness_pct: 80 });
    await vi.advanceTimersByTimeAsync(100);
    await m.finish(); // resolves at 100: 80 waits for the window end at 300
    expect(sent.map((s) => s.at)).toEqual([0]);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent.map((s) => [s.at, s.data.brightness_pct])).toEqual([[0, 60], [300, 80]]);
  });

  for (const resolveMs of [100, 450]) {
    it(`never sends more than one call per 300 ms during a drag (sends resolve after ${resolveMs} ms)`, async () => {
      let inFlight = 0;
      let most = 0;
      const { q, sent } = makeLightQueue(throttleWrites(300), () => {
        most = Math.max(most, ++inFlight);
        return new Promise<void>((r) => setTimeout(() => (inFlight--, r()), resolveMs));
      });
      q.hold();
      for (let t = 0; t < 3000; t += 16) {
        q.set({ brightness_pct: 1 + (Math.round(t / 16) % 99) });
        await vi.advanceTimersByTimeAsync(16);
      }
      expect(sent.length).toBeGreaterThan(5);
      for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(Math.max(300, resolveMs));
      expect(most).toBe(1);
    });
  }
});

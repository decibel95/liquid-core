import type { HassEntity } from './types';

/** One entity service call, as an injected `build()` returns it. */
export interface WriteCall<P extends object = Record<string, unknown>> {
  /** The service domain; the writer uses the entity's own domain when absent. */
  domain?: string;
  service: string;
  data: Record<string, unknown>;
  /**
   * What the call sets, in patch terms, when that differs from its data (a climate set_operation_mode sets hvac_mode,
   * a light turn_off sets brightness 0). Used for the in-flight hold, never sent.
   */
  sets?: Partial<P>;
}

/**
 * When pending changes are sent.
 * - `debounce`: every change restarts the timer; one coalesced send `ms` after the last change. While held (a drag)
 *   nothing is sent; the delay counts from release. Liquid Climate's batching.
 * - `throttle`: the first change is sent at once (leading edge), then at most one send per `ms` with the latest value;
 *   held or not. Release sends the final value at once. Liquid Home's light writes.
 */
export interface WriteSchedule {
  readonly policy: 'debounce' | 'throttle';
  readonly ms: number;
}

export const debounceWrites = (ms: number): WriteSchedule => ({ policy: 'debounce', ms });
export const throttleWrites = (ms: number): WriteSchedule => ({ policy: 'throttle', ms });

export interface WriteTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
  /** Milliseconds now, for the throttle window. */
  now: () => number;
}

export interface WriteQueueOptions<P extends object, C extends WriteCall<P>> {
  /**
   * Sends the calls in order. `sets[i]` is what `calls[i]` sets in patch terms, so a writer can drop exactly the values
   * of a call that failed.
   */
  send: (calls: Omit<C, 'sets'>[], sets: Record<string, unknown>[]) => Promise<void> | void;
  /**
   * The calls for a coalesced change, against the entity and the values already in flight (`baseline`). It drops values
   * the entity has or will have once in-flight writes land, which is what dedupes a release on the value last sent.
   */
  build: (change: P, entity: HassEntity, baseline: P) => C[];
  /** The schedule policy; a function is read on every change, so a card can change it at run time. */
  schedule: WriteSchedule | (() => WriteSchedule);
  getEntity: () => HassEntity | undefined;
  /** Values already sent but not yet reflected by the entity. */
  getBaseline?: () => P;
  onChange?: () => void;
  /**
   * A pending change for which this is true is not sent while held (a drag), only on release. Throttle only; debounce
   * sends nothing while held anyway. Liquid Home uses it for brightness 0, which turns the light off on release.
   */
  sendOnRelease?: (change: P) => boolean;
  /**
   * Throttle: a send that has not resolved after this many milliseconds counts as resolved, so a call HA never answers
   * cannot block every later write. Default 10000; the writer passes its hold time.
   */
  sendTimeoutMs?: number | (() => number);
  timers?: Partial<WriteTimers>;
}

/** Milliseconds from a monotonic clock where there is one. */
const monotonicNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Coalescing writer. Every interaction merges into one pending change; the schedule decides when `flush` builds and
 * sends the calls for it. Under throttle at most one send is in flight: changes made meanwhile coalesce and go out
 * when it resolves, so HA never sees an older value after a newer one. Debounce does not serialise, as in Liquid
 * Climate: its sends are seconds apart. The one rare overlap is a run-time switch from throttle to debounce while a
 * throttled send is still in flight; the debounced send then goes out beside it.
 */
export class WriteQueue<P extends object, C extends WriteCall<P> = WriteCall<P>> {
  private change = {} as P;
  private handle: unknown = null;
  /** The policy the armed timer belongs to, so a run-time switch re-arms it. */
  private armedFor: WriteSchedule['policy'] | null = null;
  /** When the last calls were sent, for the throttle window. */
  private sentAt = -Infinity;
  /** A throttled send is in flight. */
  private busy = false;
  /** A flush was asked for (a release) while a throttled send was in flight: flush when it resolves. */
  private flushOnResolve = false;
  /** Numbers throttled sends, so a late resolve of a send that timed out is ignored. */
  private sendSeq = 0;
  /** Called when no throttled send is in flight any more and none follows at once. */
  onIdle?: () => void;
  /** Bumped on every interaction so the UI can restart its progress line. */
  generation = 0;
  private held = false;
  /** Called with what the coalesced change sets, right before it is sent. */
  onFlushed?: (sent: P) => void;

  private readonly o: Required<Omit<WriteQueueOptions<P, C>, 'timers' | 'sendOnRelease' | 'sendTimeoutMs'>> &
    Pick<WriteQueueOptions<P, C>, 'sendOnRelease' | 'sendTimeoutMs'>;
  private readonly timers: WriteTimers;

  constructor(o: WriteQueueOptions<P, C>) {
    this.o = { onChange: () => {}, getBaseline: () => ({}) as P, ...o };
    this.timers = {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: monotonicNow,
      ...o.timers,
    };
  }

  get pending(): P {
    return this.change;
  }

  get isPending(): boolean {
    return Object.keys(this.change).length > 0;
  }

  /** True while a drag holds the queue. */
  get isHeld(): boolean {
    return this.held;
  }

  /** True while a throttled send is in flight. */
  get isBusy(): boolean {
    return this.busy;
  }

  private sendTimeout(): number {
    const t = this.o.sendTimeoutMs;
    return t === undefined ? 10_000 : typeof t === 'function' ? t() : t;
  }

  private get schedule(): WriteSchedule {
    const s = this.o.schedule;
    return typeof s === 'function' ? s() : s;
  }

  set(patch: P): void {
    this.change = { ...this.change, ...patch };
    this.generation++;
    this.arm();
    this.o.onChange();
  }

  /**
   * A discrete action (a power or toggle tap): merge `patch` into what is pending and send it now, under either
   * policy, without waiting for a window. The build still drops values HA already has. Under throttle it never overlaps
   * a send in flight: it goes out the moment that one resolves. A send starts a new throttle window.
   *
   * Exception: under throttle while a drag holds the queue, a change that `sendOnRelease` defers (turn_off at 0 %)
   * still waits for the release, as every other path does; it goes out when the last holder lets go.
   */
  sendNow(patch: P): void {
    this.change = { ...this.change, ...patch };
    this.generation++;
    this.o.onChange();
    if (this.schedule.policy === 'throttle' && this.busy) {
      this.disarm();
      this.flushOnResolve = true;
      return;
    }
    void this.flush();
  }

  /** A drag starts. Debounce sends nothing until release; throttle keeps sending at most once per window. */
  hold(): void {
    this.held = true;
    if (this.schedule.policy === 'debounce' || this.deferred()) this.disarm();
  }

  /** Throttle: the pending change waits for release (sendOnRelease while held). */
  private deferred(): boolean {
    return this.held && !!this.o.sendOnRelease?.(this.change);
  }

  /**
   * Send what is pending without ending a hold: debounce at once (Liquid Climate, a card leaving), throttle as its
   * window allows. A change deferred to release stays pending.
   */
  sendPending(): void {
    if (!this.isPending) return;
    if (this.schedule.policy === 'throttle') this.arm();
    else void this.flush();
  }

  /** A drag ends. Debounce counts its delay from now; throttle sends the final value at once. */
  release(): void {
    this.held = false;
    if (!this.isPending) return;
    if (this.schedule.policy === 'throttle') void this.flush();
    else this.arm();
  }

  private disarm(): void {
    if (this.handle != null) this.timers.clear(this.handle);
    this.handle = null;
    this.armedFor = null;
  }

  private setTimer(policy: WriteSchedule['policy'], ms: number): void {
    this.handle = this.timers.set(() => void this.flush(), ms);
    this.armedFor = policy;
  }

  private arm(): void {
    const { policy, ms } = this.schedule;
    if (policy === 'throttle') {
      // A timer left by debounce would fire at the wrong time.
      if (this.armedFor === 'debounce') this.disarm();
      if (this.deferred()) {
        this.disarm();
        return;
      }
      // The send in flight flushes or arms when it resolves.
      if (this.busy) return;
      const wait = this.sentAt + ms - this.timers.now();
      if (wait <= 0) void this.flush();
      // An armed timer already fires at the end of the window and sends whatever is pending then.
      else if (this.handle == null) this.setTimer('throttle', wait);
      return;
    }
    this.disarm();
    if (this.held) return;
    if (ms <= 0) void this.flush();
    else this.setTimer('debounce', ms);
  }

  /**
   * Build and send what is pending now. Under throttle it sends nothing while another send is in flight (it flushes
   * when that resolves) and never sends a change deferred to release while the queue is held.
   *
   * Returns what this call sent: the pending change it took (the build may have dropped values HA already has), or `{}`
   * when it sent nothing because a send is in flight or the change waits for release; that change stays pending.
   */
  async flush(): Promise<P> {
    this.disarm();
    const throttled = this.schedule.policy === 'throttle';
    if (throttled && this.busy) {
      this.flushOnResolve = true;
      return {} as P;
    }
    if (throttled && this.deferred()) return {} as P;
    const change = this.change;
    this.change = {} as P;
    const entity = this.o.getEntity();
    let inFlight = false;
    let token = 0;
    let guard: unknown = null;
    try {
      if (entity && Object.keys(change).length) {
        // Built against the baseline as it is now, before this change joins it.
        const calls = this.o.build(change, entity, this.o.getBaseline());
        if (calls.length) {
          const sent: Record<string, unknown> = {};
          const sets: Record<string, unknown>[] = [];
          for (const c of calls) {
            const { entity_id: _id, ...rest } = c.data;
            sets.push(c.sets ?? rest);
            Object.assign(sent, c.sets ?? rest);
          }
          this.sentAt = this.timers.now();
          this.onFlushed?.(sent as P);
          if (throttled) {
            inFlight = this.busy = true;
            token = ++this.sendSeq;
            guard = this.timers.set(() => this.timedOut(token), this.sendTimeout());
          }
          await this.o.send(
            calls.map(({ sets: _sets, ...call }) => call),
            sets,
          );
        }
      }
    } finally {
      this.o.onChange();
      if (inFlight) {
        this.timers.clear(guard);
        if (this.current(token)) this.resolved();
      }
    }
    return change;
  }

  /** Is `token` the throttled send still in flight (not timed out, not followed by another)? */
  private current(token: number): boolean {
    return this.busy && token === this.sendSeq;
  }

  private timedOut(token: number): void {
    if (!this.current(token)) return;
    console.warn('liquid-core: a write did not resolve in time; later writes go ahead');
    this.resolved();
  }

  /** The throttled send in flight resolved: send what came in meanwhile, at once after a release, else per window. */
  private resolved(): void {
    this.busy = false;
    const now = this.flushOnResolve;
    this.flushOnResolve = false;
    if (this.isPending) {
      if (now) void this.flush();
      else this.arm();
    }
    if (!this.busy) this.onIdle?.();
  }

  cancel(): void {
    this.disarm();
    this.held = false;
    this.flushOnResolve = false;
    this.change = {} as P;
  }
}

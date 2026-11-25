/**
 * Parity notes for Liquid Climate Patch B. Deliberate deviations from Liquid Climate 0.11.1 (src/cards/shared/writer.ts):
 * 1. Order-aware stale echoes. A value is held until HA reports the newest value sent; a report that leaves the key
 *    unchanged since the send ends nothing. A return to the start value (heat, cool, heat) is therefore held until the
 *    hold expires or a different value is seen, where Liquid Climate dropped it at once. This keeps `modeChanging` true
 *    for up to `write_hold` in that case.
 * 2. Owner-tracked holds. A card leaving releases only its own hold (WriterRegistry.release), never another card's
 *    drag; Liquid Climate's releaseWriter called flushNow, which ended every hold.
 * 3. The dial maps `this._queue.hold()` to `this._lease.hold()` and `this._queue.release()` to `this._lease.endHold()`.
 * 4. A call without a domain goes to the entity's own domain (Liquid Climate defaulted to climate).
 */
import { WriteQueue, type WriteCall, type WriteSchedule } from './write-queue';
import type { HassEntity, HomeAssistant } from './types';

const ERROR_MS = 6000;

export interface WriterOptions<P extends object, C extends WriteCall<P>> {
  /** The calls for a coalesced change; see WriteQueueOptions.build. */
  build: (change: P, entity: HassEntity, baseline: P) => C[];
  /** The initial schedule policy; a card can replace `writer.schedule` at run time. */
  schedule: WriteSchedule;
  /** Seconds a sent value is held as shown while the entity has not reported it back. Default 10. */
  hold?: number;
  /**
   * The entity's value for a patch key, in patch terms, to tell when it caught up with a sent value. Default: the
   * attribute of that name. A light maps brightness to percent so `round(round(p * 2.55) / 2.55) = p` matches.
   */
  stateOf?: (entity: HassEntity, key: string) => unknown;
  /**
   * Does the entity's value (from `stateOf`) count as the value sent? Default: equal, arrays item by item. A colour
   * temperature can allow a few kelvin, since HA converts through mireds (2700 K is reported as 2702 K).
   */
  matches?: (key: string, actual: unknown, sent: unknown) => boolean;
  /**
   * The entity answered a sent key in its own way, so the held value is dropped although it differs. `sentFrom` is the
   * entity's state when that key was sent. Liquid Climate: a water heater answers turn_on with its current operation.
   */
  answered?: (entity: HassEntity, key: string, sentFrom: string) => boolean;
  /** See WriteQueueOptions.sendOnRelease. */
  sendOnRelease?: (change: P) => boolean;
  /** Translator for the error shown when a call fails without a message of its own. */
  t?: (hass: HomeAssistant, key: string) => string;
  /** Key passed to `t` for that error. Default `common.commandFailed`. */
  errorKey?: string;
  /** Prefix of the service-call-failed console error. Default `liquid-core`. */
  logLabel?: string;
}

/** Equal values, arrays compared item by item (hs_color). */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return Object.is(a, b);
}

/**
 * Optimistic writes for one entity: the write queue, the values already sent but not yet reported back, and the last
 * error. There is one writer per entity id, shared by every card showing that entity (see WriterRegistry), so a tile and
 * the control in its sheet coalesce into one queue and agree on what is pending.
 */
export class EntityWriter<P extends object, C extends WriteCall<P> = WriteCall<P>> {
  /**
   * The shared queue. Cards hold it through their lease (WriterLease.hold and endHold, or holdFor and endHoldFor with
   * the card as owner), never with `queue.hold()` directly: a hold without an owner is not ended when its card goes.
   */
  readonly queue: WriteQueue<P, C>;
  /** Latest hass, set by the cards using this writer. */
  hass?: HomeAssistant;
  /** When pending changes are sent; the card that interacts sets it. */
  schedule: WriteSchedule;
  /** Seconds a sent value is held as shown while the entity has not reported it back; the card that interacts sets it. */
  hold: number;
  protected _inflight = {} as P;
  error: string | null = null;
  /**
   * Sends not yet settled. Debounced sends can overlap; throttled ones only when one timed out (see
   * WriteQueueOptions.sendTimeoutMs) and is still unanswered.
   */
  protected active = 0;
  /** The owners (card leases) holding the queue for a drag or a held key; the queue is held while any remain. */
  private holders = new Set<object>();
  /** The hold expired while a throttled send was in flight: clear when the queue is idle, it still builds against it. */
  private clearOnIdle = false;
  /**
   * Per in-flight key: every value sent and not yet reported, oldest first; the entity's value for the key when it was
   * first sent (`seen`, then the last one reported); and the entity's state when the key was last sent (for `answered`).
   * A newly reported value equal to an older send drops it and what came before, but keeps the newest held. A report
   * that leaves the key's value unchanged is not an echo at all, so it ends nothing.
   */
  protected sent = new Map<string, { values: unknown[]; seen?: unknown; from?: string }>();
  private disposed = false;
  private inflightTimer?: ReturnType<typeof setTimeout>;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();

  constructor(
    readonly entityId: string,
    protected readonly opts: WriterOptions<P, C>,
  ) {
    this.schedule = opts.schedule;
    this.hold = opts.hold ?? 10;
    this.queue = new WriteQueue<P, C>({
      send: (calls, sets) => this.send(calls, sets),
      build: opts.build,
      schedule: () => this.schedule,
      getEntity: () => this.entity(),
      getBaseline: () => this.inflight,
      onChange: () => this.changed(),
      sendOnRelease: opts.sendOnRelease,
      sendTimeoutMs: () => Math.max(this.hold * 1000, 1000),
    });
    this.queue.onIdle = () => {
      if (!this.disposed && !this.clearOnIdle) return;
      this.clearOnIdle = false;
      this.inflight = {} as P;
      if (!this.disposed) this.changed();
    };
    this.queue.onFlushed = (sent) => {
      // A send after dispose (pending changes go out) starts no hold: nobody shows it.
      if (this.disposed) return;
      this.clearOnIdle = false;
      const s = this.entity();
      for (const [key, value] of Object.entries(sent)) {
        const rec = key in this._inflight ? this.sent.get(key) : undefined;
        if (rec) this.sent.set(key, { ...rec, values: [...rec.values, value], from: s?.state });
        else this.sent.set(key, { values: [value], seen: s ? this.stateOf(s, key) : undefined, from: s?.state });
      }
      this._inflight = { ...this._inflight, ...sent };
      clearTimeout(this.inflightTimer);
      this.inflightTimer = setTimeout(() => this.clearInflight(), this.hold * 1000);
    };
  }

  /** Values sent but not yet reflected by the entity. Assigning it resets the per-key send records. */
  get inflight(): P {
    return this._inflight;
  }

  set inflight(v: P) {
    this._inflight = v;
    this.sent.clear();
  }

  protected stateOf(e: HassEntity, key: string): unknown {
    return this.opts.stateOf ? this.opts.stateOf(e, key) : e.attributes[key];
  }

  /** The hold expired. While a throttled send is in flight the queue still builds against it, so wait for idle. */
  private clearInflight(): void {
    if (this.queue.isBusy) {
      this.clearOnIdle = true;
      return;
    }
    this.inflight = {} as P;
    this.changed();
  }

  /** Register a card's re-render callback; returns the unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected changed(): void {
    for (const fn of [...this.listeners]) fn();
  }

  entity(): HassEntity | undefined {
    return this.hass?.states[this.entityId];
  }

  /** A send is in progress. */
  get sending(): boolean {
    return this.active > 0;
  }

  /** Optimistic values to show: in-flight writes, then pending ones on top. */
  get local(): P {
    return { ...this.inflight, ...this.queue.pending };
  }

  set(patch: P): void {
    this.queue.set(patch);
  }

  /** A discrete action (power, toggle): send `patch` at once, deduped and serialised as WriteQueue.sendNow says. */
  sendNow(patch: P): void {
    this.queue.sendNow(patch);
  }

  /**
   * Call when hass changes: drops the in-flight values the entity has caught up with. Any other value, including an
   * older one sent earlier (a stale echo), keeps the newest sent value held until it is reported or the hold expires.
   */
  observe(hass: HomeAssistant): void {
    this.hass = hass;
    const s = this.entity();
    if (!s || !Object.keys(this._inflight).length) return;
    this.reconcile(s);
  }

  /** Hook: drops the in-flight values `s` caught up with; `observe` calls it while any are in flight. */
  protected reconcile(s: HassEntity): void {
    const matches = this.opts.matches ?? ((_k: string, actual: unknown, sent: unknown) => same(actual, sent));
    const next = { ...this._inflight } as Record<string, unknown>;
    for (const key of Object.keys(next)) {
      const rec = this.sent.get(key) ?? { values: [next[key]] };
      const actual = this.stateOf(s, key);
      const answered = rec.from !== undefined && !!this.opts.answered?.(s, key, rec.from);
      // Unchanged since the last report (or since the send): another attribute moved, not this key's echo.
      if (!answered && 'seen' in rec && same(actual, rec.seen)) continue;
      rec.seen = actual;
      const i = rec.values.findIndex((v) => matches(key, actual, v));
      if (i >= 0) rec.values = rec.values.slice(i + 1);
      if (!rec.values.length || answered) {
        delete next[key];
        this.sent.delete(key);
      } else this.sent.set(key, rec);
    }
    this._inflight = next as P;
  }

  /**
   * `owner` (a card's lease) starts holding the queue: a drag or a held key. Debounce sends nothing until the last
   * holder lets go; throttle keeps sending per window but defers a sendOnRelease change.
   */
  holdFor(owner: object): void {
    this.holders.add(owner);
    this.queue.hold();
  }

  /** `owner` lets go. When it was the last holder the queue is released: the final value goes out. */
  endHoldFor(owner: object): void {
    if (this.holders.delete(owner) && !this.holders.size) this.queue.release();
  }

  /**
   * Drop what this writer would still send or show: the pending change, the armed throttle or debounce timer and the
   * held (in-flight) values, so another path that writes the same entity (a room header power call) is not undone by a
   * trailing step. Sends already issued still land, and their echoes then show as ordinary state. A drag still holding
   * the queue keeps its hold.
   */
  discard(): void {
    this.queue.cancel();
    if (this.holders.size) this.queue.hold();
    clearTimeout(this.inflightTimer);
    this.clearOnIdle = false;
    this.inflight = {} as P;
    this.changed();
  }

  /** Send what is pending now, ending every drag hold. Only for dispose: cards end their own hold with endHold. */
  protected flushNow(): void {
    this.holders.clear();
    this.queue.release();
    if (this.queue.isPending) void this.queue.flush();
  }

  /**
   * Send what is pending without ending a drag hold, for a card that leaves while another still uses the writer:
   * debounce at once, throttle as its window allows. A change deferred to release (sendOnRelease, such as turn_off at
   * 0 %) stays pending for the card still dragging.
   */
  sendPending(): void {
    this.queue.sendPending();
  }

  /**
   * Last user gone: send what is pending, drop optimistic state and stop every timer. While a throttled send is in
   * flight the final change waits for it, built against the in-flight values, which are dropped once the queue is idle.
   */
  dispose(): void {
    // Set first: a call that fails, even at once, sets no error state or timer on a disposed writer.
    this.disposed = true;
    this.flushNow();
    clearTimeout(this.inflightTimer);
    clearTimeout(this.errorTimer);
    if (!this.queue.isBusy) this.inflight = {} as P;
    this.listeners.clear();
  }

  private async send(calls: Omit<C, 'sets'>[], sets: Record<string, unknown>[]): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    this.sendStarted();
    this.changed();
    let i = 0;
    try {
      for (; i < calls.length; i++) {
        const c = calls[i];
        await hass.callService(c.domain ?? this.entityId.split('.')[0], c.service, c.data);
      }
    } catch (err) {
      console.error(`${this.opts.logLabel ?? 'liquid-core'}: service call failed`, err);
      if (this.disposed) return;
      this.rollback(sets.slice(i));
      this.error = err instanceof Error && err.message ? err.message : (this.opts.t?.(hass, this.opts.errorKey ?? 'common.commandFailed') ?? 'Command failed');
      clearTimeout(this.errorTimer);
      this.errorTimer = setTimeout(() => {
        this.error = null;
        this.changed();
      }, ERROR_MS);
    } finally {
      this.sendSettled();
      this.changed();
    }
  }

  /** Hook: a send starts, `changed()` follows. An override calls super. */
  protected sendStarted(): void {
    this.active++;
  }

  /** Hook: a send settled (failed or not), `changed()` follows. An override calls super. */
  protected sendSettled(): void {
    this.active--;
  }

  /**
   * Hook: a call failed (writer not disposed), before `error` is set. `failed` is what it and the later calls set. Drops
   * only those values; a key keeps its earlier sends held. With nothing left in flight the hold timer stops.
   */
  protected rollback(failed: Record<string, unknown>[]): void {
    const next = { ...this._inflight } as Record<string, unknown>;
    for (const set of failed) {
      for (const [key, value] of Object.entries(set)) {
        const rec = this.sent.get(key);
        let at = rec ? rec.values.length - 1 : -1;
        while (at >= 0 && !same(rec!.values[at], value)) at--;
        if (at >= 0) rec!.values.splice(at, 1);
        if (rec?.values.length) next[key] = rec.values[rec.values.length - 1];
        else {
          delete next[key];
          this.sent.delete(key);
        }
      }
    }
    this._inflight = next as P;
    if (!Object.keys(next).length) clearTimeout(this.inflightTimer);
  }
}

/** What the registry and lease need from a writer. */
export interface SharedWriter {
  readonly entityId: string;
  subscribe(fn: () => void): () => void;
  holdFor(owner: object): void;
  endHoldFor(owner: object): void;
  sendPending(): void;
  dispose(): void;
}

/** One shared writer per entity id, ref-counted. A product keeps one registry at module level. */
export class WriterRegistry<W extends SharedWriter> {
  private writers = new Map<string, { writer: W; refs: number }>();

  constructor(private readonly create: (entityId: string) => W) {}

  /** The shared writer for an entity. Every acquire needs a matching release. */
  acquire(entityId: string): W {
    let e = this.writers.get(entityId);
    if (!e) {
      e = { writer: this.create(entityId), refs: 0 };
      this.writers.set(entityId, e);
    }
    e.refs++;
    return e.writer;
  }

  /**
   * A card stops using a writer. Its own hold (`owner`, the card's lease) ends first, so a card leaving mid-drag never
   * leaves the queue held for good. Whatever is pending is then sent, so a change is never lost when its card goes
   * away, without ending a drag another card holds; the last release disposes the writer.
   */
  release(writer: W, owner?: object): void {
    const e = this.writers.get(writer.entityId);
    if (!e || e.writer !== writer) {
      writer.dispose();
      return;
    }
    e.refs--;
    if (e.refs > 0) {
      if (owner) writer.endHoldFor(owner);
      writer.sendPending();
      return;
    }
    this.writers.delete(writer.entityId);
    writer.dispose();
  }

  /** Number of cards holding the writer of an entity, for tests. */
  refs(entityId: string): number {
    return this.writers.get(entityId)?.refs ?? 0;
  }
}

/**
 * Holds one card's reference to the shared writer of its entity. Acquires lazily, releases on disconnect, and switches
 * cleanly when the card's entity changes. A card holds the queue through its lease: `hold()` on pointerdown or on the
 * first keydown of a held key, `endHold()` on pointerup or keyup, which sends the final value. The hold belongs to the
 * card and ends when the card goes. Liquid Climate's dial maps `this._queue.hold()` to `this._lease.hold()` and
 * `this._queue.release()` to `this._lease.endHold()`.
 */
export class WriterLease<W extends SharedWriter> {
  private writer?: W;
  private off?: () => void;

  constructor(
    private readonly registry: WriterRegistry<W>,
    private readonly onChange: () => void,
  ) {}

  /** The writer for `entityId`, acquiring it (and releasing a previous one) when needed. */
  get(entityId: string): W {
    if (this.writer?.entityId !== entityId) {
      this.release();
      this.writer = this.registry.acquire(entityId);
      this.off = this.writer.subscribe(this.onChange);
    }
    return this.writer;
  }

  get current(): W | undefined {
    return this.writer;
  }

  /** This card starts holding its writer's queue (a drag or a held key). */
  hold(): void {
    this.writer?.holdFor(this);
  }

  /** This card lets go; the final value goes out when no other card holds the queue. */
  endHold(): void {
    this.writer?.endHoldFor(this);
  }

  release(): void {
    if (!this.writer) return;
    this.off?.();
    const w = this.writer;
    this.writer = undefined;
    this.registry.release(w, this);
  }
}

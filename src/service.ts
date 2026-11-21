import type { HomeAssistant } from './types';

/** One entity service call. Resolves when HA accepted it, rejects when it did not. */
export async function callEntityService(
  hass: Pick<HomeAssistant, 'callService'>,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<void> {
  await hass.callService(domain, service, data);
}

/**
 * Pending and error state of the controls in a row menu, keyed by the row's position. A control with a call in flight is
 * pending (the UI disables it and sets aria-busy); a rejected call leaves one error per row.
 */
export class RowCalls {
  private _pending = new Set<string>();
  private _errors = new Map<string, boolean>();

  constructor(private _changed: () => void) {}

  isPending(row: string, control: string): boolean {
    return this._pending.has(`${row}|${control}`);
  }

  rowBusy(row: string): boolean {
    for (const k of this._pending) if (k.startsWith(`${row}|`)) return true;
    return false;
  }

  hasError(row: string): boolean {
    return this._errors.get(row) === true;
  }

  /** Forget the error of a row, for example when its menu is opened or closed. */
  clear(row: string): void {
    this._errors.delete(row);
  }

  async run(row: string, control: string, call: () => Promise<unknown>): Promise<void> {
    const key = `${row}|${control}`;
    if (this._pending.has(key)) return;
    this._pending.add(key);
    this._errors.delete(row);
    this._changed();
    try {
      await call();
    } catch {
      this._errors.set(row, true);
    } finally {
      this._pending.delete(key);
      this._changed();
    }
  }
}

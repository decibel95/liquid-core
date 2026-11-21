import { describe, expect, it, vi } from 'vitest';
import { RowCalls, callEntityService } from '../src/service';

describe('callEntityService', () => {
  it('passes the call to hass and resolves when it was accepted', async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await callEntityService({ callService }, 'climate', 'set_temperature', { entity_id: 'climate.a', temperature: 21 });
    expect(callService).toHaveBeenCalledWith('climate', 'set_temperature', { entity_id: 'climate.a', temperature: 21 });
  });

  it('rejects when hass rejects', async () => {
    const callService = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(callEntityService({ callService }, 'climate', 'turn_off', {})).rejects.toThrow('nope');
  });
});

describe('RowCalls', () => {
  it('marks a control pending while its call is in flight and ignores a repeat', async () => {
    const changed = vi.fn();
    const rows = new RowCalls(changed);
    let finish!: () => void;
    const first = rows.run('r1', 'power', () => new Promise<void>((r) => (finish = r)));
    expect(rows.isPending('r1', 'power')).toBe(true);
    expect(rows.rowBusy('r1')).toBe(true);
    expect(rows.rowBusy('r2')).toBe(false);
    const call = vi.fn();
    await rows.run('r1', 'power', call);
    expect(call).not.toHaveBeenCalled();
    finish();
    await first;
    expect(rows.isPending('r1', 'power')).toBe(false);
    expect(rows.hasError('r1')).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('keeps one error per row after a rejected call until it is cleared or the row runs again', async () => {
    const rows = new RowCalls(() => undefined);
    await rows.run('r1', 'power', () => Promise.reject(new Error('x')));
    expect(rows.hasError('r1')).toBe(true);
    rows.clear('r1');
    expect(rows.hasError('r1')).toBe(false);
    await rows.run('r1', 'power', () => Promise.reject(new Error('x')));
    await rows.run('r1', 'mode', () => Promise.resolve());
    expect(rows.hasError('r1')).toBe(false);
  });
});

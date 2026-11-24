// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openHistory } from '../src/navigate';

describe('openHistory', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pushes the encoded history URL without reloading', () => {
    const from = window.location.pathname;
    const push = vi.spyOn(window.history, 'pushState');
    openHistory(document.body, 'climate.living room&x=1');
    expect(push).toHaveBeenCalledWith({ from }, '', '/history?entity_id=climate.living%20room%26x%3D1');
  });

  it('pushes the state HA reads for its back arrow: { from: the path before the jump }', () => {
    window.history.replaceState(null, '', '/lovelace/0');
    const push = vi.spyOn(window.history, 'pushState');
    openHistory(document.body, 'light.a');
    expect(push.mock.calls[0][0]).toEqual({ from: '/lovelace/0' });
    expect(window.history.state).toEqual({ from: '/lovelace/0' });
  });

  it('fires location-changed on window, bubbling and composed, with HA detail shape, after pushState', () => {
    const order: string[] = [];
    vi.spyOn(window.history, 'pushState').mockImplementation(() => void order.push('push'));
    let ev: CustomEvent | undefined;
    const on = (e: Event) => {
      order.push('event');
      ev = e as CustomEvent;
    };
    window.addEventListener('location-changed', on);
    openHistory(document.body, 'light.a');
    window.removeEventListener('location-changed', on);
    expect(order).toEqual(['push', 'event']);
    expect(ev!.bubbles).toBe(true);
    expect(ev!.composed).toBe(true);
    expect(ev!.detail).toEqual({ replace: false });
  });
});

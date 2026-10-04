import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUpdate } from './updates';

describe('updates only between customers', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('does not offer a redundant reload after the first offline installation', async () => {
    const serviceWorker = Object.assign(new EventTarget(), { controller: null, register: async () => ({ waiting: null, addEventListener() {} }) });
    vi.stubGlobal('navigator', { serviceWorker });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { reload: vi.fn() } }));
    vi.resetModules();
    const updates = await import('./updates');
    await updates.prepareUpdates();
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(updates.updateReady()).toBe(false);
  });
  it('requires an empty calculator and sale with no dialog or device operation', () => {
    const idle = { stage: 'sale', count: 0, entry: '', multiplied: false, editing: false, busy: false, dialog: false };
    expect(canUpdate(idle)).toBe(true);
    for (const change of [{ stage: 'payment' }, { stage: 'complete' }, { count: 1 }, { entry: '10' }, { multiplied: true }, { editing: true }, { busy: true }, { dialog: true }]) {
      expect(canUpdate({ ...idle, ...change })).toBe(false);
    }
  });
});

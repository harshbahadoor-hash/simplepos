import { describe, expect, it } from 'vitest';
import { canUpdate } from './updates';

describe('updates only between customers', () => {
  it('requires an empty calculator and sale with no dialog or device operation', () => {
    const idle = { stage: 'sale', count: 0, entry: '', multiplied: false, editing: false, busy: false, dialog: false };
    expect(canUpdate(idle)).toBe(true);
    for (const change of [{ stage: 'payment' }, { stage: 'complete' }, { count: 1 }, { entry: '10' }, { multiplied: true }, { editing: true }, { busy: true }, { dialog: true }]) {
      expect(canUpdate({ ...idle, ...change })).toBe(false);
    }
  });
});

import { expect, it } from 'vitest';
import { receiptBytes } from './receipt';
it('prints totals and change with ESC/POS initialisation and paper feed', () => {
  const bytes = receiptBytes([{ quantity: 2, price: 1550 }], 'cash', 5000, 58, new Date('2026-10-04T08:00:00Z'));
  expect(Array.from(bytes.slice(0, 2))).toEqual([27, 64]);
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain('BAHADOOR POOJA SHOP');
  expect(text).toContain('31.00');
  expect(text).toContain('Change');
  expect(text).toContain('19.00');
  expect(text).toContain('04/10/2026');
});

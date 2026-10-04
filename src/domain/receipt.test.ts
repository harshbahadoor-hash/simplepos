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
  expect(Array.from(bytes.slice(-3))).toEqual([29, 86, 0]);
});
it('prints fractional quantity and the same rounded line total as the screen', () => {
  const text = new TextDecoder().decode(receiptBytes([{ quantity: 1.25, price: 1550 }], 'cash', 2000, 80, new Date()));
  expect(text).toContain('1.25 x 15.50');
  expect(text).toContain('19.38');
  expect(text).toContain('Round up');
  expect(text).toContain('0.62');
  expect(text).toMatch(/TOTAL\s+Rs 20.00/);
  expect(text).toMatch(/Change\s+Rs 0.00/);
});

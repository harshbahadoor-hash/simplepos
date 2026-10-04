import { describe, expect, it } from 'vitest';
import { parseMoney, lineTotal, total, cashPayment, quickCash, enter, emptyEntry, entryLine } from './pos';

describe('calculator sale', () => {
  it('calculates the acceptance sale and change in cents', () => {
    const lines = [{ quantity: 1, price: 1000 }, { quantity: 1, price: 1500 }, { quantity: 2, price: 2000 }, { quantity: 3, price: 2500 }];
    expect(total(lines)).toBe(14000);
    expect(cashPayment(total(lines), 20000)).toEqual({ change: 6000, shortfall: 0 });
  });
  it('rejects malformed amounts and avoids floating point parsing', () => {
    expect(parseMoney('15.50')).toBe(1550);
    expect(parseMoney('0.29')).toBe(29);
    for (const value of ['', '12.999', '12.3.5', '-1', 'Infinity', '1e3']) expect(() => parseMoney(value)).toThrow();
  });
  it('defaults quantity to one and handles quantity times price', () => {
    let entry = emptyEntry();
    for (const key of ['2', '*', '2', '0']) entry = enter(entry, key);
    expect(entryLine(entry)).toEqual({ quantity: 2, price: 2000 });
    expect(entryLine(enter(enter(emptyEntry(), '1'), '0'))).toEqual({ quantity: 1, price: 1000 });
  });
  it('rejects excessive decimals without changing entry', () => {
    let entry = emptyEntry();
    for (const key of ['1', '.', '2', '5']) entry = enter(entry, key);
    expect(() => enter(entry, '9')).toThrow();
    expect(() => enter(entry, '.')).toThrow();
    expect(entryLine(entry).price).toBe(125);
  });
  it('prevents zero quantities and unsafe totals', () => {
    expect(() => lineTotal({ quantity: 0, price: 100 })).toThrow();
    expect(() => lineTotal({ quantity: 999999, price: Number.MAX_SAFE_INTEGER })).toThrow();
  });
  it('reports short cash and offers sufficient quick amounts', () => {
    expect(cashPayment(14000, 12000)).toEqual({ change: 0, shortfall: 2000 });
    expect(quickCash(14000)).toEqual([20000, 50000, 100000]);
    expect(quickCash(150000).every(value => value >= 150000)).toBe(true);
  });
});

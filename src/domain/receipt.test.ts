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

// Model paper motion independently of the formatter: default 30-dot lines,
// normal 24-dot characters, ESC 3 spacing, ESC J feed and GS V cut.
function paperLayout(bytes: Uint8Array) {
  let spacing = 30, feed = 0, lastTextTop = 0, cuts = 0, line = '';
  const rows: string[] = [];
  for (let index = 0; index < bytes.length;) {
    const value = bytes[index]!;
    if (value === 27) {
      const command = bytes[index + 1], parameter = bytes[index + 2];
      if (command === 64) { spacing = 30; index += 2; }
      else if (command === 51 || command === 74) {
        if (parameter === undefined) throw new Error('Truncated printer command');
        if (command === 51) spacing = parameter; else feed += parameter;
        index += 3;
      }
      else throw new Error(`Unexpected printer command ${command}`);
    } else if (value === 29 && bytes[index + 1] === 86) { cuts++; index += 3; }
    else if (value === 10) {
      rows.push(line); if (line.trim()) lastTextTop = feed;
      feed += Math.max(24, spacing); line = ''; index++;
    } else { line += String.fromCharCode(value); index++; }
  }
  return { rows, feed, cuts, finalTextClearance: feed - lastTextTop };
}
it.each([58, 80] as const)('uses less paper at %s mm without shrinking text or cutting the footer', width => {
  const receipt = paperLayout(receiptBytes([
    { quantity: 1, price: 1000 }, { quantity: 1, price: 1500 },
    { quantity: 2, price: 2000 }, { quantity: 3, price: 2500 },
  ], 'cash', 20000, width, new Date('2026-10-05T08:00:00Z')));
  // Previously this 4-item receipt fed 540 dots. Budget includes cutter margin.
  expect(receipt.feed).toBeLessThanOrEqual(420);
  expect(receipt.finalTextClearance).toBeGreaterThanOrEqual(120);
  expect(receipt.cuts).toBe(1);
  expect(receipt.rows).toHaveLength(12);
  expect(receipt.rows.every(row => row.trim().length > 0 && row.length <= (width === 58 ? 32 : 48))).toBe(true);
  expect(receipt.rows.join('\n')).toMatch(/TOTAL +Rs 140.00\nCash +Rs 200.00\nChange +Rs 60.00\nThank you/);
});

it.each([58, 80] as const)('combines equal unit prices only on the %s mm receipt, in first-seen order', width => {
  const lines = [{ quantity: 1, price: 4000 }, { quantity: 1, price: 2000 }, { quantity: 1, price: 3000 }, { quantity: 2.5, price: 2000 }, { quantity: 2, price: 4000 }];
  const unchanged = structuredClone(lines), date = new Date('2026-10-05T08:00:00Z');
  const compact = paperLayout(receiptBytes(lines, 'cash', 30000, width, date, 'compact'));
  const original = paperLayout(receiptBytes(lines, 'cash', 30000, width, date, 'original'));
  expect(compact.rows.filter(row => /^\d+\./.test(row))).toEqual([
    expect.stringMatching(/^1\. 3 x 40.00 +120.00$/), expect.stringMatching(/^2\. 3.5 x 20.00 +70.00$/), expect.stringMatching(/^3\. 1 x 30.00 +30.00$/),
  ]);
  expect(original.rows.filter(row => /^\d+\./.test(row))).toHaveLength(5);
  for (const receipt of [compact, original]) {
    expect(receipt.rows.join('\n')).toMatch(/TOTAL +Rs 220.00\nCash +Rs 300.00\nChange +Rs 80.00/);
    expect(receipt.cuts).toBe(1); expect(receipt.finalTextClearance).toBeGreaterThanOrEqual(120);
  }
  expect(compact.feed).toBeLessThan(original.feed); expect(lines).toEqual(unchanged);
});
it('combines decimal quantities without floating point tails and preserves original per-line rounding', () => {
  const simple = paperLayout(receiptBytes([{ quantity: 0.1, price: 2000 }, { quantity: 0.2, price: 2000 }], 'other', 0, 58, new Date(), 'compact'));
  expect(simple.rows).toContainEqual(expect.stringMatching(/^1\. 0.3 x 20.00 +6.00$/));
  const rounded = paperLayout(receiptBytes([{ quantity: 1.25, price: 1550 }, { quantity: 1.25, price: 1550 }], 'cash', 5000, 58, new Date(), 'compact'));
  expect(rounded.rows).toContainEqual(expect.stringMatching(/^1\. 2.5 x 15.50 +38.76$/));
  expect(rounded.rows).toContain('Original line rounding retained');
  expect(rounded.rows.join('\n')).toMatch(/Subtotal +Rs 38.76\nRound up +Rs 0.24\nTOTAL +Rs 39.00\nCash +Rs 50.00\nChange +Rs 11.00/);
});

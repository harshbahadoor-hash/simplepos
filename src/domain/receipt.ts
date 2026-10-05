import { cashPayment, lineTotal, quantityUnits, subtotal, total, type Line } from './pos';
export type ReceiptLineMode = 'original' | 'compact';
const LINE_SPACING = 26;
// Match the previously confirmed four default 30-dot feeds after the last text.
const CUTTER_CLEARANCE = 120;
function encode(rows: string[]): Uint8Array {
  return new Uint8Array([27, 64, 27, 51, LINE_SPACING,
    ...new TextEncoder().encode(rows.join('\n') + '\n'),
    27, 74, CUTTER_CLEARANCE - LINE_SPACING, 29, 86, 0]);
}
export function testReceiptBytes(): Uint8Array {
  return encode(['BAHADOOR SIMPLE POS', 'Printer test OK']);
}
function printableLines(lines: Line[], mode: ReceiptLineMode) {
  if (mode === 'original') return { rows: lines.map(line => ({ quantity: String(line.quantity), price: line.price, amount: lineTotal(line) })), retainedRounding: false };
  const groups = new Map<number, { units: bigint; price: number; amount: number }>();
  for (const line of lines) {
    const group = groups.get(line.price) ?? { units: 0n, price: line.price, amount: 0 };
    group.units += BigInt(quantityUnits(String(line.quantity)));
    group.amount += lineTotal(line);
    groups.set(line.price, group);
  }
  let retainedRounding = false;
  const rows = [...groups.values()].map(group => {
    // Group already-rounded original amounts; printing must never change the charge.
    if ((group.units * BigInt(group.price) + 50n) / 100n !== BigInt(group.amount)) retainedRounding = true;
    const whole = group.units / 100n, fraction = group.units % 100n;
    const quantity = String(whole) + (fraction ? '.' + String(fraction).padStart(2, '0').replace(/0$/, '') : '');
    return { quantity, price: group.price, amount: group.amount };
  });
  return { rows, retainedRounding };
}
/** Layout and ESC/POS commands adapted from the ERP's receipt encoder. */
export function receiptBytes(lines: Line[], method: 'cash' | 'other', received: number, width: 58 | 80, date: Date, mode: ReceiptLineMode = 'original'): Uint8Array {
  const columns = width === 58 ? 32 : 48;
  const pair = (left: string, right: string) => left.length + right.length < columns ? left + ' '.repeat(columns - left.length - right.length) + right : left + '\n' + right.padStart(columns);
  const amount = total(lines);
  const rounding = amount - subtotal(lines);
  const printed = printableLines(lines, mode);
  const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Indian/Mauritius', dateStyle: 'short', timeStyle: 'short', hour12: false }).format(date);
  const body = ['BAHADOOR POOJA SHOP'.padStart(Math.floor((columns + 18) / 2)), stamp, '-'.repeat(columns),
    ...printed.rows.map((line, index) => pair(`${index + 1}. ${line.quantity} x ${(line.price / 100).toFixed(2)}`, (line.amount / 100).toFixed(2))),
    ...(printed.retainedRounding ? ['Original line rounding retained'] : []),
    '-'.repeat(columns), ...(rounding ? [pair('Subtotal', `Rs ${(subtotal(lines) / 100).toFixed(2)}`), pair('Round up', `Rs ${(rounding / 100).toFixed(2)}`)] : []), pair('TOTAL', `Rs ${(amount / 100).toFixed(2)}`),
    ...(method === 'cash' ? [pair('Cash', `Rs ${(received / 100).toFixed(2)}`), pair('Change', `Rs ${(cashPayment(amount, received).change / 100).toFixed(2)}`)] : ['Payment: Other']), 'Thank you'];
  return encode(body);
}

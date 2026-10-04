import { cashPayment, lineTotal, subtotal, total, type Line } from './pos';
/** Layout and ESC/POS commands adapted from the ERP's receipt encoder. */
export function receiptBytes(lines: Line[], method: 'cash' | 'other', received: number, width: 58 | 80, date: Date): Uint8Array {
  const columns = width === 58 ? 32 : 48;
  const pair = (left: string, right: string) => left.length + right.length < columns ? left + ' '.repeat(columns - left.length - right.length) + right : left + '\n' + right.padStart(columns);
  const amount = total(lines);
  const rounding = amount - subtotal(lines);
  const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Indian/Mauritius', dateStyle: 'short', timeStyle: 'short', hour12: false }).format(date);
  const body = ['BAHADOOR POOJA SHOP'.padStart(Math.floor((columns + 18) / 2)), '', stamp, '-'.repeat(columns),
    ...lines.map((line, index) => pair(`${index + 1}. ${line.quantity} x ${(line.price / 100).toFixed(2)}`, (lineTotal(line) / 100).toFixed(2))),
    '-'.repeat(columns), ...(rounding ? [pair('Subtotal', `Rs ${(subtotal(lines) / 100).toFixed(2)}`), pair('Round up', `Rs ${(rounding / 100).toFixed(2)}`)] : []), pair('TOTAL', `Rs ${(amount / 100).toFixed(2)}`), '',
    ...(method === 'cash' ? [pair('Cash', `Rs ${(received / 100).toFixed(2)}`), pair('Change', `Rs ${(cashPayment(amount, received).change / 100).toFixed(2)}`)] : ['Payment: Other']), '', 'Thank you', '\n\n\n'].join('\n');
  // Feed above has advanced the printed text past the cutter; GS V 0 cuts.
  return new Uint8Array([27, 64, ...new TextEncoder().encode(body), 29, 86, 0]);
}

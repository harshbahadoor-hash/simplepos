export type Line = { quantity: number; price: number };
export type Entry = { quantity: number; value: string; multiplied: boolean };
export const emptyEntry = (): Entry => ({ quantity: 1, value: '', multiplied: false });
function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Amount is too large or invalid.');
  return value;
}
export function parseMoney(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole = '0', fraction = ''] = value.split('.');
  return safe(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
export function lineTotal(line: Line): number {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('Quantity must be a positive whole number.');
  return safe(line.quantity * safe(line.price));
}
export function total(lines: Line[]): number { return lines.reduce((sum, line) => safe(sum + lineTotal(line)), 0); }
export function cashPayment(amount: number, received: number): { change: number; shortfall: number } {
  safe(amount); safe(received);
  return { change: Math.max(0, received - amount), shortfall: Math.max(0, amount - received) };
}
export function quickCash(amount: number): number[] {
  safe(amount);
  const values = [20000, 50000, 100000, 200000, 500000, 1000000].filter(value => value >= amount);
  for (let multiple = 1; values.length < 3; multiple++) {
    const value = safe((Math.ceil(amount / 100000) + multiple - 1) * 100000);
    if (!values.includes(value)) values.push(value);
  }
  return values.sort((a, b) => a - b).slice(0, 3);
}
export function enter(entry: Entry, key: string): Entry {
  if (key === 'Escape') return emptyEntry();
  if (key === 'Backspace') return { ...entry, value: entry.value.slice(0, -1) };
  if (key === '*' || key === 'x') {
    if (entry.multiplied || !/^\d+$/.test(entry.value) || Number(entry.value) < 1 || !Number.isSafeInteger(Number(entry.value))) throw new Error('Enter a positive whole quantity before ×.');
    return { quantity: Number(entry.value), value: '', multiplied: true };
  }
  if (!/^[0-9.]$/.test(key)) return entry;
  const value = (entry.value === '0' && key !== '.' ? '' : entry.value) + key;
  const normalized = value === '.' ? '0.' : value;
  parseMoney(normalized);
  return { ...entry, value: normalized };
}
export function entryLine(entry: Entry): Line {
  const line = { quantity: entry.quantity, price: parseMoney(entry.value) };
  if (line.price === 0) throw new Error('Enter a price greater than zero.');
  lineTotal(line);
  return line;
}
export const money = (cents: number): string => `Rs ${(safe(cents) / 100).toLocaleString('en-MU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

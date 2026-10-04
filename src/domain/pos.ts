export type Line = { quantity: number; price: number };
export type Entry = { quantity: number; quantityText?: string; value: string; multiplied: boolean };
export const emptyEntry = (): Entry => ({ quantity: 1, value: '', multiplied: false });
const MAX_MONEY = 9_999_999_999;
function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) throw new Error('Enter an amount between Rs 0 and Rs 99,999,999.99.');
  return value;
}
export function parseMoney(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole = '0', fraction = ''] = value.split('.');
  return safe(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
function quantityUnits(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) throw new Error('Quantity must be positive with at most two decimal places.');
  const [whole = '0', fraction = ''] = value.split('.');
  const units = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error('Enter a quantity greater than zero.');
  return units;
}
export function lineTotal(line: Line): number {
  const product = quantityUnits(String(line.quantity)) * safe(line.price);
  if (!Number.isSafeInteger(product) || product > Number.MAX_SAFE_INTEGER - 50) throw new Error('Quantity × price is too large.');
  // Quantity uses hundredths; round half a cent upward once per line.
  return safe(Math.floor((product + 50) / 100));
}
export function subtotal(lines: Line[]): number { return lines.reduce((sum, line) => safe(sum + lineTotal(line)), 0); }
export function total(lines: Line[]): number { return safe(Math.floor((subtotal(lines) + 99) / 100) * 100); }
export function cashPayment(amount: number, received: number): { change: number; shortfall: number } {
  safe(amount); safe(received);
  return { change: Math.max(0, received - amount), shortfall: Math.max(0, amount - received) };
}
export function quickCash(amount: number): number[] {
  safe(amount);
  const values = [20000, 50000, 100000, 200000, 500000, 1000000].filter(value => value >= amount);
  for (let multiple = 1; values.length < 3; multiple++) {
    const value = Math.min(MAX_MONEY, (Math.ceil(amount / 100000) + multiple - 1) * 100000);
    if (values.includes(value)) break;
    values.push(value);
  }
  return values.sort((a, b) => a - b).slice(0, 3);
}
export function enter(entry: Entry, key: string): Entry {
  if (key === '00') return enter(enter(entry, '0'), '0');
  if (key === 'Escape') return emptyEntry();
  if (key === 'Backspace') return { ...entry, value: entry.value.slice(0, -1) };
  if (key === '*' || key === 'x') {
    if (entry.multiplied) throw new Error('Quantity is already set. Clear input to start again, or edit the item.');
    return { quantity: quantityUnits(entry.value) / 100, quantityText: entry.value, value: '', multiplied: true };
  }
  if (!/^[0-9.]$/.test(key)) return entry;
  const value = (entry.value === '0' && key !== '.' ? '' : entry.value) + key;
  const normalized = value === '.' ? '0.' : value;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new Error('Use at most two decimal places.');
  if (normalized.length > 15) throw new Error('Input is too long. Check the price or quantity.');
  return { ...entry, value: normalized };
}
export function entryLine(entry: Entry): Line {
  const line = { quantity: entry.quantity, price: parseMoney(entry.value) };
  if (line.price === 0) throw new Error('Enter a price greater than zero.');
  lineTotal(line);
  return line;
}
export const money = (cents: number): string => `Rs ${(safe(cents) / 100).toLocaleString('en-MU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

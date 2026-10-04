import { total, type Line } from './pos';
const key = 'simplePosUnfinishedSale';
export function readDraft(): Line[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (!Array.isArray(raw) || raw.length > 1000) return [];
    const lines: Line[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || typeof item.quantity !== 'number' || typeof item.price !== 'number' || item.price <= 0) return [];
      lines.push({ quantity: item.quantity, price: item.price });
    }
    total(lines);
    return lines;
  } catch { return []; }
}
export function saveDraft(lines: Line[], completed: boolean) {
  try {
    if (completed || !lines.length) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(lines));
  } catch { /* A storage failure cannot stop a sale. */ }
}

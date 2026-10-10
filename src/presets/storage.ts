import { baselineDocument, validateDocument, type PresetDocument } from './model';
const cacheKey='simplePosPresetCacheV1', previousKey='simplePosPresetPreviousV1', activeKey='simplePosSalePresetV1';
export function cachedPresets(): PresetDocument {
  for (const key of [cacheKey,previousKey]) { try { const raw=localStorage.getItem(key); if(raw) return validateDocument(JSON.parse(raw)); } catch { /* Try the last valid configuration. */ } }
  return baselineDocument();
}
export function activePresets(): PresetDocument {
  try {
    const sale=sessionStorage.getItem('simplePosUnfinishedSale');
    const raw=sessionStorage.getItem(activeKey);
    if(sale && JSON.parse(sale).length && raw) return validateDocument(JSON.parse(raw));
  } catch { /* Recovery of a reference cache must not block selling. */ }
  return cachedPresets();
}
export function rememberPresets(document: PresetDocument): boolean {
  try {
    const checked = validateDocument(document);
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      let previous: PresetDocument | null = null;
      try { previous = validateDocument(JSON.parse(raw)); } catch { /* Keep the existing valid backup. */ }
      if (previous) localStorage.setItem(previousKey, JSON.stringify(previous));
    }
    localStorage.setItem(cacheKey, JSON.stringify(checked));
    return true;
  } catch { return false; }
}
export function retainSalePresets(document: PresetDocument, unfinished: boolean) {
  try { if(unfinished) sessionStorage.setItem(activeKey,JSON.stringify(document)); else sessionStorage.removeItem(activeKey); } catch { /* The live sale's prices remain in memory. */ }
}

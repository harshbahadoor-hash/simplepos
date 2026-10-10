import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { baselineDocument } from './model';
import { activePresets, cachedPresets, rememberPresets, retainSalePresets } from './storage';
function memory() { const values=new Map<string,string>(); return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}; }
beforeEach(()=>{vi.stubGlobal('localStorage',memory());vi.stubGlobal('sessionStorage',memory());});
afterEach(()=>vi.unstubAllGlobals());
test('corrupt newest cache recovers previous valid presets rather than zero prices',()=>{
  const old={...baselineDocument(),revision:1}; const next={...old,revision:2};
  expect(rememberPresets(old)).toBe(true);expect(rememberPresets(next)).toBe(true);
  localStorage.setItem('simplePosPresetCacheV1','<html>error</html>');
  expect(cachedPresets().revision).toBe(1);
});
test('unfinished sale retains its reference prices across remote updates and reload',()=>{
  const old={...baselineDocument(),revision:1}; rememberPresets(old);
  sessionStorage.setItem('simplePosUnfinishedSale',JSON.stringify([{quantity:1,price:11500}]));retainSalePresets(old,true);
  rememberPresets({...old,revision:7});
  expect(activePresets().revision).toBe(1);
  retainSalePresets(old,false);sessionStorage.removeItem('simplePosUnfinishedSale');
  expect(activePresets().revision).toBe(7);
});
test('blocked storage does not throw or pretend to save a cache',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}});
  expect(cachedPresets().roots).toHaveLength(2);expect(rememberPresets(baselineDocument())).toBe(false);
});

test('refreshing after corruption preserves the last valid recovery copy', () => {
  const good = { ...baselineDocument(), revision: 7 };
  rememberPresets(good);
  rememberPresets({ ...good, revision: 8 });
  localStorage.setItem('simplePosPresetCacheV1', 'corrupt');
  expect(cachedPresets().revision).toBe(7);
  expect(rememberPresets({ ...good, revision: 9 })).toBe(true);
  localStorage.setItem('simplePosPresetCacheV1', 'corrupt again');
  expect(cachedPresets().revision).toBe(7);
});

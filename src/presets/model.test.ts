import { expect, test } from 'vitest';
import { baselineDocument, validateDocument, findNode } from './model';
test('all current sizes and prices migrate with stable groups', () => {
  const doc = baselineDocument();
  const prices = (node: typeof doc.roots[number]): number => node.children.reduce((n, child) => n + (child.kind === 'item' ? 1 : prices(child)), 0);
  expect(doc.roots.map(root => [root.label, prices(root)])).toEqual([['Ghee', 40], ['Oil', 35]]);
  const cow = doc.roots[0]!.children.find(node => node.label === 'Cow ghee');
  expect(cow?.kind === 'group' && cow.children.map(node => node.kind === 'item' ? [node.label, node.priceCents] : null)).toEqual([['150 g',11500],['400 g',27500],['800 g',50000],['1.6 kg',90000]]);
  expect(findNode(doc, 'ghee')?.label).toBe('Ghee');
});
test('five presets total and direct size/price or price-only items', () => {
  const doc = baselineDocument();
  for (let i = 0; i < 3; i++) doc.roots.push({ key:`extra-${i}`,kind:'group',label:`Extra ${i}`,visible:true,children:[{key:`price-${i}`,kind:'item',label:'',visible:true,priceCents:5000+i}] });
  expect(validateDocument(doc).roots).toHaveLength(5);
  doc.roots.push({key:'sixth',kind:'group',label:'Sixth',visible:true,children:[]});
  expect(() => validateDocument(doc, {draft:true})).toThrow(/five/i);
});
test('reject duplicate keys, size labels, fractional or zero cents and deep paths', () => {
  const doc = baselineDocument(), first = doc.roots[0]!;
  first.children.push(structuredClone(first.children[0]!));
  expect(() => validateDocument(doc)).toThrow(/duplicate/i);
  const empty = { schemaVersion:1,revision:1,updatedAt:'2026-10-10T00:00:00Z',roots:[{key:'r',kind:'group',label:'Root',visible:true,children:[{key:'p',kind:'item',label:'500 ml',visible:true,priceCents:0}]}] };
  expect(() => validateDocument(empty)).toThrow(/price/i);
  empty.roots[0]!.children[0]!.priceCents = 10.5;
  expect(() => validateDocument(empty)).toThrow(/price/i);
});
test('draft empty groups are valid but cannot be published', () => {
  const doc = baselineDocument(); doc.roots.push({key:'new',kind:'group',label:'New',visible:true,children:[]});
  expect(validateDocument(doc, {draft:true}).roots).toHaveLength(3);
  expect(() => validateDocument(doc)).toThrow(/visible.*size|visible.*price|empty/i);
});

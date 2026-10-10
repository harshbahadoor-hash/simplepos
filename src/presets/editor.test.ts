import { expect, test } from 'vitest';
import type { PresetDocument, PresetGroup } from './model';
import { addNode, editNode, deleteNode, descendantCount, pathToNode, changesBetween, hasChanges, restoreDraft } from './editor';

const fixture = (): PresetDocument => ({
  schemaVersion: 1, revision: 7, updatedAt: '2026-10-10T00:00:00Z',
  roots: [
    { key: 'ghee', kind: 'group', label: 'Ghee', visible: true, children: [
      { key: 'brand', kind: 'group', label: 'Cow ghee', visible: true, children: [
        { key: 'size', kind: 'item', label: '150 g', visible: true, priceCents: 11500 },
      ] },
    ] },
    { key: 'oil', kind: 'group', label: 'Oil', visible: true, children: [
      { key: 'direct', kind: 'item', label: '100 ml', visible: true, priceCents: 9500 },
    ] },
  ],
});

test('direct price-only and named items need no brand and leave the source unchanged', () => {
  const base = fixture();
  const blank = addNode(base, 'ghee', { key: 'blank', kind: 'item', label: ' ', price: '12.50' });
  const named = addNode(blank, 'ghee', { key: 'named', kind: 'item', label: ' Incense sticks ', price: '35' });
  expect(named.roots[0]?.children.slice(1)).toEqual([
    { key: 'blank', kind: 'item', label: '', visible: true, priceCents: 1250 },
    { key: 'named', kind: 'item', label: 'Incense sticks', visible: true, priceCents: 3500 },
  ]);
  expect(base.roots[0]?.children).toHaveLength(1);
  expect(named.revision).toBe(7);
});

test('creating hidden groups and prices preserves the requested visibility', () => {
  const base = fixture();
  const group = { key: 'hidden-group', kind: 'group' as const, label: 'Seasonal', visible: false };
  const item = { key: 'hidden-price', kind: 'item' as const, label: 'Incense', price: '25', visible: false };
  const draft = addNode(addNode(base, null, group), 'hidden-group', item);
  expect(draft.roots[2]).toMatchObject({ key: 'hidden-group', visible: false, children: [{ key: 'hidden-price', visible: false, priceCents: 2500 }] });
  expect(base.roots).toHaveLength(2);
});

test('five root groups total includes Ghee and Oil even when a root is hidden', () => {
  let draft = editNode(fixture(), 'oil', { label: 'Oil', visible: false });
  for (let i = 0; i < 3; i++) draft = addNode(draft, null, { key: `new-${i}`, kind: 'group', label: `New ${i}` });
  expect(draft.roots).toHaveLength(5);
  expect(() => addNode(draft, null, { key: 'sixth', kind: 'group', label: 'Sixth' })).toThrow(/five/i);
});

test('allows four levels including price and leaves room for a price in every new group', () => {
  const typed = addNode(fixture(), 'oil', { key: 'type', kind: 'group', label: 'Mustard oil' });
  const branded = addNode(typed, 'type', { key: 'nested-brand', kind: 'group', label: 'RKG' });
  const priced = addNode(branded, 'nested-brand', { key: 'nested-price', kind: 'item', label: '500 ml', price: '95' });
  expect(pathToNode(priced, 'nested-price').map(node => node.label)).toEqual(['Oil', 'Mustard oil', 'RKG', '500 ml']);
  expect(() => addNode(priced, 'nested-brand', { key: 'too-deep', kind: 'group', label: 'Deeper' })).toThrow(/four|level/i);
});

test.each(['', '0', '-1', '12.999', '1e3', '12.', 'Infinity', '100000000'])('rejects invalid price %j without changing a draft', price => {
  const base = fixture();
  expect(() => editNode(base, 'size', { label: '150 g', price })).toThrow(/price|amount|decimal/i);
  expect(base.roots[0]?.children[0]).toMatchObject({ key: 'brand', label: 'Cow ghee' });
});

test('renames and reprices using stable internal keys', () => {
  const base = fixture();
  const renamed = editNode(base, 'brand', { label: 'Cow premium ghee', visible: false });
  const repriced = editNode(renamed, 'size', { label: '150 g pack', price: '130.29' });
  expect(repriced.roots[0]?.children[0]).toMatchObject({ key: 'brand', label: 'Cow premium ghee', visible: false, children: [
    { key: 'size', kind: 'item', label: '150 g pack', visible: true, priceCents: 13029 },
  ] });
  expect(base.roots[0]?.children[0]?.label).toBe('Cow ghee');
});

test('rejects duplicate sibling names and keys but permits labels in separate groups', () => {
  const base = fixture();
  expect(() => addNode(base, 'ghee', { key: 'duplicate', kind: 'group', label: 'COW GHEE' })).toThrow(/duplicate/i);
  expect(() => addNode(base, 'oil', { key: 'brand', kind: 'group', label: 'Other' })).toThrow(/key|duplicate/i);
  expect(addNode(base, 'oil', { key: 'other-brand', kind: 'group', label: 'Cow ghee' }).roots[1]?.children).toHaveLength(2);
});

test('rejects stale targets and items as parents instead of silently losing edits', () => {
  const base = fixture();
  expect(() => editNode(base, 'missing', { label: 'Missing' })).toThrow(/find|exist|found/i);
  expect(() => deleteNode(base, 'missing')).toThrow(/find|exist|found/i);
  expect(() => addNode(base, 'size', { key: 'child', kind: 'item', label: '', price: '3' })).toThrow(/group|parent/i);
  expect(() => addNode(base, null, { key: 'child', kind: 'item', label: '', price: '3' })).toThrow(/group|parent/i);
});

test('delete removes all descendants while the immutable previous draft restores them for Undo', () => {
  const before = fixture();
  expect(descendantCount(before.roots[0] as PresetGroup)).toEqual({ groups: 1, items: 1, total: 2 });
  const after = deleteNode(before, 'ghee');
  expect(after.roots.map(node => node.key)).toEqual(['oil']);
  expect(pathToNode(after, 'size')).toEqual([]);
  expect(before.roots[0]?.children[0]).toMatchObject({ key: 'brand', children: [{ key: 'size', priceCents: 11500 }] });
  expect(hasChanges(before, after)).toBe(true);
  expect(hasChanges(before, structuredClone(before))).toBe(false);
});

test('review describes prices with the full path and highlights substantial changes', () => {
  const base = fixture();
  const draft = editNode(base, 'size', { label: '150 g', price: '200' });
  expect(changesBetween(base, draft)).toEqual([
    { key: 'size', kind: 'price', path: 'Ghee / Cow ghee / 150 g', before: 'Rs 115.00', after: 'Rs 200.00', significant: true },
  ]);
  const small = editNode(base, 'size', { label: '150 g', price: '116' });
  expect(changesBetween(base, small)[0]?.significant).toBe(false);
});

test('review includes direct additions, renames, hidden entries and every removed descendant', () => {
  const base = fixture();
  let draft = editNode(base, 'brand', { label: 'Premium', visible: false });
  draft = deleteNode(draft, 'oil');
  draft = addNode(draft, 'ghee', { key: 'blank', kind: 'item', label: '', price: '20' });
  const changes = changesBetween(base, draft);
  expect(changes).toContainEqual({ key: 'blank', kind: 'add', path: 'Ghee / Rs 20.00', after: 'Rs 20.00' });
  expect(changes).toContainEqual({ key: 'brand', kind: 'label', path: 'Ghee / Premium', before: 'Cow ghee', after: 'Premium' });
  expect(changes).toContainEqual({ key: 'brand', kind: 'visibility', path: 'Ghee / Premium', before: 'Shown', after: 'Hidden' });
  expect(changes.filter(change => change.kind === 'delete').map(change => change.key)).toEqual(['oil', 'direct']);
});

test('restoring a draft preserves its original base even when the latest revision is different', () => {
  const base = fixture();
  const draft = editNode(base, 'size', { label: '150 g', price: '150' });
  const restored = restoreDraft(JSON.stringify({ base, draft }));
  expect(restored.base.revision).toBe(7);
  expect(restored.draft.roots[0]?.children[0]).toMatchObject({ children: [{ key: 'size', priceCents: 15000 }] });
});

test('draft recovery permits unfinished groups but rejects corrupt content and mismatched revisions', () => {
  const base = fixture();
  const draft = addNode(base, null, { key: 'new', kind: 'group', label: 'New' });
  expect(restoreDraft(JSON.stringify({ base, draft })).draft.roots).toHaveLength(3);
  expect(() => restoreDraft('{broken')).toThrow();
  expect(() => restoreDraft(JSON.stringify({ base, draft: { ...draft, revision: 8 } }))).toThrow(/revision/i);
  expect(() => restoreDraft(JSON.stringify({ base, draft: {} }))).toThrow();
});

test('a recovered stale draft retains the latest remote document for an explicit reload', () => {
  const base = fixture();
  const draft = editNode(base, 'size', { label: '150 g', price: '150' });
  const current = { ...fixture(), revision: 8 };
  expect(restoreDraft(JSON.stringify({ base, draft, current }))).toMatchObject({ base: { revision: 7 }, current: { revision: 8 } });
  expect(() => restoreDraft(JSON.stringify({ base, draft, current: {} }))).toThrow();
});

test('pending publication identity survives draft recovery bound to its original payload', () => {
  const base = fixture();
  const draft = editNode(base, 'size', { label: '150 g', price: '125' });
  const pending = { id: 'publication-request-1', fingerprint: JSON.stringify({ baseRevision: 7, roots: draft.roots }) };
  expect(restoreDraft(JSON.stringify({ base, draft, pending }))).toMatchObject({ pending });
});

test.each([
  null, [], {}, { id: '', fingerprint: 'payload' }, { id: 7, fingerprint: 'payload' },
  { id: 'bad\nkey', fingerprint: 'payload' }, { id: 'request-1', fingerprint: 7 },
  { id: 'request-1', fingerprint: 'another payload' },
].map(pending => ({ pending })))('rejects corrupt or mismatched pending publication metadata $pending', ({ pending }) => {
  const base = fixture();
  const draft = editNode(base, 'size', { label: '150 g', price: '125' });
  expect(() => restoreDraft(JSON.stringify({ base, draft, pending }))).toThrow(/publication|pending|request/i);
});

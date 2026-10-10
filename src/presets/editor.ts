import { findNode, labelFor, validateDocument, type PresetDocument, type PresetNode } from './model';
import { money, parseMoney } from '../domain/pos';

export type NewNode = { key: string; kind: 'group'; label: string; visible?: boolean } | { key: string; kind: 'item'; label: string; price: string; visible?: boolean };
export type NodeEdit = { label: string; price?: string; visible?: boolean };
export type PresetChange = { key: string; kind: 'add' | 'delete' | 'label' | 'price' | 'visibility'; path: string; before?: string; after?: string; significant?: boolean };
export type PendingPublication = { fingerprint: string; id: string };
export type PresetDraft = { base: PresetDocument; draft: PresetDocument; current?: PresetDocument; pending?: PendingPublication };
export const DRAFT_STORAGE_KEY = 'simplePosPresetDraftV1';

function positivePrice(text: string): number {
  const value = text.trim();
  if (value.endsWith('.')) throw new Error('Finish the price with at most two decimal places.');
  const cents = parseMoney(value);
  if (cents <= 0) throw new Error('Enter a price greater than zero.');
  return cents;
}

export function pathToNode(document: PresetDocument, key: string): PresetNode[] {
  function visit(nodes: PresetNode[], parents: PresetNode[]): PresetNode[] {
    for (const node of nodes) {
      const path = [...parents, node];
      if (node.key === key) return path;
      if (node.kind === 'group') {
        const found = visit(node.children, path);
        if (found.length) return found;
      }
    }
    return [];
  }
  return visit(document.roots, []);
}

export function addNode(document: PresetDocument, parentKey: string | null, input: NewNode): PresetDocument {
  const next = structuredClone(document);
  const parent = parentKey === null ? null : findNode(next, parentKey);
  if (parentKey !== null && parent?.kind !== 'group') throw new Error('Choose an existing parent group.');
  const depth = parentKey === null ? 0 : pathToNode(next, parentKey).length;
  if (input.kind === 'group') {
    if (depth >= 3) throw new Error('Use four levels including the price. Add a price at this level.');
    const group = { key: input.key, kind: 'group' as const, label: input.label.trim(), visible: input.visible ?? true, children: [] };
    if (parent?.kind === 'group') parent.children.push(group);
    else next.roots.push(group);
  } else {
    if (parent?.kind !== 'group') throw new Error('Prices must belong to a preset group.');
    parent.children.push({ key: input.key, kind: 'item', label: input.label.trim(), visible: input.visible ?? true, priceCents: positivePrice(input.price) });
  }
  return validateDocument(next, { draft: true });
}

export function editNode(document: PresetDocument, key: string, edit: NodeEdit): PresetDocument {
  const next = structuredClone(document);
  const node = findNode(next, key);
  if (!node) throw new Error('This entry could not be found.');
  node.label = edit.label.trim();
  if (edit.visible !== undefined) node.visible = edit.visible;
  if (node.kind === 'item' && edit.price !== undefined) node.priceCents = positivePrice(edit.price);
  return validateDocument(next, { draft: true });
}

export function deleteNode(document: PresetDocument, key: string): PresetDocument {
  const path = pathToNode(document, key);
  if (!path.length) throw new Error('This entry could not be found.');
  const next = structuredClone(document);
  const parent = path.at(-2);
  if (!parent) next.roots = next.roots.filter(node => node.key !== key);
  else {
    const group = findNode(next, parent.key);
    if (group?.kind === 'group') group.children = group.children.filter(node => node.key !== key);
  }
  return validateDocument(next, { draft: true });
}

export function descendantCount(node: PresetNode): { groups: number; items: number; total: number } {
  let groups = 0, items = 0;
  if (node.kind === 'group') {
    for (const child of node.children) {
      if (child.kind === 'group') groups++; else items++;
      const nested = descendantCount(child);
      groups += nested.groups; items += nested.items;
    }
  }
  return { groups, items, total: groups + items };
}

function entries(document: PresetDocument): Map<string, { node: PresetNode; path: string }> {
  const result = new Map<string, { node: PresetNode; path: string }>();
  function visit(nodes: PresetNode[], parents: string[]) {
    for (const node of nodes) {
      const path = [...parents, node.kind === 'item' ? labelFor(node) : node.label];
      result.set(node.key, { node, path: path.join(' / ') });
      if (node.kind === 'group') visit(node.children, path);
    }
  }
  visit(document.roots, []);
  return result;
}

export function changesBetween(base: PresetDocument, draft: PresetDocument): PresetChange[] {
  const before = entries(base), after = entries(draft), changes: PresetChange[] = [];
  for (const [key, entry] of before) {
    if (!after.has(key)) changes.push({ key, kind: 'delete', path: entry.path, before: entry.node.kind === 'item' ? money(entry.node.priceCents) : 'Group' });
  }
  for (const [key, { node, path }] of after) {
    const old = before.get(key)?.node;
    if (!old) {
      changes.push({ key, kind: 'add', path, after: node.kind === 'item' ? money(node.priceCents) : 'Group' });
      continue;
    }
    if (old.label !== node.label) changes.push({ key, kind: 'label', path, before: old.label || '(price only)', after: node.label || '(price only)' });
    if (old.visible !== node.visible) changes.push({ key, kind: 'visibility', path, before: old.visible ? 'Shown' : 'Hidden', after: node.visible ? 'Shown' : 'Hidden' });
    if (old.kind === 'item' && node.kind === 'item' && old.priceCents !== node.priceCents) {
      const difference = Math.abs(node.priceCents - old.priceCents);
      changes.push({ key, kind: 'price', path, before: money(old.priceCents), after: money(node.priceCents), significant: difference >= 50000 || difference >= old.priceCents * 0.5 });
    }
  }
  return changes;
}

export function hasChanges(base: PresetDocument, draft: PresetDocument): boolean {
  return JSON.stringify(base.roots) !== JSON.stringify(draft.roots);
}

export function publicationFingerprint(base: PresetDocument, draft: PresetDocument): string {
  return JSON.stringify({ baseRevision: base.revision, roots: draft.roots });
}

export function restoreDraft(text: string): PresetDraft {
  const input: unknown = JSON.parse(text);
  if (!input || typeof input !== 'object' || !('base' in input) || !('draft' in input)) throw new Error('Invalid saved preset draft.');
  const base = validateDocument(input.base), draft = validateDocument(input.draft, { draft: true });
  if (base.revision !== draft.revision) throw new Error('Saved draft revisions do not match.');
  const current = 'current' in input && input.current !== undefined ? validateDocument(input.current) : undefined;
  let pending: PendingPublication | undefined;
  if ('pending' in input && input.pending !== undefined) {
    const value = input.pending;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !('id' in value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)
      || !('fingerprint' in value) || value.fingerprint !== publicationFingerprint(base, draft)) {
      throw new Error('Invalid pending publication request or payload.');
    }
    pending = { id: value.id, fingerprint: value.fingerprint };
  }
  return { base, draft, ...(current ? { current } : {}), ...(pending ? { pending } : {}) };
}

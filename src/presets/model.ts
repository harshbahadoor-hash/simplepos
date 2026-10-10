import defaults from './defaults.json';
import { validateDocument } from './schema.mjs';
import { money } from '../domain/pos';
export { validateDocument };
export type PresetItem = { key: string; kind: 'item'; label: string; visible: boolean; priceCents: number };
export type PresetGroup = { key: string; kind: 'group'; label: string; visible: boolean; children: PresetNode[] };
export type PresetNode = PresetGroup | PresetItem;
export type PresetDocument = { schemaVersion: 1; revision: number; updatedAt: string; roots: PresetGroup[] };
export const baselineDocument = (): PresetDocument => validateDocument(defaults);
export function findNode(document: PresetDocument, key: string): PresetNode | undefined {
  const find = (nodes: PresetNode[]): PresetNode | undefined => {
    for (const node of nodes) { if (node.key === key) return node; if (node.kind === 'group') { const child = find(node.children); if (child) return child; } }
    return undefined;
  };
  return find(document.roots);
}
export function nodesAt(document: PresetDocument, parentKey: string | null): PresetNode[] {
  if (parentKey === null) return document.roots;
  const parent = findNode(document, parentKey); return parent?.kind === 'group' ? parent.children : [];
}
export const labelFor = (node: PresetItem) => node.label || money(node.priceCents);

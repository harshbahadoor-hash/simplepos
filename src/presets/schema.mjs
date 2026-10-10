const MAX_PRICE = 9_999_999_999;
const invalid = message => { throw new Error(message); };
/** Shared browser/server validation. No input is trusted merely because it is JSON. */
export function validateDocument(input, { draft = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid preset document.');
  if (input.schemaVersion !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt))) invalid('Unsupported preset format or revision.');
  if (!Array.isArray(input.roots) || input.roots.length > 5) invalid('Use up to five preset groups in total.');
  if (JSON.stringify(input).length > 1_048_576) invalid('Preset settings are too large (maximum 1 MiB).');
  const keys = new Set(); let count = 0;
  function nodes(values, depth, path) {
    const names = new Set();
    return values.map(node => {
      if (++count > 2000 || depth > 4) invalid('Use up to 2,000 entries and four menu levels.');
      if (!node || typeof node !== 'object' || Array.isArray(node) || !['group','item'].includes(node.kind)) invalid(`Invalid entry in ${path}.`);
      if (typeof node.key !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(node.key) || keys.has(node.key)) invalid(`Invalid or duplicate editor key in ${path}.`);
      keys.add(node.key);
      if (typeof node.label !== 'string' || node.label.length > 80 || /[\u0000-\u001f\u007f]/.test(node.label) || node.label !== node.label.trim() || (node.kind === 'group' && !node.label)) invalid(`Enter a name of 1–80 characters for ${path}. Size/item labels may be blank.`);
      if (typeof node.visible !== 'boolean') invalid(`Invalid visibility in ${path}.`);
      const name = node.label ? node.label.normalize('NFKC').toLocaleLowerCase() : `price:${node.priceCents}`;
      if (names.has(name)) invalid(`Duplicate name or size in ${path}: ${node.label || 'price-only entry'}.`);
      names.add(name);
      const base = { key: node.key, kind: node.kind, label: node.label, visible: node.visible };
      if (node.kind === 'item') {
        if (depth === 1) invalid('Prices must belong to a preset group.');
        if (!Number.isSafeInteger(node.priceCents) || node.priceCents <= 0 || node.priceCents > MAX_PRICE) invalid(`Enter a positive price with at most two decimals for ${node.label || path}.`);
        return { ...base, priceCents: node.priceCents };
      }
      if (!Array.isArray(node.children)) invalid(`Invalid entries in ${node.label}.`);
      const children = nodes(node.children, depth + 1, `${path} / ${node.label}`);
      const hasVisiblePrice = values => values.some(child => child.visible && (child.kind === 'item' || hasVisiblePrice(child.children)));
      if (!draft && node.visible && !hasVisiblePrice(children)) invalid(`Empty visible group: add a visible size or price to ${node.label}.`);
      return { ...base, children };
    });
  }
  const roots = nodes(input.roots, 1, 'Presets');
  if (!draft && !roots.some(root => root.visible)) invalid('Keep at least one visible preset group.');
  return { schemaVersion:1, revision:input.revision, updatedAt:input.updatedAt, roots };
}

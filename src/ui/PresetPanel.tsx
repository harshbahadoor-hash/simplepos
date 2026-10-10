import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../domain/presets';
import { money } from '../domain/pos';
import { findNode, labelFor, nodesAt, type PresetDocument } from '../presets/model';
import { PosButton as Button, preventTapThrough } from './PosButton';
import '../presets/panel.css';

/** A second checkout entrance: labels are reference data, never sale data. */
export function PresetPanel({ document, quantity, blocked, browse, choose }: {
  document: PresetDocument; quantity: number; blocked: boolean;
  browse: (active: boolean) => void;
  choose: (preset: Preset, path: string) => void;
}) {
  const [path, setPath] = useState<string[]>([]);
  const committed = useRef<{ key: string; at: number } | null>(null);
  const labels = path.map(key => findNode(document, key)?.label || '');
  const options = nodesAt(document, path.at(-1) ?? null).filter(node => node.visible);
  const prices = options.some(node => node.kind === 'item');
  useEffect(() => {
    const layout = matchMedia('(min-width:1100px) and (orientation:landscape)');
    const changed = () => { browse(layout.matches && path.length > 0); };
    layout.addEventListener('change', changed);
    return () => layout.removeEventListener('change', changed);
  }, [browse, path.length]);
  return <section className="preset-panel" aria-label="Quick presets">
    <div className="section-label">PRESETS<span>Qty {quantity}</span></div>
    <div className="preset-panel-nav">
      <Button disabled={!path.length} onClick={event => { preventTapThrough(event); setPath([]); browse(false); }}>All presets</Button>
      <Button disabled={!path.length} onClick={event => { preventTapThrough(event); setPath(path.slice(0, -1)); browse(path.length>1); }}>Back</Button>
    </div>
    <div className="preset-panel-heading" style={{ height: 72 + path.length * 24 }}>
      <strong title={labels.join(' / ')}>{labels.at(-1) || 'Choose a preset'}</strong>
      <small>{prices ? 'Tap a size or item to add' : path.length ? 'Choose a type or brand' : 'Choose a group'}</small>
    </div>
    <div className="preset-panel-options">
      {options.map(node => node.kind === 'group' ? <Button key={node.key} aria-label={`Open preset ${node.label}`} onClick={event => {
        preventTapThrough(event); browse(true); setPath([...path, node.key]);
      }}><strong title={node.label}>{node.label}</strong></Button> : <Button key={node.key} tone="positive" disabled={blocked}
        aria-label={`Add preset ${node.label ? `${node.label} · ` : ''}${money(node.priceCents)}`} onClick={event => {
          const now = Date.now();
          if (committed.current?.key === node.key && now - committed.current.at < 500) return;
          committed.current = { key: node.key, at: now };
          preventTapThrough(event);
          choose({ size: node.label, price: node.priceCents }, labels.join(' · '));
        }}>
          {node.label && <strong title={node.label}>{labelFor(node)}</strong>}<span>{money(node.priceCents)}</span>
        </Button>)}
    </div>
    {blocked && <p className="preset-panel-hint">Add or clear the current price; finish an item edit before choosing a preset.</p>}
  </section>;
}

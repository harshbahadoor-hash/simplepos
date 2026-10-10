import { useLayoutEffect, useRef, useState } from 'react';
import type { Preset } from '../domain/presets';
import { findNode, nodesAt, type PresetDocument } from '../presets/model';
import { money } from '../domain/pos';
import { Dialog } from './Dialog';
import { PosButton as Button, preventTapThrough } from './PosButton';

export function PresetPicker({ menu, document, quantity, choose, close }: { menu: string | null; document: PresetDocument; quantity: number; choose: (preset: Preset, label: string) => void; close: () => void }) {
  const [path,setPath]=useState<string[]>(menu?[menu]:[]);
  const heading = useRef<HTMLHeadingElement>(null);
  const labels=path.map(key=>findNode(document,key)?.label || '');
  const nodes=nodesAt(document,path.at(-1)??null).filter(node=>node.visible);
  const back=path.length>1 ? path.length===2 && path[0]==='oil' ? 'Back to oil types' : 'Back to brands' : path.length && !menu ? 'All presets' : null;
  const oilTypes=path.length===1 && path[0]==='oil';
  const allGroups=nodes.every(node=>node.kind==='group');
  const instruction=oilTypes?'Choose a type of oil':allGroups && (path[0]==='ghee' && path.length===1 || path[0]==='oil' && path.length===2)?'Choose a brand':allGroups?'Choose a group':'Choose a size or item';
  const headingText=path.length>1?`${labels.slice(1).join(' · ')} · ${instruction}`:path.length?instruction:'Choose a preset';
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [path]);
  return <Dialog title={labels[0]?`${labels[0]} presets`:'Presets'} className="preset-dialog" close={close}>
    <div className="preset-toolbar">
      <Button onClick={event => { preventTapThrough(event); close(); }}>Close presets</Button>
      {back && <Button onClick={event=>{preventTapThrough(event);setPath(path.slice(0,-1));}}>{back}</Button>}
      <span>Qty {quantity}</span>
    </div>
    <h3 ref={heading} tabIndex={-1}>{headingText}</h3>
    <div className={`preset-grid${oilTypes || !path.length?' preset-types':nodes.every(node=>node.kind==='item')?' preset-sizes':''}`}>
      {nodes.map(node=>node.kind==='group' ? <Button key={node.key} onClick={event=>{preventTapThrough(event);setPath([...path,node.key]);}}>{node.label}</Button> :
        <Button key={node.key} tone="positive" aria-label={node.label?`${node.label} · ${money(node.priceCents)}`:money(node.priceCents)} onClick={event=>{preventTapThrough(event);choose({size:node.label,price:node.priceCents},labels.join(' · '));}}>
          {node.label && <strong>{node.label}</strong>}<span>{money(node.priceCents)}</span></Button>)}
    </div>
  </Dialog>;
}

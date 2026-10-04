import { useLayoutEffect, useRef, useState } from 'react';
import { gheeBrands, type Preset, type PresetBrand } from '../domain/presets';
import { money } from '../domain/pos';
import { Dialog } from './Dialog';
import { PosButton as Button, preventTapThrough } from './PosButton';

export function GheePresets({ quantity, choose, close }: { quantity: number; choose: (preset: Preset, brand: string) => void; close: () => void }) {
  const [brand, setBrand] = useState<PresetBrand | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [brand]);
  return <Dialog title="Ghee presets" className="preset-dialog" close={close}>
    <div className="preset-toolbar"><Button onClick={event => { preventTapThrough(event); close(); }}>Close presets</Button>{brand && <Button onClick={event => { preventTapThrough(event); setBrand(null); }}>Back to brands</Button>}<span>Qty {quantity}</span></div>
    <h3 ref={heading} tabIndex={-1}>{brand ? `${brand.name} · Choose a size` : 'Choose a brand'}</h3>
    <div className={`preset-grid${brand ? ' preset-sizes' : ''}`}>{brand ? brand.options.map(option => {
      const label = option.size ? `${option.size} · ${money(option.price)}` : money(option.price);
      return <Button key={label} tone="positive" aria-label={label} onClick={event => { preventTapThrough(event); choose(option, brand.name); }}>{option.size && <strong>{option.size}</strong>}<span>{money(option.price)}</span></Button>;
    }) : gheeBrands.map(current => <Button key={current.name} onClick={event => { preventTapThrough(event); setBrand(current); }}>{current.name}</Button>)}</div>
  </Dialog>;
}

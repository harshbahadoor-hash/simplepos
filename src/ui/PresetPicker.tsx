import { useLayoutEffect, useRef, useState } from 'react';
import { gheeBrands, oilTypes, type Preset, type PresetBrand, type PresetCategory, type PresetMenu } from '../domain/presets';
import { money } from '../domain/pos';
import { Dialog } from './Dialog';
import { PosButton as Button, preventTapThrough } from './PosButton';

export function PresetPicker({ menu, quantity, choose, close }: { menu: PresetMenu; quantity: number; choose: (preset: Preset, label: string) => void; close: () => void }) {
  const [category, setCategory] = useState<PresetCategory | null>(null);
  const [brand, setBrand] = useState<PresetBrand | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const options = brand?.options ?? category?.options;
  const brands = menu === 'ghee' ? gheeBrands : category?.brands;
  const label = [category?.name, brand?.name].filter(Boolean).join(' · ');
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [category, brand]);
  return <Dialog title={menu === 'ghee' ? 'Ghee presets' : 'Oil presets'} className="preset-dialog" close={close}>
    <div className="preset-toolbar">
      <Button onClick={event => { preventTapThrough(event); close(); }}>Close presets</Button>
      {brand ? <Button onClick={event => { preventTapThrough(event); setBrand(null); }}>Back to brands</Button> : category && <Button onClick={event => { preventTapThrough(event); setCategory(null); }}>Back to oil types</Button>}
      <span>Qty {quantity}</span>
    </div>
    <h3 ref={heading} tabIndex={-1}>{options ? `${label} · Choose a size` : category ? `${category.name} · Choose a brand` : menu === 'oil' ? 'Choose a type of oil' : 'Choose a brand'}</h3>
    <div className={`preset-grid${options ? ' preset-sizes' : !brands ? ' preset-types' : ''}`}>
      {options ? options.map(option => {
        const optionLabel = `${option.size} · ${money(option.price)}`;
        return <Button key={optionLabel} tone="positive" aria-label={optionLabel} onClick={event => { preventTapThrough(event); choose(option, label); }}><strong>{option.size}</strong><span>{money(option.price)}</span></Button>;
      }) : brands ? brands.map(current => <Button key={current.name} onClick={event => { preventTapThrough(event); setBrand(current); }}>{current.name}</Button>) : oilTypes.map(current => <Button key={current.name} onClick={event => { preventTapThrough(event); setCategory(current); }}>{current.name}</Button>)}
    </div>
  </Dialog>;
}

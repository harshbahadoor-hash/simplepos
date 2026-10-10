import { useLayoutEffect, useRef } from 'react';
import { PosButton as Button, preventTapThrough } from './PosButton';
import { sound } from '../sound/sound-manager';

export type PresetForm = {
  mode: 'add' | 'edit'; kind: 'group' | 'item'; key: string; parentKey: string | null;
  label: string; price: string; visible: boolean;
  initialLabel: string; initialPrice: string; initialVisible: boolean;
};

export function PresetEditor({ form, path, busy, error, update, save, cancel }: {
  form: PresetForm; path: string; busy: boolean; error: string;
  update: (patch: Partial<Pick<PresetForm, 'label' | 'price' | 'visible'>>) => void;
  save: () => void; cancel: () => void;
}) {
  const label = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { label.current?.focus({ preventScroll: true }); }, [form.key]);
  const priceError = form.kind === 'item' && /price|amount|decimal/i.test(error);
  return <form className="pm-editor" noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); save(); }}>
    <h3>{form.mode === 'edit' ? 'Edit' : 'Add'} {form.kind === 'group' ? 'group, type or brand' : 'price'}</h3>
    <p className="pm-path">In: {path}</p>
    <fieldset disabled={busy}>
      <label htmlFor="pm-entry-label">{form.kind === 'group' ? 'Group name' : 'Size or item name (optional)'}</label>
      <input ref={label} id="pm-entry-label" aria-label={form.kind === 'group' ? 'Group name' : 'Size or item name'}
        value={form.label} maxLength={80} autoComplete="off" aria-describedby="pm-label-help"
        aria-invalid={!!error && !priceError} onChange={event => update({ label: event.target.value })} />
      <p id="pm-label-help" className="pm-hint">{form.kind === 'group'
        ? 'Use any category, type or brand name, for example Pooja items or Mustard oil.'
        : 'For example: 500 ml, Incense sticks, or leave blank for a price-only entry. No brand is required.'}</p>
      {form.kind === 'item' && <>
        <label htmlFor="pm-entry-price">Price (Rs)</label>
        <input id="pm-entry-price" aria-label="Price (Rs)" inputMode="decimal" autoComplete="off" value={form.price}
          aria-invalid={!!error && priceError} aria-describedby="pm-price-help" onChange={event => update({ price: event.target.value })} />
        <p id="pm-price-help" className="pm-hint">A positive amount with at most two decimal places, for example 25 or 125.50.</p>
      </>}
      {form.mode === 'edit' && <label className="pm-checkbox">
        <input type="checkbox" checked={form.visible} onChange={event => { sound.playTap(); update({ visible: event.target.checked }); }} />
        Show in checkout
      </label>}
    </fieldset>
    <div className="pm-form-actions">
      <Button type="button" disabled={busy} onClick={event => { preventTapThrough(event, true); cancel(); }}>Cancel editing</Button>
      <Button type="submit" className="primary" tone="positive" disabled={busy}>Save to draft</Button>
    </div>
  </form>;
}

import type { RefObject } from 'react';
import { entryLine, lineTotal, money, type Entry } from '../domain/pos';
import { sound } from '../sound/sound-manager';
import { PosButton as Button } from './PosButton';

export function Calculator({ entry, editing, focus, setEntry, keypress, add, cancel }: {
  entry: Entry; editing: number | null; focus: RefObject<HTMLOutputElement | null>;
  setEntry: (entry: Entry) => void; keypress: (key: string) => void; add: () => void; cancel: () => void;
}) {
  let pending: number | null = null;
  try { pending = lineTotal(entryLine(entry)); } catch { /* Disabled until valid. */ }
  return <section className="calculator" aria-label="Calculator">
    <div className="section-label">{editing === null ? 'ENTER A PRICE' : `EDITING ITEM ${editing + 1}`}</div>
    <div className="entry-display-row">
      <div className="display"><small><span data-testid="quantity-display">Qty <strong>{entry.quantity}</strong></span> × unit price · Rs</small><output ref={focus} tabIndex={-1} aria-live="polite">{entry.value || '0'}</output></div>
      <Button className="quantity-display times-button" aria-label="Multiply" onClick={() => keypress('*')}><span className="times-symbol" aria-hidden="true">×</span><span>Times</span></Button>
    </div>
    {editing !== null && <div className="entry-actions"><label>Quantity<input aria-label="Quantity" inputMode="decimal" value={entry.quantityText ?? String(entry.quantity)} onChange={event => { sound.playTap(); setEntry({ ...entry, quantityText: event.target.value, quantity: /^\d+(?:\.\d{0,2})?$/.test(event.target.value) ? Number(event.target.value) : 0 }); }} /></label><label>Unit price<input aria-label="Unit price" inputMode="decimal" value={entry.value} onChange={event => { sound.playTap(); setEntry({ ...entry, value: event.target.value }); }} /></label></div>}
    <div className="keypad-zone">
      <div className="keypad">{['7','8','9','4','5','6','1','2','3','0','.','⌫'].map(value => <Button key={value} onClick={() => keypress(value === '⌫' ? 'Backspace' : value)}>{value}</Button>)}</div>
      <Button className="primary add" aria-label={editing === null ? '+ Add Item' : 'Save Item'} disabled={pending === null} tone="positive" onClick={add}>
        <span className="add-icon" aria-hidden="true">{editing === null ? '+' : '✓'}</span><span className="add-label">{editing === null ? 'Add Item' : 'Save Item'}</span>
        <span className="add-amount">{pending === null ? (entry.value ? 'Check input' : 'Enter a price') : money(pending)}</span><span className="add-hint" aria-hidden="true">Enter ↵</span>
      </Button>
    </div>
    <div className="entry-actions"><Button onClick={() => keypress('Escape')}>Clear input</Button>{editing !== null && <Button onClick={cancel}>Cancel edit</Button>}</div>
  </section>;
}

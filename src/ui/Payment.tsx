import { cashPayment, money, parseMoney, quickCash } from '../domain/pos';
import { PosButton as Button, preventTapThrough } from './PosButton';
import { sound } from '../sound/sound-manager';
import type { ReceiptLineMode } from '../domain/receipt';

export function Payment({ total, cash, method, complete, busy, printed, printSkipped, receiptMode, setReceiptMode, setCash, setMethod, keypress, finish, back, print, next }: {
  total: number; cash: string; method: 'cash' | 'other'; complete: boolean; busy: boolean; printed: boolean; printSkipped: boolean;
  setCash: (value: string) => void; setMethod: (method: 'cash' | 'other') => void; keypress: (key: string) => void;
  receiptMode: ReceiptLineMode; setReceiptMode: (mode: ReceiptLineMode) => void;
  finish: (withPrinting: boolean) => void; back: () => void; print: () => void; next: () => void;
}) {
  let received: number | null = null;
  try { if (cash && !cash.endsWith('.')) received = parseMoney(cash); } catch { /* Invalid cash cannot show change. */ }
  const payment = received === null ? null : cashPayment(total, received);
  return <section className={`payment ${complete ? 'completed-payment' : 'cash-payment'}`}>
    <div className="payment-input"><small>{complete ? 'Sale complete' : 'PAYMENT'}</small><h1>{money(total)}</h1>
      {!complete && <><div className="entry-actions"><Button className={method === 'cash' ? 'selected' : ''} aria-pressed={method === 'cash'} onClick={() => setMethod('cash')}>Cash</Button><Button className={method === 'other' ? 'selected' : ''} aria-pressed={method === 'other'} onClick={() => setMethod('other')}>Other</Button></div>
        {method === 'cash' ? <><label>Cash received<input aria-label="Cash received" inputMode="none" autoComplete="off" value={cash} onChange={event => { sound.playTap(); setCash(event.target.value); }} /></label>
          <div className="shortcuts"><Button tone="positive" onClick={() => setCash((total / 100).toFixed(2))}>Exact</Button>{quickCash(total).map(value => <Button key={value} aria-label={`Cash ${value / 100}`} onClick={() => setCash((value / 100).toFixed(2))}>{value / 100}</Button>)}</div>
          <div className="keypad cash-keypad" role="group" aria-label="Cash keypad">{['7','8','9','4','5','6','1','2','3','0','.','⌫'].map(key => <Button key={key} onClick={() => keypress(key === '⌫' ? 'Backspace' : key)}>{key}</Button>)}</div><Button className="clear-cash" onClick={() => setCash('')}>Clear cash</Button>
        </> : <p className="other-reminder">Verify the card or mobile payment was received before completing this sale.</p>}
      </>}
      {complete && <div className="receipt-format"><small>RECEIPT LINES</small><div role="group" aria-label="Receipt line format"><Button disabled={busy} className={receiptMode === 'original' ? 'selected' : ''} aria-pressed={receiptMode === 'original'} onClick={() => setReceiptMode('original')}>Original</Button><Button disabled={busy} className={receiptMode === 'compact' ? 'selected' : ''} aria-pressed={receiptMode === 'compact'} onClick={() => setReceiptMode('compact')}>Combine same prices</Button></div><p>Combines equal unit prices for printing only.</p></div>}
    </div>
    <div className="payment-summary">
      {method === 'cash' ? complete || (payment && !payment.shortfall) ? <div className="change"><span>CHANGE</span><strong data-testid="change">{money(payment?.change ?? 0)}</strong>{complete && <small>Cash received {money(received ?? 0)}</small>}</div> : <div className="due"><span>STILL DUE</span><strong data-testid="due">{money(payment?.shortfall ?? total)}</strong><small>{received === null && cash ? 'Enter a valid cash amount.' : 'Enter cash received or choose Exact.'}</small></div> : <div className="change"><span>PAYMENT</span><strong className="other-label">Other</strong></div>}
      {!complete ? <><Button className="primary" tone="positive" disabled={busy} onClick={event => { preventTapThrough(event, true); finish(true); }}>Complete & Print</Button><Button className="complete-no-print" tone="positive" disabled={busy} onClick={event => { preventTapThrough(event, true); finish(false); }}>Complete Without Printing</Button><Button onClick={event => { preventTapThrough(event, true); back(); }}>Back to sale</Button></> : <><Button disabled={busy} onClick={print}>{busy ? 'Printing…' : printed ? 'Print Again' : printSkipped ? 'Print Receipt' : 'Retry Print'}</Button>{!printed && !printSkipped && <Button disabled={busy} onClick={event => { preventTapThrough(event, true); next(); }}>Continue Without Printing</Button>}<div className="new-sale-area"><p>Check the change before starting the next customer.</p><Button className="primary" tone="positive" disabled={busy} onClick={event => { preventTapThrough(event, true); next(); }}>New Sale</Button></div></>}
    </div>
  </section>;
}

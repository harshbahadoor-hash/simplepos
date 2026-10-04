import { useEffect, useRef, useState } from 'react';
import { cashPayment, emptyEntry, enter, entryLine, lineTotal, money, parseMoney, quickCash, total, type Line } from './domain/pos';
import { PosButton as Button } from './ui/PosButton';
import { sound } from './sound/sound-manager';
import { printer } from './printer/adapter';
import { receiptBytes } from './domain/receipt';
import { readDraft, saveDraft } from './domain/draft';

export default function App() {
  const [entry, setEntry] = useState(emptyEntry);
  const [lines, setLines] = useState<Line[]>(readDraft);
  const [stage, setStage] = useState<'sale' | 'payment' | 'complete'>('sale');
  const [cash, setCash] = useState('');
  const [method, setMethod] = useState<'cash' | 'other'>('cash');
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<Line[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [clear, setClear] = useState(false);
  const [sounds, setSounds] = useState(sound.isEnabled());
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<{name: string; address: string}[]>([]);
  const [printerName, setPrinterName] = useState(() => { try { return localStorage.getItem('simplePosPrinterName') || ''; } catch { return ''; } });
  const [paper, setPaper] = useState<58 | 80>(() => { try { return localStorage.getItem('simplePosPaper') === '80' ? 80 : 58; } catch { return 58; } });
  const [busy, setBusy] = useState(false);
  const printing = useRef(false);
  const completedAt = useRef(new Date());
  const amount = total(lines);
  let received = 0;
  try { received = cash ? parseMoney(cash) : 0; } catch { /* Invalid input is shown on completion. */ }
  const payment = cashPayment(amount, received);
  useEffect(() => { saveDraft(lines, stage === 'complete'); }, [lines, stage]);
  useEffect(() => {
    if (!settings && !clear) return;
    const previous = document.activeElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled), input, select') ?? []);
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { sound.playTap(); setSettings(false); setClear(false); }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous instanceof HTMLElement) previous.focus(); };
  }, [settings, clear]);
  function fail(error: unknown) { sound.playError(); setMessage(error instanceof Error ? error.message : 'Please try again.'); }
  function key(value: string) { try { setEntry(enter(entry, value)); setMessage(''); } catch (error) { fail(error); } }
  function add() {
    try {
      const line = entryLine(entry);
      const next = editing === null ? [...lines, line] : lines.map((item, index) => index === editing ? line : item);
      total(next);
      setLines(next); setEntry(emptyEntry()); setEditing(null); setUndo(null); setMessage('');
    } catch (error) { fail(error); }
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (stage !== 'sale' || settings || clear || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).matches('input, select, textarea')) return;
      if (event.key === 'Enter' && (event.target as HTMLElement).closest('button')) return;
      if (/^[0-9.*x]$/.test(event.key) || ['Backspace', 'Escape', 'Enter'].includes(event.key)) {
        event.preventDefault(); sound.play(event.key === 'Enter' ? 'positive' : 'tap');
        if (event.key !== 'Enter' && event.target instanceof HTMLElement && event.target.closest('button')) event.target.blur();
        if (event.key === 'Enter') add(); else key(event.key);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  function newSale() { setLines([]); setEntry(emptyEntry()); setStage('sale'); setCash(''); setEditing(null); setUndo(null); setMessage(''); }
  async function print(test = false) {
    if (printing.current) return;
    printing.current = true; setBusy(true);
    try {
      await printer.printReceipt(test ? new Uint8Array([27, 64, ...new TextEncoder().encode('BAHADOOR SIMPLE POS\nPrinter test OK\n\n\n\n')]) : receiptBytes(lines, method, received, paper, completedAt.current));
      setMessage(test ? 'Test sent to printer.' : 'Receipt sent to printer.'); sound.playPositive();
    } catch (error) { fail(error); }
    finally { setConnected(printer.isConnected()); setBusy(false); printing.current = false; }
  }
  async function connect(address?: string, name?: string) {
    if (printing.current) return;
    printing.current = true; setBusy(true);
    try {
      const selected = await printer.connect(address);
      const label = name || selected;
      setPrinterName(label); setConnected(true);
      const width = /80/.test(label) ? 80 : 58;
      setPaper(width);
      try { localStorage.setItem('simplePosPrinterName', label); localStorage.setItem('simplePosPaper', String(width)); if (address) localStorage.setItem('simplePosPrinterAddress', address); } catch { /* Preferences are optional. */ }
      setMessage('Printer connected.'); sound.playPositive();
    } catch (error) { fail(error); }
    finally { setBusy(false); printing.current = false; }
  }
  async function openSettings() {
    setSettings(true);
    try { setDevices(await printer.list()); } catch (error) { fail(error); }
  }
  function complete() {
    try {
      if (method === 'cash') {
        const result = cashPayment(amount, parseMoney(cash));
        if (result.shortfall) throw new Error(`Cash received is ${money(result.shortfall)} short.`);
      }
      if (stage !== 'payment') return;
      completedAt.current = new Date(); setStage('complete'); void print();
    } catch (error) { fail(error); }
  }
  return <main>
    <header><div><span className="brand-mark">B</span><div><strong>BAHADOOR</strong><small>SIMPLE CALCULATOR POS</small></div></div><Button onClick={() => void openSettings()}>Printer ● {connected ? 'Connected' : 'Disconnected'} · Settings</Button></header>
    {stage === 'sale' ? <>
      <div className="workspace">
        <section className="calculator" aria-label="Calculator">
          <div className="section-label">{editing === null ? 'ENTER A PRICE' : `EDIT ITEM ${editing + 1}`}<span>Quantity {entry.quantity}</span></div>
          <div className="display"><small>{entry.multiplied ? `${entry.quantity} × unit price` : 'Unit price · Rs'}</small><output aria-live="polite">{entry.value || '0'}</output></div>
          {editing !== null && <div className="entry-actions"><label>Quantity<input aria-label="Quantity" inputMode="numeric" value={entry.quantity || ''} onChange={event => { sound.playTap(); setEntry({ ...entry, quantity: Number(event.target.value) }); }} /></label><label>Unit price<input aria-label="Unit price" inputMode="decimal" value={entry.value} onChange={event => { sound.playTap(); setEntry({ ...entry, value: event.target.value }); }} /></label></div>}
          <div className="keypad">{['7','8','9','4','5','6','1','2','3','0','.','⌫'].map(value => <Button key={value} onClick={() => key(value === '⌫' ? 'Backspace' : value)}>{value}</Button>)}</div>
          <div className="entry-actions"><Button onClick={() => key('*')}>× Quantity</Button><Button onClick={() => key('Escape')}>Clear input</Button></div>
          <Button className="primary add" tone="positive" onClick={add}>{editing === null ? '+ Add Item' : 'Save Item'}</Button>
        </section>
        <section className="basket" aria-label="Current sale"><div className="section-label">CURRENT SALE<span>{lines.length} items</span></div>
          <div className="items">{lines.length === 0 ? <div className="empty"><span>＋</span><h2>Ready for your next customer</h2><p>Enter a price, then add an item.</p><small>Try 10 Enter · 2 × 20 Enter</small></div> : lines.map((line, index) => <article key={index}><div><strong>Item {index + 1}</strong><small>{line.quantity} × {money(line.price)}</small></div><strong>{money(lineTotal(line))}</strong><Button aria-label={`Edit Item ${index + 1}`} onClick={() => { setEditing(index); setEntry({ quantity: line.quantity, value: (line.price / 100).toFixed(2), multiplied: true }); }}>Edit</Button><Button tone="delete" aria-label={`Delete Item ${index + 1}`} onClick={() => { setUndo(lines); setLines(lines.filter((_, i) => i !== index)); setEditing(null); setEntry(emptyEntry()); }}>✕</Button></article>)}</div>
          <div className="basket-tools">{undo && <Button onClick={() => { setLines(undo); setUndo(null); setEditing(null); setEntry(emptyEntry()); }}>Undo removal</Button>}<Button disabled={!lines.length} onClick={() => setClear(true)}>Clear sale</Button></div>
          <div className="total"><span>TOTAL</span><strong data-testid="total">{money(amount)}</strong></div>
          <Button className="primary pay" tone="positive" disabled={!lines.length} onClick={() => { setStage('payment'); setMessage(''); }}>Pay — {money(amount)}</Button>
        </section>
      </div>
      <footer>Quantity defaults to 1 <span>Enter to add · × for quantity · Esc to clear</span></footer>
    </> : <section className="payment"><small>{stage === 'complete' ? 'Sale complete' : 'PAYMENT'}</small><h1>{money(amount)}</h1>
      {stage === 'payment' && <><div className="entry-actions"><Button className={method === 'cash' ? 'selected' : ''} onClick={() => setMethod('cash')}>Cash</Button><Button className={method === 'other' ? 'selected' : ''} onClick={() => setMethod('other')}>Other</Button></div>
        {method === 'cash' && <><label>Cash received<input aria-label="Cash received" inputMode="decimal" value={cash} onChange={event => { sound.playTap(); setCash(event.target.value); }} /></label><div className="shortcuts"><Button tone="positive" onClick={() => setCash((amount / 100).toFixed(2))}>Exact</Button>{quickCash(amount).map(value => <Button key={value} onClick={() => setCash(String(value / 100))}>{value / 100}</Button>)}</div></>}
      </>}
      {method === 'cash' && <div className="change"><span>CHANGE</span><strong data-testid="change">{money(payment.change)}</strong></div>}
      {stage === 'payment' ? <><Button className="primary" tone="positive" disabled={busy} onClick={complete}>Complete & Print</Button><Button onClick={() => setStage('sale')}>Back to sale</Button></> : <><Button disabled={busy} onClick={() => void print()}>{busy ? 'Printing…' : message.startsWith('Receipt sent') ? 'Print Again' : 'Retry Print'}</Button>{!message.startsWith('Receipt sent') && <Button disabled={busy} onClick={() => setMessage('Sale complete. Change stays visible until New Sale.')}>Continue Without Printing</Button>}<Button className="primary" tone="positive" disabled={busy} onClick={newSale}>New Sale</Button></>}
    </section>}
    {message && <div className="message" role="status">{message}</div>}
    {clear && <div className="overlay"><section role="dialog" aria-modal="true" aria-label="Clear current sale"><h2>Clear current sale?</h2><p>All current items will be removed.</p><Button onClick={() => setClear(false)}>Cancel</Button><Button tone="delete" onClick={() => { newSale(); setClear(false); }}>Clear</Button></section></div>}
    {settings && <div className="overlay"><section role="dialog" aria-modal="true" aria-label="Printer settings"><h2>Printer settings</h2><p>Selected: {printerName || 'None'} · {connected ? 'Connected' : 'Disconnected'}</p>{devices.map(device => <Button disabled={busy} key={device.address} onClick={() => void connect(device.address, device.name)}>{device.name || device.address}</Button>)}<Button disabled={busy} onClick={() => void connect()}>Change Printer (BLE)</Button><p>For Bluetooth Classic, use the Android app and pair the printer in Android settings.</p><div className="entry-actions">{([58,80] as const).map(width => <Button key={width} className={paper === width ? 'selected' : ''} onClick={() => { setPaper(width); try { localStorage.setItem('simplePosPaper', String(width)); } catch { /* Optional. */ } }}>{width} mm</Button>)}</div><Button disabled={busy || !connected} onClick={() => void print(true)}>Test Print</Button><Button disabled={busy || !connected} onClick={() => { void printer.disconnect().then(() => setConnected(false)).catch(fail); }}>Disconnect</Button><Button onClick={() => { sound.setEnabled(!sounds); setSounds(!sounds); }}>Button Sounds · {sounds ? 'ON' : 'OFF'}</Button><Button onClick={() => setSettings(false)}>Done</Button></section></div>}
  </main>;
}

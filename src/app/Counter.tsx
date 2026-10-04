import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { emptyEntry, enter, entryLine, lineTotal, money, parseMoney, subtotal, total, type Line } from '../domain/pos';
import { readDraft, saveDraft } from '../domain/draft';
import { receiptBytes } from '../domain/receipt';
import { printer } from '../printer/adapter';
import { sound } from '../sound/sound-manager';
import { PosButton as Button } from '../ui/PosButton';
import { Calculator } from '../ui/Calculator';
import { Payment } from '../ui/Payment';
import { Dialog } from '../ui/Dialog';
import { PresetPicker } from '../ui/PresetPicker';
import type { Preset, PresetMenu } from '../domain/presets';
import { applyUpdate, canUpdate, updateReady } from './updates';

type SaleLine = Line & { id: string };
type Phase = 'sale' | 'payment' | 'complete';
type Receipt = { lines: SaleLine[]; method: 'cash' | 'other'; received: number; date: Date };
const identify = (line: Line): SaleLine => ({ ...line, id: crypto.randomUUID() });
function preference(key: string) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Optional preferences. */ } }

export default function Counter() {
  const [entry, setEntry] = useState(emptyEntry);
  const [lines, setLines] = useState<SaleLine[]>(() => readDraft().map(identify));
  const [stage, setStage] = useState<Phase>('sale');
  const phase = useRef<Phase>('sale');
  const [cash, setCash] = useState('');
  const [method, setMethod] = useState<'cash' | 'other'>('cash');
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<{ lines: SaleLine[]; label: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'clear' | 'printer' | 'new-sale' | 'presets' | null>(null);
  const [presetMenu, setPresetMenu] = useState<PresetMenu>('ghee');
  const closeDialog = useCallback(() => setDialog(null), []);
  const [sounds, setSounds] = useState(sound.isEnabled());
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<{ name: string; address: string }[]>([]);
  const [printerName, setPrinterName] = useState(() => preference('simplePosPrinterName'));
  const [address, setAddress] = useState(() => preference('simplePosPrinterAddress'));
  const [paper, setPaper] = useState<58 | 80>(() => preference('simplePosPaper') === '80' ? 80 : 58);
  const [busy, setBusy] = useState(false);
  const [printed, setPrinted] = useState(false);
  const printing = useRef(false);
  const receipt = useRef<Receipt | null>(null);
  const focus = useRef<HTMLOutputElement>(null);
  const basket = useRef<HTMLDivElement>(null);
  const consumedEntry = useRef(false);
  const presetCommitted = useRef(false);
  const amount = total(lines);
  const [hasUpdate, setHasUpdate] = useState(updateReady);
  const safeUpdate = canUpdate({ stage, count: lines.length, entry: entry.value, multiplied: entry.multiplied, editing: editing !== null, busy, dialog: dialog !== null });
  const updateBoundary = useRef(false);
  useLayoutEffect(() => { updateBoundary.current = safeUpdate; }, [safeUpdate]);
  useEffect(() => {
    const changed = () => setHasUpdate(updateReady());
    window.addEventListener('simplepos-update', changed);
    return () => window.removeEventListener('simplepos-update', changed);
  }, []);
  const editingIndex = editing === null ? null : lines.findIndex(line => line.id === editing);

  useEffect(() => { saveDraft(lines, stage === 'complete'); }, [lines, stage]);
  useEffect(() => {
    if (!highlight) return;
    const panel = basket.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
    const timer = window.setTimeout(() => setHighlight(null), 1600);
    return () => clearTimeout(timer);
  }, [highlight]);

  function fail(error: unknown) { sound.playError(); setMessage(error instanceof Error ? error.message : 'Please try again.'); }
  function resetEntry() { setEntry(emptyEntry()); setEditing(null); consumedEntry.current = false; }
  function updateEntry(value: typeof entry) { consumedEntry.current = false; setEntry(value); }
  function key(value: string) {
    try { updateEntry(enter(entry, value)); setMessage(''); focus.current?.focus({ preventScroll: true }); } catch (error) { fail(error); }
  }
  function mutate(next: SaleLine[], label: string) {
    total(next); setUndo({ lines, label }); setLines(next); setCash(''); setPrinted(false);
  }
  function commitLine(line: Line) {
      const item = editing === null ? identify(line) : { ...line, id: editing };
      const next = editing === null ? [...lines, item] : lines.map(current => current.id === editing ? item : current);
      if (editing !== null && !lines.some(current => current.id === editing)) throw new Error('This item changed. Cancel the edit and select it again.');
      mutate(next, editing === null ? `added ${money(lineTotal(item))}` : 'item edit');
      consumedEntry.current = true; setEntry(emptyEntry()); setEditing(null); setHighlight(item.id);
      setMessage(`${editing === null ? 'Added' : 'Updated'}: ${item.quantity} × ${money(item.price)}`);
      focus.current?.focus({ preventScroll: true });
  }
  function add() {
    if (phase.current !== 'sale' || consumedEntry.current) return;
    try { commitLine(entryLine(entry)); } catch (error) { fail(error); }
  }
  function openPresets(menu: PresetMenu) {
    if (phase.current !== 'sale' || editing !== null) return;
    if (entry.value) { fail(new Error('Add or clear the current price before choosing a preset.')); focus.current?.focus({ preventScroll: true }); return; }
    presetCommitted.current = false; setPresetMenu(menu); setMessage(''); setDialog('presets');
  }
  function choosePreset(preset: Preset, brand: string) {
    if (phase.current !== 'sale' || editing !== null || presetCommitted.current || dialog !== 'presets') return;
    try {
      commitLine({ quantity: entry.multiplied ? entry.quantity : 1, price: preset.price });
      presetCommitted.current = true; closeDialog();
      setMessage(`Added: ${brand}${preset.size ? ` ${preset.size}` : ''} · ${money(preset.price)}`);
    } catch (error) { fail(error); }
  }
  function edit(line: SaleLine) {
    if (hasUnsavedEdit()) { fail(new Error('Save or cancel the current edit first.')); return; }
    if (editing === null && (entry.value || entry.multiplied)) { fail(new Error('Add or clear the current price before editing an item.')); focus.current?.focus({ preventScroll: true }); return; }
    setEditing(line.id); updateEntry({ quantity: line.quantity, value: (line.price / 100).toFixed(2), multiplied: true }); setMessage('');
  }
  function hasUnsavedEdit() {
    if (editing === null) return false;
    const original = lines.find(line => line.id === editing);
    try {
      const current = entryLine(entry);
      return !original || current.quantity !== original.quantity || current.price !== original.price;
    } catch { return true; }
  }
  function remove(id: string) {
    mutate(lines.filter(item => item.id !== id), 'removal');
    if (editing === id) resetEntry();
    setMessage('Item removed.'); focus.current?.focus({ preventScroll: true });
  }
  function undoLast() {
    if (!undo) return;
    if (hasUnsavedEdit()) { fail(new Error('Save or cancel the current edit before Undo.')); return; }
    if (editing !== null) resetEntry();
    setLines(undo.lines); setUndo(null); setCash(''); setMessage('Action undone.'); focus.current?.focus({ preventScroll: true });
  }
  function changeMethod(next: 'cash' | 'other') {
    if (next === method) return;
    setMethod(next); setCash(''); setMessage('');
  }
  function pay() {
    if (!lines.length || phase.current !== 'sale') return;
    if (entry.value || entry.multiplied || editing !== null) { fail(new Error('Add or clear the current price before payment. Finish or cancel the edit first.')); focus.current?.focus({ preventScroll: true }); return; }
    phase.current = 'payment'; setStage('payment'); setCash(''); setMethod('cash'); setMessage('');
  }
  function cashKey(value: string) {
    try { setCash(enter({ quantity: 1, multiplied: false, value: cash }, value).value); setMessage(''); } catch (error) { fail(error); }
  }
  useLayoutEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (dialog || event.ctrlKey || event.metaKey || event.altKey || !(event.target instanceof HTMLElement)) return;
      if (event.repeat) { if (['Enter', ' '].includes(event.key)) event.preventDefault(); return; }
      if (event.target.matches('input, select, textarea')) return;
      if (stage === 'payment') {
        if (method === 'cash' && (/^[0-9.]$/.test(event.key) || ['Backspace', 'Escape'].includes(event.key))) {
          event.preventDefault(); sound.playTap(); cashKey(event.key);
        }
        return;
      }
      if (stage !== 'sale' || (event.key === 'Enter' && event.target.closest('button'))) return;
      if (/^[0-9.*x]$/.test(event.key) || ['Backspace', 'Escape', 'Enter'].includes(event.key)) {
        event.preventDefault(); sound.play(event.key === 'Enter' ? 'positive' : 'tap');
        if (event.key === 'Enter') add(); else key(event.key);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  function newSale() {
    if (printing.current) return;
    phase.current = 'sale'; setStage('sale'); setLines([]); resetEntry(); setUndo(null); setCash(''); setMethod('cash');
    setMessage(''); setPrinted(false); receipt.current = null; setDialog(null);
  }
  async function print(test = false) {
    if (printing.current) return;
    printing.current = true; setBusy(true);
    try {
      const snapshot = receipt.current;
      if (!test && !snapshot) throw new Error('Complete payment before printing.');
      const bytes = test ? new Uint8Array([27,64,...new TextEncoder().encode('BAHADOOR SIMPLE POS\nPrinter test OK\n\n\n\n'),29,86,0]) : receiptBytes(snapshot!.lines, snapshot!.method, snapshot!.received, paper, snapshot!.date);
      await printer.printReceipt(bytes);
      if (!test) setPrinted(true);
      setMessage(test ? 'Test sent to printer.' : 'Receipt sent to printer.'); sound.playPositive();
    } catch (error) { fail(error); }
    finally { setConnected(printer.isConnected()); setBusy(false); printing.current = false; }
  }
  function complete() {
    if (phase.current !== 'payment' || printing.current) return;
    try {
      if (method === 'cash' && (!cash || cash.endsWith('.'))) throw new Error('Finish entering the cash amount or choose Exact.');
      const received = method === 'cash' ? parseMoney(cash) : 0;
      if (method === 'cash' && received < amount) throw new Error(`Cash received is ${money(amount - received)} short.`);
      phase.current = 'complete'; receipt.current = { lines: lines.map(line => ({ ...line })), method, received, date: new Date() };
      setStage('complete'); setUndo(null); void print();
    } catch (error) { fail(error); }
  }
  async function connect(selectedAddress?: string, name?: string, reconnect = false) {
    if (printing.current) return;
    printing.current = true; setBusy(true); setConnected(false);
    if (selectedAddress) { setAddress(selectedAddress); remember('simplePosPrinterAddress', selectedAddress); }
    if (name) { setPrinterName(name); remember('simplePosPrinterName', name); }
    try {
      const selected = await (reconnect ? printer.reconnect(selectedAddress) : printer.connect(selectedAddress));
      const label = name || selected;
      setPrinterName(label); remember('simplePosPrinterName', label); setConnected(true);
      if (label !== printerName) { const width = /80/.test(label) ? 80 : 58; setPaper(width); remember('simplePosPaper', String(width)); }
      setMessage('Printer connected.'); sound.playPositive();
    } catch (error) { fail(error); }
    finally { setBusy(false); printing.current = false; }
  }
  async function openSettings() {
    setDialog('printer');
    try { setDevices(await printer.list()); } catch (error) { fail(error); }
  }

  return <main>
    <header><div><span className="brand-mark calculator-mark" aria-hidden="true"><img src="/simplepos-icon.svg" alt="" /></span><div><strong>BAHADOOR</strong><small>SIMPLE CALCULATOR POS</small></div></div>{hasUpdate && safeUpdate && <Button onClick={() => applyUpdate(() => updateBoundary.current)}>Apply update</Button>}<Button onClick={() => void openSettings()}>Printer ● {connected ? 'Connected' : 'Disconnected'} · Settings</Button></header>
    {stage === 'sale' ? <><div className="workspace">
      <Calculator key={editing ?? 'new'} entry={entry} editing={editingIndex} focus={focus} setEntry={updateEntry} keypress={key} add={add} presets={openPresets} cancel={() => { resetEntry(); setMessage('Edit canceled.'); focus.current?.focus({ preventScroll: true }); }} />
      <section className="basket" aria-label="Current sale"><div className="section-label">CURRENT SALE<span>{lines.length} items</span></div>
        <div className="items" ref={basket}>{!lines.length ? <div className="empty"><span>＋</span><h2>Ready for your next customer</h2><p>Enter a price, then add an item.</p><small>Try 10 Enter · 2 × 20 Enter</small></div> : lines.map((line,index) => <article key={line.id} className={highlight === line.id ? 'recent-line' : ''}>
          <div><strong>Item {index + 1}</strong><small>{line.quantity} × {money(line.price)}</small></div><strong>{money(lineTotal(line))}</strong>
          <Button aria-label={`Edit Item ${index + 1}`} onClick={() => edit(line)}>Edit</Button>
          <Button tone="delete" aria-label={`Delete Item ${index + 1}`} onClick={() => remove(line.id)}>✕</Button>
        </article>)}</div>
        <div className="basket-tools">{undo && <Button onClick={undoLast}>Undo {undo.label}</Button>}<Button disabled={!lines.length} onClick={() => setDialog('clear')}>Clear sale</Button></div>
        <div className="total"><span>TOTAL{amount > subtotal(lines) && <small>Rounded up +{money(amount - subtotal(lines))}</small>}</span><strong data-testid="total">{money(amount)}</strong></div><Button className="primary pay" tone="positive" disabled={!lines.length} onClick={pay}>Pay — {money(amount)}</Button>
      </section>
    </div><footer>Quantity defaults to 1 <span>Enter to add · × for quantity · Esc to clear</span></footer></> : <Payment total={amount} cash={cash} method={method} complete={stage === 'complete'} busy={busy} printed={printed} setCash={setCash} setMethod={changeMethod} keypress={cashKey} finish={complete} back={() => { phase.current = 'sale'; setStage('sale'); setCash(''); setMessage(''); }} print={() => void print()} next={() => { if (printed) newSale(); else setDialog('new-sale'); }} />}
    <div className={`message notice ${message ? 'has-message' : ''}`} role="status" aria-label="Counter message" aria-live="polite">{message}</div>
    {dialog === 'presets' && <PresetPicker key={presetMenu} menu={presetMenu} quantity={entry.multiplied ? entry.quantity : 1} close={closeDialog} choose={choosePreset} />}
    {dialog === 'clear' && <Dialog title="Clear current sale?" close={closeDialog}><p>All current items will be removed.</p><Button onClick={closeDialog}>Cancel</Button><Button tone="delete" onClick={() => { mutate([], 'cleared sale'); resetEntry(); closeDialog(); setMessage('Sale cleared. Undo is available.'); }}>Clear</Button></Dialog>}
    {dialog === 'new-sale' && <Dialog title="Start a new sale?" close={closeDialog}><p>This receipt has not been confirmed sent. Starting a new sale discards it and hides the change.</p><Button onClick={closeDialog}>Keep receipt</Button><Button tone="positive" onClick={newSale}>Start new sale</Button></Dialog>}
    {dialog === 'printer' && <Dialog title="Printer settings" close={closeDialog}><Button onClick={closeDialog}>Done</Button><p>Selected: {printerName || 'None'} · {connected ? 'Connected' : 'Disconnected'}</p>
      {printerName && <Button disabled={busy} onClick={() => void connect(address || undefined, printerName, true)}>Reconnect selected printer</Button>}
      {devices.map(device => <Button key={device.address} disabled={busy} onClick={() => void connect(device.address, device.name)}>{device.name || device.address}</Button>)}
      {!Capacitor.isNativePlatform() && <Button disabled={busy} onClick={() => void connect()}>Change Printer (BLE)</Button>}
      <p>{Capacitor.isNativePlatform() ? 'Pair a printer in Android Bluetooth settings, then select it above.' : 'Bluetooth Classic printers require the Android app. Browser printing supports compatible BLE printers.'}</p>
      <div className="entry-actions">{([58,80] as const).map(width => <Button key={width} className={paper === width ? 'selected' : ''} aria-pressed={paper === width} onClick={() => { setPaper(width); remember('simplePosPaper', String(width)); }}>{width} mm</Button>)}</div>
      <Button disabled={busy || !connected} onClick={() => void print(true)}>Test Print</Button><Button disabled={busy || !connected} onClick={() => void printer.disconnect().then(() => setConnected(false)).catch(fail)}>Disconnect</Button>
      <Button aria-pressed={sounds} onClick={() => { sound.setEnabled(!sounds); setSounds(!sounds); }}>Button Sounds · {sounds ? 'ON' : 'OFF'}</Button>
    </Dialog>}
  </main>;
}

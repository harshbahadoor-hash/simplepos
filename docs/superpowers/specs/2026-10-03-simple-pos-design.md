# Bahadoor Simple POS — design

Approved 2026-10-03. The full product brief ("Bahadoor Simple Calculator POS — Final Master Engineering Prompt") is the requirements source; this document records the decisions taken against it.

## Product

Open app → enter prices → tap feedback (sound + visual) → total → payment → change → Bluetooth receipt → new sale.

No login, accounts, database, sales backend, product catalogue, inventory, accounting or reporting. Everything after the first page load runs on the device.

## Decisions

| Topic | Decision |
| --- | --- |
| Repository | Standalone `harshbahadoor-hash/simplepos`. Nothing is imported from the ERP at runtime; reusable pieces are copied and adapted. |
| Stack | Vite 8, React 19, TypeScript 6, Tailwind 4. Static build only. |
| Money | Integer cents (`Cents = number`). Display `Rs 1,250.00`. Max two decimals on entry. |
| Entry | `qty × price`. Quantity defaults to 1. `×` turns the current entry into the quantity. |
| Sound | Web Audio API. Four short clicks (tap, positive, delete, error) synthesised into `AudioBuffer`s at start-up, so no audio files are fetched and none can fail to load. Each new voice stops the previous one so rapid tapping never queues. Enabled by default; `simplePosButtonSounds` in `localStorage`. All audio errors are swallowed. |
| Buttons | One `PosButton` provides pressed state, sound and disabled handling. Keypad keys act on `pointerdown`; other buttons act on click. Guarded actions (complete, new sale, clear) ignore repeats while a previous run is pending or within a short window. |
| Printing | `PrinterAdapter` interface. `NativeShopPrintAdapter` (Capacitor `ShopPrint` plugin from the ERP, Bluetooth Classic SPP — works with the shop's BT-80UBW) inside the Android app; `WebBluetoothAdapter` (BLE serial printers only) in Chrome; `SimulatedPrinterAdapter` for automated tests. |
| Paper | 58 mm (32 columns) or 80 mm (48 columns). Guessed from the printer name (`80` → 80 mm, `58` → 58 mm, else 58 mm) and changeable in settings. |
| Android | New Capacitor app `com.bahadoor.simplepos` ("Bahadoor Simple POS") loading the production URL, with the ERP's `ShopPrint` plugin. Installed alongside the existing ERP app. |
| Offline | A build-generated service worker precaches the app so a reload works without internet. |
| Local storage | Preferences only (sound, printer, paper) plus the unfinished sale for refresh recovery. No sales history. |
| Hosting | `https://new.a7k2mq9xb4rt8vl1nc6pz3wy5df0hj7sr2km9qx4un8ep1tv6gw3ba5cd0.com`, static files served by Caddy on the existing VPS from `/srv/simplepos/current`. |

## Units

- `src/domain/money.ts` — parse/format cents.
- `src/domain/entry.ts` — calculator entry reducer (digits, decimal, backspace, ×, clear).
- `src/domain/sale.ts` — line list reducer (add, update, remove, undo, clear).
- `src/domain/payment.ts` — change, shortfall, quick-cash suggestions.
- `src/domain/receipt.ts` — receipt lines for a paper width; `src/domain/escpos.ts` — bytes.
- `src/sound/sound-manager.ts` — `playTap/playPositive/playDelete/playError/setEnabled/isEnabled`.
- `src/printer/*` — adapters and selection.
- `src/ui/*` — React components; `src/app/*` — composition and keyboard handling.

## Testing

Vitest for every domain unit and the sound manager. Playwright runs the brief's final acceptance test (140 total, Rs 200 cash, Rs 60 change, receipt bytes checked through the simulated printer), keyboard flow, clear/undo, invalid cash and the audio-failure test. Physical printing is verified on the SM-X230 tablet with the BT-80UBW printer.

# Bahadoor Simple POS

A local calculator, temporary basket, payment calculator and Bluetooth receipt printer. No login, database, sales API or permanent sales history.

## Run

Use Node 24 or newer. Run `npm ci` then `npm run dev`. `npm run build` creates static files in `dist/`. `npm run check` runs type checking, lint, unit tests and browser acceptance tests; install Chromium first with `npx playwright install chromium`. With a JDK available, `npm run test:native` checks lifecycle races by compiling the actual printer plugin against controlled platform stubs. CI runs both checks. The stubs exercise threading and cancellation, not Bluetooth radio or paper output.

Enter prices and press Enter to add. `2 * 20 Enter` adds two items at Rs 20 each. Escape clears entry. Edit and delete controls update the total immediately. Cash payment shows change until New Sale. Printer failures retain the completed sale for retry. Sound and printer preferences are stored locally; the unfinished basket is recovered within the same browser tab through sessionStorage. Completion or New Sale clears that draft. Completed sales remain in memory only.

The **00** button appends two zeros in one tap: `5 → 00 → Add` enters Rs 500. Tap **Ghee → brand → size** to add a preset immediately. Ghee has twelve brands and 39 choices, including Ananda, Mother Dairy, Gavardhan and the supplied Stanwood/Trishul sizes. Tap **Oil → type → brand → size** for Coconut, Mustard, Sesame and Pooja oil; Chameli goes directly from type to size because no brands were supplied. Oil has 35 choices, including Samarpan, Om Shanti and Pavithram Pooja oil and Nihar mustard oil. The Coconut brand is spelled Badaye and Mustard/Sesame use Badye, as supplied. Prices are in `src/domain/presets.ts`; selecting a preset uses quantity 1 unless a quantity was entered with × first, including decimals. An unfinished price must be added or cleared before opening either menu, and presets are unavailable during an item edit. Each selection closes the menu and supports Undo. Basket and receipt lines remain generic Item 1, Item 2, etc.; oil types, brand names and sizes are never stored in those lines or printed.

Delete and Undo preserve a new price and quantity being entered. Save or cancel changed edits before switching to another item or using Undo; an unchanged edit can be left immediately. Tapping the selected payment method keeps entered cash; switching methods clears it. Closing a preset picker rejects a trailing tap at the same point for 500 ms; other keypad buttons and physical keyboard entry remain immediate.

The large × button sits above the full-height Add button, to the right of the digit keypad. Quantity remains visible beside the price. Pay preserves unfinished input; additions, edits, deletions and a cleared basket have one-step Undo. Canceled or dragged touches and held-key repeats do not activate controls. Cash has its own touch keypad and shows Still Due until sufficient cash is entered. Starting a new sale asks before discarding an unsent receipt. Simple POS has a distinct amber calculator icon in the header, browser and Android launcher.

Landscape payment fills the available width beneath a compact header. Cash/Other sit beside the total and Clear cash beside the cash field; the remaining height goes to the large cash keypad. Exact and cash shortcuts stay visible together with change and Complete & Print, whose position stays fixed as Still Due changes to Change. The completed receipt keeps change, retry and New Sale on screen. Screen transitions reject trailing touches within the former button area for 500 ms, including slight finger drift, so completion cannot accidentally trigger Print Again, or returning to the calculator enter a digit. Numeric keys have no artificial delay. Layout checks include Android's 1.3 text scale and a 1024 × 600 landscape screen with large totals; narrower portrait screens use normal document scrolling.

Quantity supports two decimal places: `1.25 × 15.50` gives a line amount of Rs 19.38. Quantities use integer hundredths for multiplication and each line rounds once to the nearest cent (half a cent rounds upward). The final sale total rounds the sum upward to the next whole rupee: Rs 19.38 becomes Rs 20, with Rs 0.62 shown as a rounding adjustment. Cash and change use that final total. Receipts and Test Print feed paper then send `GS V 0` to request automatic cutting on printers with a cutter, following [Epson's ESC/POS cut command](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html).

Receipts omit blank section rows and retain normal-sized text with 26-dot [line spacing](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_3.html). A separate [paper feed](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_cj.html) preserves the previously tested 120-dot clearance from the last text line to the cutter. A four-item cash receipt uses 12 text rows and about 25% less commanded feed than the former layout on a 203 dpi printer with default 30-dot spacing; actual length depends on printer mechanics. Totals, rounding adjustments, date/time, cash/change and the thank-you footer remain present; product labels are still excluded.

## Printing

The Android shell reuses the Bahadoor ERP's ShopPrint Capacitor bridge for Bluetooth Classic SPP printers. Pair a printer in Android settings, then select it in the app. Browser printing supports BLE serial printers advertising service FFE0 and write characteristic FFE1; Bluetooth Classic printers require the Android app. Set 58 mm or 80 mm paper in settings and run Test Print.

Bluetooth confirms bytes sent, not that paper physically printed. Check the printer after an error before retrying to avoid duplicate receipts. Actual tablet sound latency and physical paper output require hardware acceptance testing.

Reconnect the selected printer from Settings. Native connection/write deadlines close the underlying socket, and canceled permission requests cannot resume an abandoned connection. Receipt retries use the original sale snapshot and timestamp.

## Android

`npm run build` then `npm run android:sync`. Build with JDK 21+ and Android SDK using `android/gradlew -p android assembleDebug`. The separate app is `com.bahadoor.simplepos`, named Bahadoor Simple POS. It loads the production HTTPS address and caches the frontend after first load. The debug APK is for device testing; use a securely held signing key for a release APK.

## Deployment

Production URL: https://new.a7k2mq9xb4rt8vl1nc6pz3wy5df0hj7sr2km9qx4un8ep1tv6gw3ba5cd0.com

Serve `dist/` as static assets. Caddy configuration is in `deploy/simplepos.caddy`. Keep HTML and `sw.js` uncached and immutable hashed assets cached. Versioned directories under `/srv/simplepos/releases` and the `/srv/simplepos/current` symlink allow rollback without modifying ERP services.

After the first successful load, the frontend, fonts and logo are available offline. New service workers wait; Apply Update is offered only with an empty sale and calculator. An update never automatically reloads a customer's active sale or payment.

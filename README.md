# Bahadoor Simple POS

A local calculator, temporary basket, payment calculator and Bluetooth receipt printer. No login, database, sales API or permanent sales history.

## Run

Use Node 24 or newer. Run `npm ci` then `npm run dev`. `npm run build` creates static files in `dist/`. `npm run check` runs type checking, lint, unit tests and browser acceptance tests; install Chromium first with `npx playwright install chromium`.

Enter prices and press Enter to add. `2 * 20 Enter` adds two items at Rs 20 each. Escape clears entry. Edit and delete controls update the total immediately. Cash payment shows change until New Sale. Printer failures retain the completed sale for retry. Sound and printer preferences are stored locally; the unfinished basket is recovered within the same browser tab through sessionStorage. Completion or New Sale clears that draft. Completed sales remain in memory only.

## Printing

The Android shell reuses the Bahadoor ERP's ShopPrint Capacitor bridge for Bluetooth Classic SPP printers. Pair a printer in Android settings, then select it in the app. Browser printing supports BLE serial printers advertising service FFE0 and write characteristic FFE1; Bluetooth Classic printers require the Android app. Set 58 mm or 80 mm paper in settings and run Test Print.

Bluetooth confirms bytes sent, not that paper physically printed. Check the printer after an error before retrying to avoid duplicate receipts. Actual tablet sound latency and physical paper output require hardware acceptance testing.

## Android

`npm run build` then `npm run android:sync`. Build with JDK 21+ and Android SDK using `android/gradlew -p android assembleDebug`. The separate app is `com.bahadoor.simplepos`, named Bahadoor Simple POS. It loads the production HTTPS address and caches the frontend after first load. The debug APK is for device testing; use a securely held signing key for a release APK.

## Deployment

Production URL: https://new.a7k2mq9xb4rt8vl1nc6pz3wy5df0hj7sr2km9qx4un8ep1tv6gw3ba5cd0.com

Serve `dist/` as static assets. Caddy configuration is in `deploy/simplepos.caddy`. Keep HTML and `sw.js` uncached and immutable hashed assets cached. Versioned directories under `/srv/simplepos/releases` and the `/srv/simplepos/current` symlink allow rollback without modifying ERP services.

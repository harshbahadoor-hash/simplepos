# Tablet payment layout — 5 October 2026

The Samsung SM-X230 WebView uses a 1280 × 722 CSS viewport, DPR 1.5 and Android text scale 1.3. The old cash column overflowed its available height by about 82 px: the last keypad row was clipped and Clear cash needed scrolling. Its payment panel used only 980 px of the screen width.

The new landscape panel uses the available width with 20 px side margins, up to 1360 px. A compact header gives more vertical room. Payment method buttons sit beside the total and Clear cash beside the cash field; the cash keypad fills the remaining height. Change/Still Due use a reserved area so Complete & Print stays stationary. Completed payments use two columns and retain change, retry and New Sale within the viewport. Smaller portrait screens keep normal scrolling instead of clipping controls.

Complete, Back and New Sale use 500 ms protection against trailing touches within the former button area activating a replacement control. This includes ordinary finger drift; preset-picker transitions keep their existing small point guard. Numeric input and intentional taps outside that area remain immediate. Cash validation, sound, receipt snapshots, round-up and printing remain local.

## Automated verification

- A new regression failed against the old layout with cash-column scroll height 643 px versus 556 px available.
- Tests emulate Android's scaling of explicit pixel fonts, not only the body font. They verify all payment controls are at least 48 × 48 px and visible, the widened panel, compact header, fixed completion position for Due/Change/Exact, 1024 × 600 landscape fit and receipt-failure controls.
- A real browser double-click on Complete sends one receipt/cut command, including when the transport finishes immediately. New Sale double-click cannot type through to the calculator. Review additionally reproduced two touch taps 130 ms apart and 12 px apart at the upper edge of Complete triggering two receipts; an independent regression failed before the whole-button guard was added.
- The user's unrelated deletion of two tests in `e2e/sale.spec.ts` stays untouched and unstaged; CI runs the full tracked file.

## Device and rollout evidence

The initial tablet payment was preserved during read-only diagnosis. The operator subsequently returned to an empty sale. Applying the layout stylesheet preview changed the header height from 86.21 px to 66.46 px without changing sale state.

An owned Rs 140 layout test on the actual WebView measured the widened panel at 1240 × 631.54 px. The input and summary each had client/scroll height 594/594 px, with no internal scrolling. Cash keys measured about 210.75 × 83.22 px; Complete & Print was 88 px high. Selecting Rs 200 displayed Rs 60 change. The test line was removed and the tablet returned to an empty sale; this preview test sent no receipt.

## Compact receipts

The former four-item cash receipt fed 18 default 30-dot lines (540 dots), including three empty section rows and four trailing line feeds. The compact version prints twelve nonblank rows with [26-dot line spacing](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_3.html). Normal character size and the 32/48-column layouts remain unchanged. Separators, date/time, generic numbered items, total, cash/change and Thank you remain; subtotal/round-up still print when needed.

After the footer's line feed, [ESC J](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_cj.html) advances another 94 dots, keeping the same 120-dot clearance from the final text line to the cutter as the earlier hardware-confirmed receipt. `GS V 0` still requests a cut. Test Print uses the same encoder. This deliberately saves paper within the content while preserving the known cutter margin.

An independent paper-motion test at both 58 mm and 80 mm verifies no empty text rows, all content within the column limit, one cut, at least 120-dot footer clearance and a feed budget of 420 dots. It failed on the old encoder at 540 dots. The new four-item receipt feeds 406 dots, about 25% less, or roughly 50.8 mm versus 67.6 mm at 203 dpi. These are commanded-feed calculations; printer auto-feed, density and mechanics determine physical slip length.

Final `npm run check` passed: type checking, lint, 18 unit tests, 147 browser checks and nine intentional viewport-only skips. Independent read-only review found no remaining actionable defects after the touch-drift and extreme-total corrections.

## Production acceptance

- Static release `/srv/simplepos/releases/20261005-payment-layout` is live; the current symlink was verified. A fresh HTTPS browser returned 200, loaded the new hashed JavaScript and verified the 1240 px payment panel and Rs 140 / cash Rs 200 / change Rs 60.
- The Android service-worker update was applied through the app's empty-sale boundary. No customer sale was reloaded or discarded. No APK reinstall or native printer code change was needed.
- The selected BT-80UBW reconnected through the native bridge. Touch entry of `10`, `15`, `2 × 20` and `3 × 25` produced Rs 140. Cash 200 produced Rs 60 change without moving Complete & Print. Payment and completed-payment panels both measured client/scroll 630/630 px; their inner columns measured 594/594 px. All cash keys were visible.
- Complete & Print received the native receipt-write acknowledgement. The user confirmed the compact four-item Rs 140 slip printed clearly, retained Thank you and cut automatically. This is physical readability/cutter acceptance; the paper-saving percentage remains a commanded-feed calculation rather than a ruler measurement.
- New Sale restored an empty calculator and Rs 0 total, leaving the printer connected. Screenshots are in the ignored `artifacts/tablet-payment-*-live.png` files.

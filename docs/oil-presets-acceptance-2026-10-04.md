# Oil and updated Ghee presets — 4 October 2026

## Delivered behavior

- Oil → Coconut/Mustard/Sesame → brand → size adds one generic basket line immediately.
- Oil → Chameli → size skips a brand step because no brands were supplied.
- All 29 oil prices use the supplied values, stored as integer cents. Coconut uses the supplied spelling Badaye; Mustard and Sesame use Badye.
- Gavardhan adds 200 ml/Rs 150, 500 ml/Rs 300 and 1 L/Rs 550.
- Stanwood now offers 200 ml/Rs 90, 500 ml/Rs 160 and 1 L/Rs 285. This replaces its earlier price-only menu, including the unsized Rs 60 choice.
- Trishul now labels its existing prices: 100 ml/Rs 50, 200 ml/Rs 80, 500 ml/Rs 135 and 1 L/Rs 235.
- Ghee now has ten brands and 35 choices. The existing other seven brands retain their prices and sizes.
- Quantity defaults to one; a pending decimal quantity entered with × applies to the next preset. Successful selection resets the input and offers Undo.
- The shared picker displays the current oil type and brand, provides Back/Close, preserves pending input, rejects repeated taps through screen transitions and returns focus correctly. Both presets are disabled during an item edit.
- 00, Ghee, Oil and Clear input occupy one shortcut row on the tablet and larger phones; screens up to 380 px use two rows. Numeric buttons and the large Times/Add controls retain their positions. Oil has a different button color for quick recognition.
- Basket, draft and receipt formatting retain generic quantity/price lines; no oil, brand or size names are added to saved lines or printed receipts. Existing whole-rupee total round-up and cutting remain active.

## Verification evidence

- Test-first: the Coconut menu browser test failed against the previous app while waiting for the absent Oil button, then passed after implementation.
- Final `npm run check` passed: type checking, lint, 16 unit tests and 133 browser checks; two intentional Samsung-only checks were skipped on other viewports.
- Browser projects cover Samsung SM-X230 1280 × 722, landscape 1340 × 800 and phone portrait. Layout and rapid-navigation cases explicitly use the measured tablet text scale of 20.8 px.
- Every oil choice was selected through the actual UI using independently transcribed values. Separate category totals were Coconut Rs 900, Mustard Rs 1,670, Sesame Rs 950 and Chameli Rs 490 (29 choices, Rs 4,010 combined).
- All ten new/updated Ghee size choices were selected through the UI and produced ten generic lines totaling Rs 2,035.
- A mixed receipt regression used 1.25 × Rs 35, Rs 140 and Rs 150: subtotal Rs 333.75, round-up Rs 0.25, total Rs 334, cash Rs 500 and change Rs 166. It checks actual ESC/POS output at the Bluetooth boundary for generic numbered quantities/prices, absence of names and trailing cut bytes `29, 86, 0`.
- Existing calculator, decimal quantity, correction safety, sounds/audio failure, payment, print retry, printer switching and offline/update regressions pass.
- Independent review found shortcut overflow on a 320 px phone. A real browser regression reproduced the Oil button extending to 343 px. Two shortcut columns fix it; the same regression also found the pre-existing printer header extending to 321 px at the larger text scale. Allowing the narrow header to wrap removes that overflow without hiding content.
- The user's pre-existing two-test deletion in `e2e/sale.spec.ts` remains unstaged and untouched. CI uses the full tracked suite.

Production and connected-tablet results are added after rollout. The native printer bridge is unchanged; no Android reinstall is required for this frontend update.

# Pooja oil, Ghee and mustard additions — 5 October 2026

This update extends the existing local menus and keeps basket/receipt lines as generic quantity and price entries.

| Menu | Brand | Size | Price |
| --- | --- | --- | --- |
| Ghee | Ananda | 200 ml | Rs 135 |
| Ghee | Ananda | 500 ml | Rs 250 |
| Ghee | Ananda | 5 L | Rs 2,350 |
| Ghee | Mother Dairy | 1 L | Rs 475 |
| Oil → Pooja oil | Samarpan | 500 ml | Rs 90 |
| Oil → Pooja oil | Samarpan | 1 L | Rs 150 |
| Oil → Pooja oil | Om Shanti | 500 ml | Rs 125 |
| Oil → Pooja oil | Pavithram | 475 ml | Rs 175 |
| Oil → Pooja oil | Pavithram | 950 ml | Rs 275 |
| Oil → Mustard oil | Nihar | 1 L | Rs 175 |

There are now twelve Ghee brands/39 choices and five Oil types/35 choices. All earlier prices remain available.

## Verification

- Test-first: the Pooja browser case failed against the previous release because the type button was absent.
- Browser fixtures independently transcribe supplied prices and select every Oil option, plus all fourteen Ghee choices added or corrected across these updates.
- Category totals are Coconut Rs 900, Mustard Rs 1,845, Sesame Rs 950, Chameli Rs 490 and Pooja Rs 815; all 35 Oil choices sum to Rs 5,000. The fourteen Ghee choices total Rs 5,245.
- Receipt regression: 1.25 × Nihar/Rs 175, Pavithram/Rs 175, Ananda/Rs 135 and Mother Dairy/Rs 475 produce subtotal Rs 1,003.75, round-up Rs 0.25, total Rs 1,004, cash Rs 2,000 and change Rs 996. The captured ESC/POS output contains four generic numbered lines and ends in cut bytes `29, 86, 0`. The fixed BAHADOOR POOJA SHOP heading is retained.
- Coverage includes Samsung 1280 × 722, desktop landscape, phone portrait, 320 px overflow, decimal quantity, Undo, input protection, repeated taps, keyboard, audio failure, payment, offline updates and print retry.
- The user's pre-existing two-test deletion in `e2e/sale.spec.ts` remains untouched and unstaged; CI runs the full tracked sale suite.
- ADB enumerated no connected tablet in this run. Receipt verification uses the browser Bluetooth boundary; no new physical print is claimed.

Final `npm run check` passed: type checking, lint, 16 unit tests and 136 browser checks, with two intentional viewport-only skips.

## Production rollout

- Code commit `df6efdbdb08373b6658e5b67151fccc646e08278` passed [GitHub CI](https://github.com/harshbahadoor-hash/simplepos/actions/runs/37271190926): 16 unit tests, 142 browser checks, two intentional viewport-only skips and all three native lifecycle checks. CI includes the full tracked sale suite.
- Static release is live from `/srv/simplepos/releases/20261005-pooja-presets`, with the current symlink verified. HTTPS returned 200.
- A fresh production browser selected every one of the ten added size/price choices at the supplied price, producing ten generic lines totaling Rs 4,200. Screenshots verified the five Oil type buttons and the three Pooja brands at Samsung dimensions and 20.8 px text scale.
- The Android frontend receives the same service-worker update. With an empty sale, reopen the app and use Apply update if offered. No native printer changes or Android reinstall are required.

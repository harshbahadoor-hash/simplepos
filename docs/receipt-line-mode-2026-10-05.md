# Original or combined receipt lines — 5 October 2026

The local setting **Combine same-price receipt lines · ON/OFF** controls the default format; it initially defaults to OFF and stores only the preference `simplePosReceiptMode`. Sale complete also offers **Original** and **Combine same prices** before Print Again or Retry Print. These selections remember the preferred mode and are disabled during a print. Both formats use the previously accepted compact vertical spacing, normal font and automatic cutter command.

Only printed lines combine. The basket and receipt snapshot retain every original quantity/unit-price line for edits and an original-format reprint. No product identity, history, sale database or network calculation is added. Groups use exact integer unit-price cents and keep first-seen order. Quantities sum as integer hundredths using BigInt, avoiding results such as `0.30000000000000004`.

| Original basket | Combined receipt |
| --- | --- |
| 1 × Rs 40 | 3 × Rs 40 = Rs 120 |
| 1 × Rs 20 | 3.5 × Rs 20 = Rs 70 |
| 1 × Rs 30 | 1 × Rs 30 = Rs 30 |
| 2.5 × Rs 20 | |
| 2 × Rs 40 | |

The example remains Rs 220 in both modes. With Rs 500 cash, change remains Rs 280. Original mode has five numbered lines; combined mode has three. Brands and preset names remain absent.

Combining cannot change an amount already charged. For example, two `1.25 × Rs 15.50` lines originally round to Rs 19.38 each. The combined line shows quantity 2.5 and Rs 38.76, retains subtotal Rs 38.76 / round-up Rs 0.24 / total Rs 39, and adds the compact note "Original line rounding retained" because a fresh multiplication would round to Rs 38.75. The note only appears when needed.

## Verification

Test-first unit cases failed when the old encoder printed five lines instead of three and left decimal quantities separate. A browser case failed because the toggle was absent. Independent fixtures verify the supplied example at both 58 mm and 80 mm, first-seen order, decimal quantity sums, input immutability, unchanged totals/cash/change, cutter clearance and lower feed for combined mode. Browser checks exercise default OFF, saved ON/OFF, three printed lines, an original five-line reprint, disabled format controls during a held transport write, receipt retention and tablet fit.

`npm run check` passed type checking, lint, 21 unit tests and 150 browser checks, with nine intentional viewport-only skips. Independent read-only review found no concrete defects in the receipt-mode changes.

## Production and hardware acceptance

- Release `/srv/simplepos/releases/20261005-receipt-lines` is live and its current symlink was verified. A fresh HTTPS browser returned 200 and exercised default OFF → ON against the new hashed assets.
- The tablet received the frontend update through the empty-sale Apply update action. The selected printer reconnected and touch entry added all five original lines, totaling Rs 220; cash Rs 500 produced Rs 280 change.
- An observational native bridge probe forwarded both print calls unchanged and captured their payloads. The first payload had exactly three numbered lines with quantities 3, 3.5 and 1; the Original reprint had the original five lines. Both retained Rs 220 total, Rs 500 cash and Rs 280 change, and ended in the cut command. The native bridge acknowledged both writes.
- The user confirmed both receipts printed correctly and cut automatically, providing physical acceptance of quantities, readability and cutting.
- The completed tablet payment measured client/scroll height 630/630 px, with inner input and summary columns 594/594 px. The new format controls caused no scrolling. New Sale restored an empty calculator and the original/OFF preference; the printer remained connected. The observational probe was removed. Screenshots are in ignored `artifacts/tablet-receipt-*-live.png` files.
- The pre-existing two-test deletion in `e2e/sale.spec.ts` remains untouched and unstaged; CI includes those tracked tests.

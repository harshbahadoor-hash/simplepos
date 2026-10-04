# Double-zero, ghee presets and bug review

User scope: add 00, Ghee → brand → size/price shortcuts using the supplied prices, preserve unnamed receipts, and analyse/fix bugs across the simple POS. Baseline: `4cc0d7e`. No sales backend, database or product inventory was added.

## Implemented shortcuts

- 00 appends two zeros atomically and preserves the existing digit layout. Excess decimals are rejected without partially changing input.
- Nine brands, 32 choices, exactly the supplied sizes and prices. Stanwood and Trishul use price-only choices.
- Selection adds immediately, closes the menu, resets quantity to 1 and provides labeled Undo. A quantity entered with ×, including decimals, applies to the next preset.
- Pending prices cannot be silently replaced by opening presets. Presets are unavailable while editing.
- Brand and size grids use different column centers (three/two on tablets, two/one on phones), so intentional brand-to-size taps remain immediate while repeated taps at the original point are rejected.
- Basket/draft/receipt data contains quantity and unit price only, plus temporary line identifiers. Brand and size are only picker labels and temporary feedback; receipts retain numbered generic lines.

## Confirmed defects and fixes

| Failure and reproduction | Fix | Evidence |
| --- | --- | --- |
| Ghee blocked a pending price but Enter reactivated its focused button | Return focus to calculator on the blocked action | Failing then passing browser regression |
| Double-click a size, brand or Close; second click hit a replacement size or keypad underneath | Reject a trailing pointer at the same position for 500 ms across all picker transitions and prevent it taking focus; other positions/keyboard remain immediate | Real browser double-click regressions, followed by rapid 77 entry |
| Escape from presets also reached the calculator and reset 1.5 × to quantity 1 | Stop dialog Escape propagation | Pending decimal quantity survives close |
| Close presets left focus on BODY because the saved heading was detached | Capture focus before heading autofocus; preserve deliberate focus movement after committing | Cancel restores opener; selection restores calculator focus |
| Delete/Undo silently cleared a new pending price and quantity | Preserve input while changing basket; only deletion of the edited line cancels its edit | Pending 1.5 × 25 remains and adds correctly after deletion |
| Edit replaced a pending price or unsaved edit | Require Add/Clear or Save/Cancel first | Unsaved Rs 50 edit remains; explicit Cancel restores original quantity |
| Tapping the selected Cash button erased Rs 200 | Only clear cash on an actual method change | Rs 140 sale retains Rs 60 change |
| Disconnect event from printer A invalidated current printer B | Remove old listener, disconnect A, clear old characteristic, guard listener by identity | Simulated two-device transport regression |
| Input entered during update activation prevented reload and permanently hid Apply update | Retain pending reload until another safe Apply action | Input preserved, then Apply update reappears and reloads at idle |
| HTML/icon-only releases kept the old offline cache fingerprint | Hash final HTML and public icon bytes after normal bundle hooks | Three actual Vite builds detect both changes |
| Native destruction could allow abandoned socket publication or uncaught executor/deadline rejection | Destruction flag, generation invalidation, synchronized admission/publication, guarded scheduling and shutdown | Actual plugin compiled against controlled stubs; old baseline fails, new lifecycle cases pass |
| Number-font loading grew 00 by 3 px and moved Add during entry | Explicit number line heights and fixed 00 minimum height | Delayed-font browser regression before/after font readiness and 20 additions |

## Verification contract and results

| Requirement/risk | Observed result | Evidence limit |
| --- | --- | --- |
| Calculator, money, quantity, final round-up and cash change | Typecheck/lint and 16 unit tests pass | Monetary oracle also checked 20,000 generated sales / 80,209 lines against independent BigInt arithmetic |
| Touch/keyboard, corrections, presets, generic receipts, payment/retry and offline behavior | 100 local browser checks pass across Samsung 1280 × 722, desktop landscape and phone portrait; two intentional viewport-only skips | Earlier user deletions in `e2e/sale.spec.ts` are kept unstaged; CI runs the full tracked suite |
| All supplied preset prices | Each of the 32 choices selected through UI; 32 generic lines total Rs 12,170 | Independent values transcribed from the user's request |
| Tablet layout | 00/Ghee/Clear are 52 px high with 20.8 px scaled body text; keypad/Add/Pay visible within 1280 × 722 | Browser simulation uses the actual measured tablet dimensions and text scaling |
| Native cancellation | Three deterministic lifecycle scenarios pass | Stubs exercise actual plugin concurrency, not Android radio/paper behavior |

Hardware rollout and production results are recorded below after execution. Physical receipt appearance, acoustic latency, paper-out recovery and long-shift comfort require operator observation; a successful Bluetooth write alone cannot establish them.

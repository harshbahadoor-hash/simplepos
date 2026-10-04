# Faster, safer tablet counter workflow — implementation plan

> **For agentic workers:** Use the executing-plans skill to implement the proposed tasks independently, following each task's test cycle. Do not treat proposed features as already implemented.

**Goal:** Reduce hand travel, missed taps, incorrect prices and accidental sale actions while keeping the POS a simple calculator.

**Architecture:** Preserve local calculation, integer cents, temporary sale state, the SoundManager and PrinterAdapter. Add protections at the action/state boundary, rather than arbitrary delays across all buttons. No database, accounts, sales history, product catalogue or network calls during entry.

**Tech stack:** React, TypeScript, CSS, Vitest, Playwright, Capacitor Android and the existing Bluetooth SPP plugin.

**Hardware baseline:** Samsung SM-X230; physical 1920 × 1200 landscape display, DPR 1.5; measured app viewport 1280 × 722 after Android system bars. Respect dynamic viewport height and user font scaling. The user now reports the BT-80UBW is powered on and connected; physical output and cut testing can proceed.

## Scope and status

The software improvements below are implemented on the counter-safety branch. Remaining unchecked tasks require printer fault simulation, actual listening or operator observation. Verification details are in `docs/counter-qa-2026-10-04.md`. Existing protections include safe cents arithmetic, invalid-decimal rejection, default quantity one, edit/delete, Undo, clear-sale confirmation, short-cash rejection, disabled empty-sale Pay, separate payment screen, retained change, audio failure isolation, a print lock, and session recovery of unfinished lines.

“Mistake-proof” means making common mistakes difficult and recovery straightforward. Software cannot infer whether a valid Rs 100 price was intended to be Rs 10, detect all palm contacts, or prove physical receipt output from a Bluetooth write acknowledgement.

## 1. Main counter layout — implement now

Files: `src/App.tsx`, `src/style.css`, `e2e/keypad-layout.spec.ts`.

- [x] Put Add Item in a separate fourth column to the right of the 3 × 4 keypad. Make it span the keypad's full height, with a large plus sign, a readable label, the pending line amount and an Enter hint.
- [x] Keep a 14–16 px inactive gap between number keys and Add. Keep Add physically separate from Pay and sale-clearing controls.
- [x] Give the calculator enough landscape width to preserve generous digit targets. Use a narrower Add column on phones, without overlap or horizontal scrolling.
- [x] Disable Add for empty, zero, malformed or unsafe input. After a successful add, reset input immediately, disabling a second tap without delaying the next customer's numeric entry.
- [x] Keep the action on release/click. A pressed button does not add an item merely because a finger lands on it.
- [x] Verify relative placement, full-height button, empty-input disablement, rapid second tap, quantity/decimal entry, editing and the complete Rs 140 acceptance case.
- [x] Verify the actual 1280 × 722 viewport, Android text scaling, portrait and desktop. Add, total and Pay must stay visible in tablet landscape.

## 2. Make every entry easy to check

Files: `src/App.tsx`; proposed `src/ui/Calculator.tsx`, `src/ui/SaleList.tsx`; domain entry tests and browser tests.

The cashier should understand the next action at a glance: quantity, unit price, resulting line total and whether the button adds or edits.

- [x] Display `2 × Rs 20.00 = Rs 40.00` above or within the Add area, keeping the price itself most prominent. Show quantity 1 normally; make quantity entry mode clearly different.
- [x] After Add, briefly highlight the new line and show `Added: 2 × Rs 20.00`. Scroll only the basket to the added line, leaving keypad and total stationary.
- [x] Keep input reset immediate. Do not use a modal or require acknowledgement for routine additions.
- [x] Keep edit mode explicit: `Editing Item 3`, `Save Item`, and `Cancel edit`. Use stable line identifiers so Undo or list changes cannot redirect an edit.
- [x] Return keyboard focus to a neutral calculator target after adding or closing dialogs. Enter should add the price just typed, while Enter on an intentionally focused button must retain normal accessibility behavior.
- [x] Test twenty additions without scrolling the keypad; edit quantity and price; cancel edits; remove/Undo near an edited item; keyboard entry immediately after mouse/touch use.

## 3. Accidental touches and duplicate actions

Files: `src/ui/PosButton.tsx`; proposed `src/app/action-guards.ts`; pointer-focused browser tests.

Use different protection levels for different consequences. A universal 300–500 ms debounce would drop legitimate digit input and is unsuitable here.

| Action | Protection | Recovery |
| --- | --- | --- |
| Digits, decimal, backspace | One activation per completed press; no cooldown; no long-press repeat | Backspace / Clear input |
| Add / Save | Validate current entry; consume it atomically; reject a second activation of the consumed entry | Undo last addition or edit |
| Delete line | Distinct control with adequate spacing; activate on release | Persistent Undo until the next relevant mutation |
| Clear sale | Explicit confirmation with Cancel initially focused | Optional single Undo while still in this sale |
| Pay | Disabled with no lines; block if a valid entry or edit is still pending | Back to sale |
| Complete & Print | Atomic transition out of payment; one print operation at a time | Retained completed sale and change |
| Print Again | Explicit label; no automatic duplicate retry | Check printer/paper before retrying |
| New Sale | Require release; ignore held-key repeat and stale touch from previous screen | Keep change visible until intentional activation |

- [x] Add regression tests before implementing pointer guards: press-drag-release outside, pointer cancellation, two simultaneous fingers, long press, rapid duplicate completion and held Enter.
- [x] If touch-motion testing finds accidental activations, cancel a touch when movement crosses a measured threshold (start testing at 10 CSS px). Do not block scrolling, mouse use, keyboard access or zoom.
- [x] Do not enlarge invisible hit areas into neighboring buttons. Reserve a visible inactive gutter around consequential controls.
- [x] Do not auto-complete on Enter in the payment screen. Physical Enter is used heavily for item entry and should not become an irreversible action after a screen transition.
- [ ] Verify that a held finger from the old screen cannot activate a newly rendered control. Avoid putting Complete and New Sale in the same screen position.
- [x] Consider a short explicit confirmation for discarding an unprinted completed receipt; keep normal successful New Sale one tap. This needs counter-use validation so warnings do not become habitual noise.

These are app-level protections, not a guarantee of hardware palm rejection. [W3C pointer cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html) supports release-based activation; [enhanced target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) provides a 44 × 44 CSS px baseline, with exceptions. This POS uses a stronger 48 px floor and aims for 56–72 px frequent controls where screen space permits; those larger values are project design targets.

## 4. Payment without silent omissions

Files: `src/App.tsx`, `src/domain/payment.ts` if extracted, Playwright payment cases.

- [x] If the cashier taps Pay while typing a price, keep the calculator visible and explain `Add or clear the current price before payment`. Never silently discard the entry or auto-add it.
- [x] Use a local touchscreen cash keypad on the payment screen. Match number positions to the sale keypad; avoid Android's software keyboard covering change or Complete.
- [x] Show `Still due Rs 20.00` when cash is short. Show a large Change only once the received amount is valid and sufficient; avoid a misleading zero for malformed input.
- [x] Keep Exact and a small set of sufficient rounded cash amounts; exclude shortcuts below the total. Reset stale cash/change whenever the basket or payment method changes.
- [x] Distinguish Cash and Other by label and selected state, not color alone. Other payment should show `Payment: Other` and omit cash/change on the receipt.
- [x] Avoid silently treating Other as confirmation of an external card/mobile-money transfer; use a short reminder to verify that transfer at completion.
- [x] Test empty cash, partial decimal, too many decimals, insufficient cash, method switching, editing the basket after cash entry and very large valid amounts. Bound amounts safely without crashing shortcut generation.

## 5. Fast correction rather than repeated warnings

Files: sale-state reducer if extracted, `src/App.tsx`, focused unit and browser tests.

- [x] Add a bounded, in-memory Undo for the most recent addition, deletion or edit. Label the action specifically, such as `Undo added Rs 25.00`.
- [x] Clear stale Undo on payment completion/New Sale. Stable identifiers must preserve the intended item when restoring a line.
- [x] Keep error text beside the relevant control. Invalid decimal entry should preserve the last valid input; payment errors preserve the basket and received amount for correction.
- [x] Use confirmations for removal of the whole basket, not for every line or digit. Keep correction controls reachable without stretching across the full tablet.
- [x] Test full cancellation paths, edit/Undo interactions, repeated decimal, input limits, and error dismissal without accidental state changes.

## 6. Printing and interruption recovery

Files: `src/printer/adapter.ts`, native ShopPrint, `src/domain/draft.ts`, service-worker plugin.

- [x] Add an explicit reconnect-to-selected-printer action. Read the saved printer address, and make selection versus connection clear. Do not continuously reconnect or make BLE device-picker requests without a user gesture.
- [x] Separate connection, permission, paper-check and write failures into short actionable messages. Do not expose raw native stack/socket wording as the primary user guidance.
- [x] Bound connection/print attempts and release UI locks reliably after timeout. Cancellation must close or abort the underlying native operation, not only abandon its JavaScript promise.
- [x] Preserve a receipt snapshot and its date while retrying. A retry must not complete payment again or create another sale.
- [x] Keep completed transactions in memory only. Refresh recovery is limited to the unfinished basket, with no ledger or permanent receipt history.
- [x] Defer service-worker activation while a sale/payment/print is active; activate a ready update at a safe new-sale boundary. Do not surprise-reload an active sale.
- [ ] Verify offline first load after one successful load, network loss mid-sale, blocked storage, app background/resume, denied Bluetooth permission and printer disconnect during writing.
- [ ] On hardware, power on BT-80UBW, release the ERP app's connection, connect, test 80 mm output, print the acceptance receipt, then test paper-out/disconnect/retry. A write acknowledgement is evidence of bytes sent, not physical paper output.

## 7. Comfortable long-shift use

Files: `src/style.css`, SoundManager, minimal local preferences if necessary.

- [x] Keep the layout stable: no animated movement of keypad, changing digit positions, auto-moving primary buttons or expanding status banners that push controls offscreen.
- [x] Use a calm light background, dark text, tabular money figures and restrained emerald accents. Reserve strong warning colors for errors. Preserve visible focus and meaningful labels with sound off.
- [ ] Keep taps short and quiet; distinguish normal, positive, destructive and error sounds without jingles or queues. Test at the counter's normal ambient noise, using device volume and the existing On/Off setting.
- [x] Avoid permanent flashing, bounce animations and unnecessary vibrations. Respect reduced-motion preferences; use a brief static highlight for successful additions.
- [ ] Test Android font/display scaling and both tablet orientations. If larger text no longer fits, allow the appropriate panel to scroll rather than clipping controls or shrinking text below readability.
- [ ] Evaluate the tablet on a stable adjustable stand, close enough that taps do not require repeated reaching. Adjust tilt and counter placement for readable text without glare or leaning. Keep the screen near the normal line of sight, and let the operator change stance or hand when practical.
- [ ] Evaluate optional left-hand layout only after observation shows it is needed; persist it locally and change it from settings, never during active entry.

Placement and lighting considerations are grounded in [OSHA monitor guidance](https://www.osha.gov/etools/computer-workstations/components/monitors) and [workstation environment guidance](https://www.osha.gov/etools/computer-workstations/workstation-environment). They are general workstation principles; actual comfort must be assessed at the shop's counter, not inferred from screen dimensions alone. Do not add break-reminder popups during checkout.

## 8. Validation and rollout sequence

Each phase starts with reproducing its named failure or writing a failing behavior test, then implements the smallest change, runs the relevant tests, and ends with review plus full `npm run check` before deployment.

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| A — current | Right-side full-height Add, disabled invalid input | All three viewport projects pass; no digit shrinkage below 48 px; accidental duplicate adds one line |
| B | Pending-entry Pay guard, explicit edit/cancel, stable IDs and Undo | No dropped price and no wrong-line edit in regression cases |
| C | Pointer/held-key/multi-touch protections and atomic sale transitions | Canceled touches do nothing; rapid valid digits all register; no duplicate completion/print |
| D | Local cash keypad and clear due/change states | Entire payment flow usable without soft-keyboard occlusion; malformed/short cash cannot complete |
| E | Printer reconnect, bounded failure handling and safe update activation | Hardware checks pass when printer is available; sale stays usable while disconnected/offline |
| F | Counter-use tuning and final long-shift trial | Operator can sustain normal workload, identify/recover from planted errors and report acceptable reach, sound and readability |

Measure the existing workflow first, then compare on the same tablet and operator: median time to enter 20 known lines, correction time, missed/doubled taps, mistaken Pay activations and total hand travel. Run short trials first, then a representative busy-counter session; extend to a long shift only after the basic issues are resolved. Record observations in a QA document, not in permanent in-app sales storage.

Suggested engineering targets, to validate rather than claim as facts: pressed appearance by the next frame; no queued sounds; at least 10 intentional digit taps/second in a short burst without loss; 20-line input no slower than baseline; zero unintended completion in scripted cancellation/repeat tests. Real sound latency needs on-device listening or measurement. Test screen edges, glare, one-handed use, sweaty fingertips, multiple fingers and interrupted attention. Do not use aggressive timing thresholds that reject legitimate input.

Release small phases to the existing static hosting, keep versioned release directories for rollback, and rebuild/sync the Android shell when native behavior changes. Before each rollout, check unfinished-sale compatibility, receipt arithmetic, screenshot bounds, focus, disabled actions, sound failure and the Rs 140/Rs 200/Rs 60 acceptance flow. Keep physical printer verification explicitly pending until the device is available.

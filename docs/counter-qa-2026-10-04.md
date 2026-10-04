# Counter ergonomics and safety verification

Target: Samsung SM-X230, 1280 × 722 CSS landscape viewport, DPR 1.5. Separate amber calculator identity for Simple POS in the web header/favicon and Android adaptive/legacy launcher icons.

## Automated evidence

- Type checking and ESLint pass.
- Unit tests verify integer cents, fractional quantities, half-cent line rounding, final whole-rupee round-up, receipt cut bytes, cash boundaries, and update eligibility.
- Browser tests cover Samsung landscape, desktop landscape and phone portrait: right-side Add geometry, large × above Add, visible quantity and immediate reset, acceptance total Rs 140 / cash Rs 200 / change Rs 60, editing/cancel, labeled Undo, pending-price Pay guard, cash keypad, partial/malformed/short cash, payment method changes, and retained receipt confirmation.
- Pointer tests cover drag-away, cancellation and secondary contacts. Held Enter is ignored; routine digits have no cooldown.
- Twenty consecutive two-at-Rs-10 additions produce Rs 400 without moving Add. Editing the final price to Rs 25 produces Rs 430, and Undo restores Rs 400. This is a scripted regression, not an operator speed measurement.
- Simulated BLE verifies actual ESC/POS bytes, print retry, one receipt for duplicate completion, timeout abort, released UI lock, and deferred update activation.
- Blocking local preference writes and audio playback does not block checkout. Real service-worker offline reload retains the calculator and logo.

## Hardware and operator gates

The updated frontend was loaded on the actual SM-X230 with 20.8 px Android-scaled body text, 1280 × 722 CSS viewport and DPR 1.5. The × button sits above Add, with the keypad, whole-rupee total and Pay visible. The native bridge connected to the selected BT-80UBW using 80 mm formatting and acknowledged the test slip, the Rs 140 / cash Rs 200 / change Rs 60 receipt, and the 1.25 × Rs 15.50 receipt (line Rs 19.38, round-up Rs 0.62, total Rs 20). Each payload included the cut command. Both completed-sale change checks passed and the tablet's original typed price was restored afterward. Physical paper quality and cutter operation need the operator's confirmation; Bluetooth write acknowledgements alone cannot verify them.

Final local verification: 13 unit tests and 55 browser checks passed, with two intentionally skipped viewport-only cases. GitHub CI also passed on commit `89a5970`. The full tracked tests remain intact; earlier user deletions in the local acceptance-test file were left unstaged.

The user has now powered on and connected the BT-80UBW, allowing a receipt/cutter smoke test. Paper-out/disconnection recovery, listening to actual click latency/volume, palm rejection and long-shift comfort remain pending. Software tests cannot certify physical paper output or distinguish an unintended but valid price.

At the counter, compare the old and new layout using the same 20 known lines: median entry time, correction time, missed/double taps and reach. Adjust stand tilt/glare and device sound volume. Test with normal shop noise, interrupted attention and both hands. Add a left-handed layout only if observed use warrants it; avoid prompts during checkout.

Deployment uses a new static release directory and reversible symlink switch. The Android artifact remains a debug APK for device testing; release signing is a separate distribution step.

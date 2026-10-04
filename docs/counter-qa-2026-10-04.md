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

The user has now powered on and connected the BT-80UBW, allowing a receipt/cutter smoke test. Paper-out/disconnection recovery, listening to actual click latency/volume, palm rejection and long-shift comfort remain pending. Software tests cannot certify physical paper output or distinguish an unintended but valid price.

At the counter, compare the old and new layout using the same 20 known lines: median entry time, correction time, missed/double taps and reach. Adjust stand tilt/glare and device sound volume. Test with normal shop noise, interrupted attention and both hands. Add a left-handed layout only if observed use warrants it; avoid prompts during checkout.

Deployment uses a new static release directory and reversible symlink switch. The Android artifact remains a debug APK for device testing; release signing is a separate distribution step.

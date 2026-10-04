# Acceptance evidence — 4 October 2026

- `npm run check`: type check, lint, 8 unit tests and 19 Playwright tests passed (2 viewport-specific cases skipped outside the Samsung project).
- Actual Samsung landscape viewport measured at 1280 × 722 CSS pixels, DPR 1.5. Layout adapts to system bars: keypad, total, Add Item and Pay remain visible without page scrolling. Tested touch targets are at least 48 pixels high.
- Independent review confirmed Undo/edit correctness and unfinished-basket session recovery. Completed sales are discarded on reload, keeping them memory-only.
- Landscape and portrait: Rs 140 total, Rs 200 received, Rs 60 change retained after completion; New Sale resets to quantity 1 and Rs 0.
- Rapid keyboard sequence `1234567890` registers with audio deliberately blocked. Undo, clear confirmation, quantity/price edits and short-cash rejection tested.
- Browser BLE transport simulated at the Bluetooth boundary; real ESC/POS receipt bytes contain Rs 31 total and Rs 19 change for `2 × 15.50`, cash Rs 50. Print Again tested.
- Production HTTPS returns 200. All static assets load. Live Rs 140 acceptance calculation verified with Chromium. After service-worker activation, offline reload succeeds.
- Android debug APK builds successfully with JDK 24, Gradle 8.14.3 and Capacitor 8. Installed as `com.bahadoor.simplepos` alongside the existing ERP app on Samsung SM-X230.
- Native plugin lists the paired BT-80UBW printer. Connection attempt failed with socket timeout. User confirmed the printer is unavailable and physical printing should be tested later.

## Still requires hardware confirmation

Power on the BT-80UBW, release any other app's connection, connect in Simple POS settings, choose 80 mm, and press Test Print. Run the Rs 140/Rs 200 acceptance sale and inspect the paper. Check rapid touch entry, audible click latency and volume on the tablet. Software tests cannot confirm acoustic quality or physical paper output.

The APK provided is a debug build for acceptance testing; production Android distribution needs a securely signed release build.

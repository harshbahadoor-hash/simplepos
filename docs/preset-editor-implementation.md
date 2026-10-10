# Editable shared presets and the tablet side panel

## Delivered scope

Settings → Manage presets is available at an empty sale. Both laptop and tablet can add, edit, hide and delete up to five top-level groups in total, including Ghee and Oil. Each group may contain direct prices, or optional type and brand levels. Four levels include the final price choice. Choices accept a size, an item name, or an empty label for a price-only button. The original 75 prices and hierarchy are the initial seed.

Every edit first goes into a local draft. Review lists old/new values and deleted paths. Publishing is explicit, with no authentication as requested. Deletion has confirmation and one-step Undo; changes of at least 50% or Rs 500 require acknowledgement. Input errors retain the typed entry. A draft can be kept across reloads or explicitly discarded.

The tablet landscape checkout has calculator, narrower Current Sale, and Quick Presets side by side at widths of at least 1100 CSS pixels. Current Sale scrolls independently. The keypad, Times, Add, total and Pay retain large targets. The preset panel has its own scroll area, category navigation, and protection against repeated taps. Smaller layouts retain the existing popup picker. Additional groups are reachable through More.

## Sharing and failure behavior

- Visible devices check every 30 seconds and on focus/connection changes, with conditional reads. Sales, money calculations, sounds, and printing remain local.
- Active sale lines and their reference presets stay fixed until an empty-sale boundary. The completed receipt still uses its original quantity/price snapshot.
- Offline selling uses validated cached settings. A corrupt newest cache falls back to the previous valid copy. Unpublished edits do not silently publish on reconnection.
- Publication uses the reviewed base revision and a request identity. Stale writers cannot overwrite newer settings. A lost response is reconciled using a read-only publication-status route.
- The configuration service uses bounded JSON files outside static releases. Writes are serialized, flushed and renamed atomically; five previous configurations and bounded replay records are retained. Recovery is exposed under a newer revision so cached devices receive it.
- No sales, payments or receipts are sent to this service. There is no sales history or database.

The larger October 7 design remains a design document: advanced moves/reordering, bulk edits, automatic conflict merging, and export/import tools are outside this CRUD release. A conflicting draft is retained until the user explicitly reconciles or loads the newer version.

## Verification

Browser checks cover original Ghee/Oil menus, decimal quantity, generic receipt lines, payment without printing, the five-group cap, direct named/size/price-only choices, validation, draft reload, large-change review, deletion/Undo, local storage failures, stale writers, sharing races, repeated taps and screen bounds. Server checks cover concurrent publishing, replay, malformed uploads, disk failures, restarts and recovery.

Final local checks on October 10, 2026: type checking and lint passed, 63 unit tests passed, 257 browser cases passed, and 19 cases were intentionally skipped where their landscape-only interface is absent. All 29 configuration-service cases and three native lifecycle checks passed. Regression coverage includes long labels and price-only buttons during rapid navigation, tablet rotation, and returning from payment before deleting the last item. Physical tablet acceptance is recorded after deployment.

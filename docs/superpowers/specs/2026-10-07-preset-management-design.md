# Shared preset editing design

Status: proposed design, requested by the user; application changes are not implemented by this document.

## Goal and confirmed choices

Edit and publish categories, oil types, brands, item/size labels and prices from both the laptop and tablet. Published changes automatically reach the other device. Keep calculator entry, payment and Bluetooth printing fast and local.

The user chose automatic sharing, editing/publishing from both devices, and no publishing protection. There will be no login, PIN, accounts, roles, pairing, JWT or device authorization. Consequently the publishing endpoint is publicly writable: anyone who accesses it can change shared presets. Validation, confirmation, revision checks and backups reduce mistakes and help recovery; they do not restrict who can publish.

Shared editable reference configuration requires a small preset configuration service. This is a deliberate addition to the earlier frontend-only architecture. It stores JSON files, not a database. It never receives baskets, sales, receipts, cash received, payment details or printer credentials. No sales/payment/authentication endpoints are introduced.

## Current application and migration baseline

- React/TypeScript/Vite frontend and Capacitor Android shell.
- `src/domain/presets.ts` contains twelve Ghee brands with 40 price choices and five Oil types with 35 choices.
- Cow ghee is now 150 g Rs 115, 400 g Rs 275, 800 g Rs 500 and 1.6 kg Rs 900.
- `PresetPicker.tsx` imports fixed arrays; `Calculator.tsx` hardcodes Ghee/Oil shortcuts; settings currently live in `Counter.tsx`.
- Basket/receipt lines contain only quantity and price. Preserve this boundary.
- Local cents arithmetic, decimal quantities, upward whole-rupee sale rounding, sounds, print retry, automatic cutting and original/combined receipt formats remain unchanged.
- The generated service worker caches application assets. Shared preset requests must bypass that asset cache.

## Alternatives considered

Local editing with manual export/import is smallest but does not provide the requested automatic sharing. Laptop-only publishing over existing SSH avoids a public write service but does not provide independent tablet publishing. A shared JSON configuration service meets both-device editing without introducing a database; this is the selected design, using unrestricted publishing as requested.

## Reference configuration model

A versioned document contains `schemaVersion: 1`, a server-owned increasing `revision`, `updatedAt` and ordered `roots`. Nodes are either groups or selectable items. Groups have an internal stable editor key, label, visible flag and ordered children; item nodes have an internal stable editor key, label, visible flag and integer `priceCents`. These internal keys support editing, reordering and conflict detection; they are not product IDs or SKUs and are never copied into baskets or receipts.

Maximum nesting is four displayed levels, counting the root: Oil → Mustard oil → RKG → 500 ml. Shorter paths remain supported: Ghee → Cow ghee → 150 g, Chameli oil → 100 ml, or a new category → directly selectable item. No empty brand selector is required for unbranded items.

Existing labels and prices migrate exactly. Existing root buttons remain Ghee and Oil. New roots appear in an All presets picker; do not grow the keypad shortcuts into an overflowing row. Two preferred root shortcuts may be selected locally, with Ghee/Oil initially selected. Hiding a parent hides its descendants in checkout, while the editor can still show them.

## Editing workflow

Entry: Settings → Manage presets. Make this a separate workspace, never an edit icon beside the live price buttons. Open management only at an empty-sale boundary: no basket lines, pending entry, multiplied quantity, item edit, payment/completed receipt, busy print or existing dialog. If a sale is active, explain that it must be finished first; never clear it automatically.

The management workspace presents a breadcrumb, searchable current-level rows and a persistent action footer. Laptop/tablet landscape uses navigation at left and the selected group's rows/editor at right; portrait uses a single column. Each row has an explicit Edit action. Selecting a row in management never adds a sale item.

Supported actions:

1. Add category, subgroup/type, brand or item/size. Select its parent explicitly; show the complete path before saving.
2. Edit group/item label and item price. A price field displays Rs and accepts at most two decimal places.
3. Add another size in the same brand without re-entering its path. Allow several rows to be entered in one session.
4. Duplicate an item/group into a draft, focusing the new label; the duplicate must be renamed to resolve sibling duplication before publication.
5. Move an item/group using explicit destination selection. Reject movement into itself or descendants, and movements beyond the depth limit.
6. Reorder with Move up/down controls; dragging is optional and must never be the only method.
7. Hide/show for temporary unavailability. Hidden entries remain recoverable in management.
8. Delete an item or entire group. A group confirmation lists descendant counts and full path. Draft Undo restores the last action; publication review lists all removals.
9. Search across paths and labels, including hidden items when Show hidden is on. Price-only bulk edit view shows full paths and existing/new amounts.
10. Preview the checkout picker before publication. Preview selection demonstrates the price without touching a real basket or printing.

Edits are draft-only. Buttons clearly distinguish Save to draft and Publish changes. A footer shows the draft change count and base revision. Closing with a dirty draft offers Keep draft, Discard draft or Continue editing. Drafts survive restart on their originating device and are never published automatically.

## Validation and mistake recovery

- Trim label edges; require 1–80 characters; reject control characters. Use case-insensitive normalized sibling duplicate checks, including hidden siblings. Duplicate names in different parents are permitted.
- Prices must be positive integer cents, representable by the existing `parseMoney` rules, at most Rs 99,999,999.99. Reject negative, zero, malformed, non-finite and >2-decimal inputs. Display field-specific errors without discarding typed input.
- A change of at least 50% or Rs 500 from an existing price is highlighted in review and requires explicit acknowledgement. This is a warning, not a permanent price cap.
- Limit documents to 1 MiB, 2,000 nodes and four levels. Give a concrete limit message. Reject duplicate internal keys, invalid child structures, excessive nesting and unsupported schema versions before any write.
- An empty draft group is allowed; publication requires that every visible group has at least one visible item descendant and at least one visible root/item remains.
- Publish review shows additions, removals, hidden/shown entries, moves, reorder changes and price old → new, with complete paths. Only Publish commits shared changes.
- Publish, delete confirmation, restore and import are protected against duplicate touch submission. Numeric entry stays immediate. Use the existing sound manager and visible pressed/focus states.
- Server rejection preserves the draft. Storage quota failures must be visible and must not falsely claim that a draft or revision has been saved.

## Publication and simultaneous edits

The service is the authority for shared revisions. A draft records the revision from which it was created. Publication supplies that expected revision with an idempotency key. Under a serialized write lock the server validates the document and compares the expected revision before replacing the live file atomically. A stale base is rejected with HTTP 412 and makes no changes. Repeating the same publication request returns its original result rather than committing twice.

Conflict UI shows which paths changed remotely and preserves local edits. Permit explicit reapplication of non-conflicting draft operations onto the latest revision. If the same field or ancestor changed, require Keep remote or Use my draft for each conflict, including deletion-versus-edit cases. Review the rebuilt draft before publishing again. Never use silent last-write-wins replacement.

Do not roll back local edits automatically after a network timeout: the write may have succeeded. Read the latest revision and look up the idempotency result before retrying. Automatic retries may read status, but never silently publish an unsent draft.

## Automatic distribution and safe sale boundaries

Fetch the shared configuration at startup, when the app regains focus, when connectivity returns and every 30 seconds while visible. Requests use conditional ETags, a three-second timeout and one in-flight request maximum. After failures, back off to 60, 120 and 300 seconds; foreground/online events may retry sooner. This is eventual sharing, not an instantaneous guarantee: online devices normally discover changes within 30 seconds.

Validate responses before use. Keep the latest valid configuration locally as a JSON preference/cache; retain one previous valid snapshot. If offline or invalid, use the last valid snapshot, then the bundled baseline if no snapshot exists. Display a small Offline/Update pending status without blocking calculator use. Never replace valid presets with an error page or empty invalid response.

Freeze the active preset revision for the entire current sale, including sale entry, payment, completion and reprints. Queue a new revision and apply it only at the same empty boundary used for safe app updates. Existing item prices never change. A laptop price publication during a tablet sale therefore affects the tablet's next sale. A restored unfinished basket similarly keeps already-entered prices; retain its active preset document and revision as reference metadata alongside the existing tab-scoped unfinished draft. A revision number alone is insufficient after multiple remote updates. Clear this sale-specific reference on completion/New Sale; it is not a permanent sale history.

Catalog network calls are independent of entering digits, adding/editing/deleting lines, cash/change calculation and printing. A down service must not prevent any of those actions. Prevent the preset service worker route from being cached as an immutable application asset. App deployment and preset publication have separate revisions.

## Configuration service and deployment

Use the existing server and Caddy HTTPS host. Run a small Node service bound to `127.0.0.1:4318` under a dedicated unprivileged systemd user; Caddy proxies only `/preset-config/*`. This port is a proposed deployment value to check for conflicts before installation.

Public routes: GET `/preset-config/current`, POST `/preset-config/publish`, GET `/preset-config/versions`, GET `/preset-config/publications/:requestId`. These are reference-setting routes only. No login or write authorization. Require JSON, exact schema validation, bounded payloads and modest request rate/body limits to prevent resource exhaustion; these operational limits do not identify trusted users or protect prices against intentional edits.

Store the current document and five configuration-only recovery versions outside frontend release directories, under `/var/lib/simplepos-presets`. Never place them in `/srv/simplepos/current`, because deploying/rolling back the app must not overwrite prices. Device-local draft/cache keys are separate from sound, printer and receipt preferences. Server files contain no secrets or transactions.

Use a temp file in the same filesystem, flush it, then rename to publish. Recovery copies and a bounded idempotency record belong to the same committed revision envelope so partial writes cannot advance revision separately from content. Startup checks the committed envelope and falls back to the last valid backup; unhealthy reads should report an error rather than serve an invented empty catalog.

## Backups, imports and restoration

Export the current shared configuration or local draft as a human-readable JSON file with format/schema metadata. Imports validate first, show counts and differences, and replace only the local draft. Publishing is a separate reviewed step. Initial version offers Replace draft only; avoid an ambiguous automatic merge of imported keys/labels. Export contains no sale, receipt, payment or Bluetooth data.

Restore a prior server configuration by bringing it into a draft and publishing it as a NEW revision. Do not rewind revision numbers. Restore bundled defaults likewise starts a reviewed draft and never changes live prices on first tap. Keep five server configuration recovery versions and one prior valid local cache; they are settings recovery, not a sales history.

Verify actual Android file download/upload behavior before committing to WebView-only export. If file sharing requires native support, isolate a small config-file bridge from the existing printer bridge, with Android system document selection/share UI and no broad storage permission. Native backup support would require a new APK; basic editing/sync can ship as frontend updates if existing native networking permits the same-origin requests.

## Acceptance examples

1. Laptop changes Cow ghee 150 g Rs 115 → Rs 120, adds a test size and publishes. An idle online tablet sees the change within one polling interval and selects the new price without restarting. Revert the test through a reviewed configuration publication.
2. Tablet edits a brand, adds a size, publishes; laptop receives the same revision.
3. Tablet has an Rs 115 line while laptop publishes Rs 120. That line, sale total and reprinted receipt remain Rs 115. New Sale applies the pending revision.
4. Both devices edit revision 8. Laptop publishes revision 9. Tablet publication based on 8 is rejected, preserves its draft and can reconcile explicitly into revision 10.
5. Publish succeeds but the response is lost. Retry/status reconciliation produces one new revision.
6. Offline sale and Bluetooth print work. Offline editor keeps a draft and plainly says Not published. Reconnection fetches current settings but does not publish automatically.
7. Invalid JSON, negative/zero price, overlong/deep data, duplicate labels, deletion of the last visible entry and disk-write failure leave the shared configuration untouched.
8. All names stay absent from both receipt line modes. Decimal quantity arithmetic, whole-rupee rounding and automatic cut remain correct.
9. Landscape 1280 × 722 at actual Android text scaling shows the edit form's price, Save/Cancel and publishing footer without overlap; portrait scrolls naturally and keeps actions accessible above the soft keyboard.
10. New frontend releases retain custom presets, drafts and publishing revisions; rollback of the frontend does not reset server settings.

## Limits to communicate

No protection was requested, so there is no trusted-editor distinction. An online client receives configuration updates eventually; an offline device keeps its cached prices. Clearing device data removes local drafts and caches, but not the shared server configuration. Device-clock timestamps are not used to resolve simultaneous edits. The service verifies publication, not physical receipt output.

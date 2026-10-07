# Shared Preset Management Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task, with independent verification at each boundary. This document proposes work; unchecked tasks are not implemented.

**Goal:** Allow the laptop and tablet to edit and publish preset groups, brands, items/sizes and prices, and automatically receive the same reviewed settings.

**Architecture:** Add a validated preset document and draft editor, a local cache/safe-update coordinator and a small Node JSON configuration service. Preserve a strict boundary between reference presets and anonymous, temporary local sales.

**Tech stack:** Existing React, TypeScript, Vite, Vitest, Playwright, Capacitor, Caddy and systemd; Node runtime compatible with the repository's Node >=24 requirement, verified on the host before installation. No database/ORM or mandatory new UI dependency.

**Spec:** `docs/superpowers/specs/2026-10-07-preset-management-design.md`.

## Global constraints

- Both laptop and tablet edit and publish; automatically share via one server configuration.
- User explicitly requested no publishing protection. No login, PIN, accounts, roles, device pairing or JWT. Public writes are an accepted limitation, not a secure-editor guarantee.
- JSON reference settings only; no database, permanent sales storage, inventory or accounting.
- Preserve quantity default 1, two-decimal quantities/prices, integer cents, upward whole-rupee final total and generic receipt lines.
- Preserve click sounds, fast keypad, selected printer, original/combined formats and automatic cutting.
- Four displayed levels maximum; 2,000 nodes; 1 MiB document; labels 1–80 characters; price >0 and <=9,999,999,999 cents.
- Preset updates apply only at an empty-sale boundary; active baskets/receipts remain unchanged.
- Poll visible online clients every 30 seconds with conditional reads; offline sales still work.
- Preserve the pre-existing user modification in `e2e/sale.spec.ts`; never stage or reset unrelated changes.

## Interfaces and file responsibilities

Create `src/presets/model.ts` for types/validation/baseline conversion and `src/presets/draft.ts` for immutable editor operations/diffs/conflicts. `src/presets/storage.ts` owns JSON cache/draft persistence; `src/presets/sync.ts` owns conditional fetching and pending revisions. `src/presets/usePresets.ts` adapts that state to React. Create `src/ui/PresetManager.tsx`, `src/ui/PresetEditor.tsx` and `src/ui/PresetReview.tsx` for management/navigation, fields and publication review respectively. Keep `src/ui/PresetPicker.tsx` focused on checkout selection.

Create `server/presets/store.mjs` for committed envelopes and serialized writes, `server/presets/http.mjs` for routes/body limits, `server/presets/validate.mjs` for deployed schema validation and `server/presets/main.mjs` for startup. Share the validator's authoritative constraints through a small serializable schema definition in `src/presets/schema.json`, imported by frontend and server; test both against the same invalid fixtures. Create `deploy/simplepos-presets.service` and `deploy/preset-config.caddy` for reviewable installation configuration. Server modules are independently tested with Node's built-in test runner; browser/domain tests use existing tools.

Core contract:

```ts
type PresetNode =
  | { key: string; kind: 'group'; label: string; visible: boolean; children: PresetNode[] }
  | { key: string; kind: 'item'; label: string; visible: boolean; priceCents: number };
type PresetDocument = { schemaVersion: 1; revision: number; updatedAt: string; roots: PresetNode[] };
type PresetDraft = { baseRevision: number; base: PresetDocument; document: PresetDocument; operations: DraftOperation[] };
```

`DraftOperation` is a tagged operation with target key, parent/destination key where needed, and before/after values for add, rename, set-price, set-visible, move, reorder and delete. Deleted subtree data is retained only in the local draft for Undo. `validateDocument(input: unknown): PresetDocument`, `baselineDocument(): PresetDocument`, `applyOperation(draft, operation): PresetDraft`, `diffDocuments(before, after): PresetChange[]` and `reconcileDraft(draft, remote): { draft: PresetDraft; conflicts: PresetConflict[] }` are the explicit frontend interfaces. `readCurrent(): Promise<PresetDocument>` and `publish(document, expectedRevision, requestId): Promise<PresetDocument>` are service/client interfaces. Server-assigned revision/time replace client values when publishing.

## Task 1: Validated baseline and dynamic checkout picker

Files: create `src/presets/model.ts`, `src/presets/schema.json`, `src/presets/model.test.ts`; modify `src/domain/presets.ts`, `src/ui/PresetPicker.tsx`, `src/ui/Calculator.tsx`, `src/app/Counter.tsx`; add `e2e/preset-navigation.spec.ts`.

- [ ] Write failing tests for baseline migration: exactly 40 Ghee and 35 Oil choices; Cow ghee four approved prices; all original paths and cents preserved. Do not generate expected values from the same migration function.
- [ ] Add shared malformed-document fixtures: duplicate keys, non-integer cents, >2,000 nodes, >4 levels, zero price, hidden-only visible group and invalid labels. Check exact field/path errors.
- [ ] Implement immutable baseline conversion, document validation and node traversal. Assign deterministic editor keys to bundled nodes; newly created nodes use `crypto.randomUUID()`.
- [ ] Pass validated nodes into the checkout picker instead of importing fixed arrays there. Keep breadcrumbs, decimal entered quantity, pending-price guards, focus return, tap-through protection and generic `choose({size, price}, label)` compatibility at the boundary.
- [ ] Add All presets without crowding keypad buttons; keep two selected root shortcuts locally. Exercise direct items and newly created root/type/brand paths.
- [ ] Run `npm run test -- src/presets/model.test.ts` and `npx playwright test e2e/presets.spec.ts e2e/oil-presets.spec.ts e2e/preset-navigation.spec.ts`. Check the real touch bounds in all existing projects.
- [ ] Commit only this independently verified change.

Representative independent assertions:

```ts
expect(findItem(document, ['Ghee', 'Cow ghee', '1.6 kg']).priceCents).toBe(90000);
expect(() => validateDocument(withPrice(document, 115.5))).toThrow(/integer cents/);
expect(() => validateDocument(withPrice(document, 0))).toThrow(/greater than zero/);
```

Define test fixture helpers locally; these are tests against public validation, not additional production interfaces.

## Task 2: Draft operations, validation, Undo and local persistence

Files: create `src/presets/draft.ts`, `src/presets/storage.ts` and their `.test.ts` files.

- [ ] Write failing operation tests for add/edit/duplicate/move/hide/delete/reorder and immutability. Include moving a parent into a descendant, deleting a group then Undo, same-name siblings differing in case, and same labels under different brands.
- [ ] Implement the tagged operation contract. Compute review changes from before/after documents so edit-then-revert cancels out rather than producing a misleading change count.
- [ ] Store `simplePosPresetDraftV1`, `simplePosPresetCacheV1`, `simplePosPresetPreviousV1` and local shortcut choices separately from all sales/printer preferences. Validate on read; never trust local JSON solely because parsing succeeded.
- [ ] Make draft saves explicit success/failure results; expose quota/unavailable-storage failure without discarding current in-memory work. Reopening restores the unsent draft and its base revision.
- [ ] Implement the 50%/Rs 500 change warning and positive money parsing using existing `parseMoney`; all warnings must be acknowledged again if the reviewed draft changes.
- [ ] Run `npm run test -- src/presets/draft.test.ts src/presets/storage.test.ts`; verify reload recovery without creating a sales ledger.
- [ ] Commit the draft engine independently of UI.

## Task 3: Tablet/laptop management workspace and publication review

Files: create `src/ui/PresetManager.tsx`, `src/ui/PresetEditor.tsx`, `src/ui/PresetReview.tsx`; modify `src/app/Counter.tsx`, `src/style.css`; add `e2e/preset-management.spec.ts`.

- [ ] Create failing browser scenarios for entering management only with an empty sale, editing a price without changing checkout until publication, Save-to-draft versus Cancel, rename and add-another-size, group deletion counts, Undo and dirty-close choices.
- [ ] Add Settings → Manage presets using existing `Dialog` and `PosButton`. Keep editor state and keyboard handlers separate from the counter; Enter in a price field must never add a sale item or publish globally.
- [ ] Implement a bounded landscape workspace, breadcrumbs/search, full-path rows, explicit Edit controls and item/group forms. Use 56px minimum editor action targets, gaps of at least 10px and high-contrast selected states. Keep the editing footer visible above the software keyboard without compressing inputs below usable sizes.
- [ ] Add explicit Move up/down, destination chooser, Show hidden, duplicate, multi-row Add sizes and price-only bulk edit. Avoid hover-only menus and destructive swipe gestures.
- [ ] Build a review screen with old/new values, affected paths, highlighted large changes and a separate Publish action; freeze the exact reviewed snapshot while the request is in flight.
- [ ] Preview uses isolated state and does not call `Counter.choosePreset`, print or modify a sale draft.
- [ ] Run `npx playwright test e2e/preset-management.spec.ts` with 1280×722, Android text scaling, landscape tablet and phone portrait; verify soft-keyboard behavior on connected hardware when available.
- [ ] Commit reviewed editor behavior. Publishing remains explicitly unavailable until Task 4's configured service exists.

## Task 4: JSON service, atomic publishing, revisions and recovery

Files: create `server/presets/{validate,store,http,main}.mjs`, `server/presets/{store,http}.test.mjs`, `deploy/simplepos-presets.service`, `deploy/preset-config.caddy`; modify `package.json` to add `test:presets-server`.

- [ ] Write failing temporary-directory tests for successful revision increment, invalid-document no-write, stale revision rejection, duplicate request handling, two concurrent publishes and simulated flush/rename failures. Use actual HTTP tests for payload/type/route handling.
- [ ] Implement bounded parsing and validation against shared constraints. Same-origin Caddy hosting, JSON-only writes and practical request limits apply without user identity or credentials.
- [ ] Bind localhost; use a dedicated data directory and one writer. A committed envelope holds catalog, five recoverable versions and a bounded request-result map; commit them together with same-filesystem atomic replacement.
- [ ] Implement GET current with ETag/304, POST publish with `If-Match` and `Idempotency-Key`, GET versions and GET publication status. Return 412 with current revision on stale writes, 400 for invalid input, 413 for oversized input and 503 for failed storage without an in-memory-only success response.
- [ ] Retain idempotency outcomes for 24 hours, capped at 1,000 requests. Prune expired entries; if all 1,000 entries are still within that window, reject new publications temporarily rather than evicting a live retry result. If status has expired, compare committed revision/content and require review before treating a retry as a new operation; never infer failure from a missing response alone.
- [ ] Test restart, corrupted-primary recovery and a restore as a new revision. Ensure frontend deployment rollback cannot touch the reference configuration directory.
- [ ] Run `node --test server/presets/*.test.mjs`; inspect filesystem ownership, loopback binding and Caddy route precedence before installing.
- [ ] Commit service and deployment definitions. Public write access is deliberate per user instruction; do not add hidden authorization gates.

## Task 5: Client synchronization and active-sale protection

Files: create `src/presets/sync.ts`, `src/presets/usePresets.ts`, `src/presets/sync.test.ts`; modify `src/app/Counter.tsx`, `src/domain/draft.ts`, `build/service-worker-plugin.ts`, relevant service-worker tests; add `e2e/preset-sync.spec.ts`.

- [ ] Write failing clock/network tests for 30-second polling, 304, invalid bodies, timeout, hidden-tab suspension, one in-flight request, backoff and focus/online retry. Use fake timers and controlled responses, not real sleeps.
- [ ] Use same-origin fetch with conditional ETag and no asset-cache interception for `/preset-config/`. Keep newest valid cache and one previous snapshot.
- [ ] Add pending-revision state and reuse the existing `canUpdate` empty-boundary rule without reloading the application. Freeze active preset settings throughout sale/payment/completed receipt; persist the active preset document and revision as reference metadata alongside the existing tab-scoped unfinished-sale draft. Keep sale lines quantity/price only; clear this reference on completion/New Sale. This snapshot is needed because old server revisions may expire.
- [ ] Fetch newer revisions during active sales without applying them; New Sale/empty boundary applies the pending revision. Do not switch visible preset options while a picker or management editor is open.
- [ ] Test two independent browser contexts against a disposable configuration service. Laptop publish changes tablet's next sale; existing lines and original/combined reprints stay unchanged.
- [ ] Test offline entry/payment plus mocked printer writes and confirm no digit/add/delete/cash action triggers a configuration request.
- [ ] Run `npm run test -- src/presets/sync.test.ts` and `npx playwright test e2e/preset-sync.spec.ts e2e/sale.spec.ts`; preserve the user's existing sale test edits.
- [ ] Commit sync with service-worker and sale-boundary coverage.

Representative behavior test:

```ts
await laptop.publishPrice(['Ghee', 'Cow ghee', '150 g'], '120.00');
await tablet.waitForPendingRevision();
await expect(tablet.currentSaleTotal()).resolves.toBe('Rs 115.00');
await tablet.finishSaleAndStartNext();
await tablet.choosePreset(['Ghee', 'Cow ghee', '150 g']);
await expect(tablet.currentSaleTotal()).resolves.toBe('Rs 120.00');
```

Implement the two-context fixture against actual frontend controls and test HTTP service, rather than directly setting application state.

## Task 6: Conflicts, timeout reconciliation, backup/import and restore

Files: extend `src/presets/draft.ts`, `src/presets/sync.ts`, `src/ui/PresetReview.tsx`; create `src/presets/backup.ts` and tests; add `e2e/preset-conflicts.spec.ts` and `e2e/preset-backups.spec.ts`.

- [ ] Write failing conflict scenarios: same price changed twice, rename versus delete, parent deleted versus child added, unrelated brand changes, reordering same siblings and remote revision changing during review.
- [ ] Reapply non-conflicting operations by stable keys. Block unresolved conflicts; offer per-conflict Keep remote/Use my draft, then a fresh review based on current revision.
- [ ] Reconcile an ambiguous publish timeout through publication status/current revision. One successful publication creates one revision even if its response is lost.
- [ ] Export current/draft JSON; import into a draft only after schema validation and difference preview. Keep the live config unchanged until Publish.
- [ ] Restore server backups/bundled defaults into a draft and publish as a new revision. Confirm the scope and price changes first.
- [ ] Check export/download and file import on the real Android WebView. If unsupported, add a separate `PresetFiles` native plugin and `src/presets/native-files.ts` bridge for system file selection/share; do not modify printer transport or request broad storage access. Only this fallback requires an APK rebuild and additional native lifecycle tests.
- [ ] Run conflict/backup unit and browser suites; verify clearing local cache can recover shared settings but never recover an unsent draft without its exported copy.
- [ ] Commit recovery tools with user-facing limitations documented.

## Task 7: Deployment, regression verification and real-device acceptance

Files: update `README.md`, `.github/workflows/ci.yml`, deployment instructions and a dated acceptance record.

- [ ] Verify host Node version and proposed port availability; create systemd user/data directory. Seed once from the reviewed bundled baseline including all 75 existing choices; installation must not reseed on every restart.
- [ ] Install the reviewed service and Caddy route while preserving existing static frontend hosting. Validate Caddy configuration before reload; verify frontend, current JSON, conditional reads and a disposable test publication.
- [ ] Deploy frontend using the established new-release-directory and atomic symlink process. Never store preset JSON inside release directories. Ship native file support only if hardware checks required it.
- [ ] Run `npm run check`, `npm run test:native`, `npm run test:presets-server` and `npm run build`. Add the server suite to CI; inspect the full tracked CI result independently of local user-modified browser tests.
- [ ] With both devices idle, verify laptop → tablet and tablet → laptop publishing. Make changes to clearly named test presets, not live prices; remove them through a reviewed publication afterward.
- [ ] With a tablet sale active, verify a remote price change waits until New Sale; confirm the current sale's old price and change stay visible. Test decimal quantity and total rounding.
- [ ] Test original and combined receipts from that frozen sale. Print one small hardware receipt if source/receipt-boundary changes justify it, confirm no product names and automatic cut with the user; do not print repeatedly for unrelated editor tweaks.
- [ ] Test offline selling, server outage, retained unsent draft, reconnect, concurrent edits, large-price warning and configuration restore. Record measured sync delay and actual tablet editor fit.
- [ ] Final report distinguishes implemented behavior, automated checks, physical confirmations and unavailable hardware checks. State unrestricted publishing and offline limitations plainly.

## Delivery sequence and completion criteria

Tasks 1–3 establish editable drafts and unchanged checkout behavior. Task 4 provides shared publishing. Task 5 distributes changes safely. Task 6 adds conflict/backup recovery. Task 7 makes the integrated result reviewable and deploys it. No task requires a database or a sales backend.

Complete only when both devices can add/edit/hide/delete/reorder and publish presets, idle devices receive changes automatically, concurrent edits cannot silently overwrite, active sales retain their original prices, refresh/offline states recover appropriately and receipt/printing behavior passes the acceptance scenarios. This plan itself does not authorize an implementation claim or indicate that editor functionality is already live.

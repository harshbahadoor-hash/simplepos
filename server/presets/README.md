# Shared preset configuration service

Node 24 standard libraries only. The service imports the browser's shared `src/presets/schema.mjs` validator and immutable `src/presets/defaults.json` seed. It stores configuration only. It has no sales, receipt, payment, login, credentials or device authorization endpoints. Publishing is publicly writable by the user's explicit choice.

Run the independent tests from the repository root:

```sh
node --test server/presets/service.test.mjs
```

For local use, set `PRESET_CONFIG_DIR` to a separate writable directory and run `node server/presets/main.mjs`. Defaults are `PRESET_PORT=4318`, `PRESET_CONFIG_DIR=/var/lib/simplepos-presets`, and `PRESET_ALLOWED_ORIGIN=http://localhost:4318`. The listener always binds to `127.0.0.1`. When using a public HTTPS proxy, set `PRESET_ALLOWED_ORIGIN` to that site's exact origin, without a trailing slash.

## HTTP contract

All responses use JSON and `Cache-Control: no-store`, except the empty conditional 304 response. No cookies or credentials are required.

| Route | Result |
| --- | --- |
| `GET /preset-config/current` | Current document; `ETag: "revision"`. Matching `If-None-Match` returns 304. |
| `POST /preset-config/publish` | JSON body `{ "document": PresetDocument }`, `If-Match: "baseRevision"`, `Idempotency-Key`. Returns the published document and its ETag. |
| `GET /preset-config/versions` | JSON array of up to five previous configuration documents, newest first. |
| `GET /preset-config/publications/:key` | `{ "revision": publishedRevision, "document": currentDocument }`; 404 if the key is absent or evicted. |

Publication keys are 8–128 ASCII letters, digits, hyphens or underscores; UUIDs work. Document revision must equal the quoted If-Match revision. The server owns the new revision and timestamp. Stale publication returns 412 with `{ "error": "...", "current": currentDocument }`; the stale request makes no changes. Invalid requests return 400, oversized payloads 413, conflicting key reuse 409, operational throttling 429 with Retry-After, and unavailable storage 503. No path or storage error details are exposed.

The last 256 accepted publication keys survive restart. Replay identity hashes the validated roots plus the base revision; timestamps and JSON property order do not affect identity. Repeating an accepted operation returns the current document without another write, even when later publications exist. Publication lookup reports the original accepted revision alongside current settings. After key eviction, an old base revision still cannot silently overwrite a newer current revision.

Requests must arrive over loopback with the configured public Host, or the actual loopback Host and service port for local CLI use. Origin may be absent, or must exactly match PRESET_ALLOWED_ORIGIN. Provided X-Forwarded-Host and X-Forwarded-Proto must also match the configured site. Caddy preserves the original request Host and supplies these forwarded headers for the HTTP upstream. The service adds no CORS grants or publishing authorization.

POST accepts uncompressed UTF-8 application/json only. Both request bytes and document bytes are limited to 1 MiB. Shared validation enforces five root groups including hidden roots, four levels, 2,000 nodes, positive integer cents up to 9,999,999,999, stable unique keys and valid visible groups. Price-only items use `label: ""`. Server validation also requires an ISO timestamp and measures UTF-8 bytes rather than JavaScript string characters. Draft-only incomplete documents cannot be published.

Operational limits are process-wide token buckets: 120 requests with refill 2/second, and 30 publications with refill 0.5/second. Up to 32 publications may wait for the write lock. The listener bounds connections, headers and request/socket timeouts. These are resource limits, not authentication.

## Storage and recovery

Exactly one service process owns the directory. `current.json` is a committed envelope containing the current document, five previous documents, bounded publication records and a revision high-water mark. No client-supplied extra fields survive shared document validation. `recovery-<revision>.json` holds up to five prior committed envelopes; its filename identifies either the snapshot's document revision or a newer revision reserved during recovery. Do not expose this directory through the static file server.

Each publication validates and checks replay/revision state under one serialized lock. The old envelope is atomically saved as a recovery copy. Then the next envelope is written to an exclusive same-directory temp file, flushed, closed and renamed over current.json; the parent directory is flushed on Linux. Old recovery files are pruned to five. Temporary files are removed on ordinary failure and ignored/cleaned after restart. Configuration, snapshots and publication records advance in one rename.

Reads use the validated committed state in memory. A write/flush failure before the current rename leaves it unchanged and records no publication key. A directory flush failure after the current rename is uncertain: the process returns 503 and stops serving cached settings until restart. Clients must reconcile current settings and publication status before retrying an uncertain write.

Startup validates the whole envelope. If current.json is missing or damaged, it tries the five newest recovery envelopes. The recovered contents become a NEW public configuration revision, with a fresh server timestamp and a revision strictly above any potentially damaged publication. For example, damage at revision 7 with a backup at revision 6 produces revision 8, rather than serving revision 6 again. The recovered snapshot is retained as the newest previous version, still capped at five. Existing replay records keep their original accepted revisions and return the newly recovered current document.

Before repairing current.json, recovery atomically saves the valid snapshot envelope with the new reserved revision floor in its filename, replacing the selected old recovery filename. That durable reservation prevents repeated recovery from reusing a revision even if current.json and the newest recovery contents are subsequently damaged. Recovery revisions may skip numbers; a normal restart of a valid current envelope does not create another revision. Cached devices can therefore accept recovered settings and reconcile stale drafts through the usual 412 response. If stored configuration exists but no valid envelope can be recovered, startup requests return 503; defaults do not overwrite it. The bundled seed is used only for a genuinely new store. Frontend release/rollback and a changed seed do not reset persisted settings.

Restore a snapshot by copying it into an editor draft and publishing against the current revision with a new key. Never replace state files or decrement revisions as an ordinary restore workflow. Windows tests cannot fsync directory handles; production uses Linux directory fsync.

## Importable interfaces

`createStore({ directory?, seed?, fs?, maxPublications? })` asynchronously initializes a store with `current()`, `versions()`, `publication(key)` and `publish(document, { expectedRevision, key })` methods. Results are cloned. `fs` defaults to node:fs/promises and permits realistic failure injection in local tests; maxPublications can reduce, but cannot increase, the 256-record cap.

`createServer({ store?, directory?, seed?, allowedOrigin?, rateLimit? })` returns a Node HTTP server; callers choose a loopback listening port. It creates a store when one is not provided and converts startup/storage failures to JSON 503. `createStore` is also re-exported from server.mjs. Tests use real HTTP sockets, temporary directories and the real shared validator.

Deployment instructions are in `deploy/preset-config.md`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.mjs';
import { createStore } from './store.mjs';

const origin = 'https://presets.example';
const seed = {
  schemaVersion: 1, revision: 0, updatedAt: '2026-10-10T00:00:00.000Z',
  roots: [{ key: 'root', kind: 'group', label: 'Prices', visible: true,
    children: [{ key: 'price', kind: 'item', label: '', visible: true, priceCents: 5000 }] }],
};
const edited = (base = seed, price = 6000) => {
  const document = structuredClone(base);
  document.roots[0].children[0].priceCents = price;
  return document;
};

// Node fetch replaces Host. Use the HTTP client so these tests exercise real proxy/Host headers.
function wireRequest(url, init = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: init.method || 'GET', headers: init.headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(new Response(response.statusCode === 304 ? null : Buffer.concat(chunks), {
        status: response.statusCode, headers: response.headers,
      })));
    });
    request.on('error', reject);
    request.end(init.body);
  });
}

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'simplepos-presets-'));
  const store = await createStore({ directory, seed, ...options.store });
  const server = createServer({ store, allowedOrigin: origin, ...options.server });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, init = {}) => wireRequest(`${base}/preset-config${route}`, {
    ...init, headers: { Host: 'presets.example', ...init.headers },
  });
  const publish = (document, revision = document.revision, key = randomUUID(), init = {}) => request('/publish', {
    method: 'POST', body: JSON.stringify({ document }), ...init,
    headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"`, 'Idempotency-Key': key, ...init.headers },
  });
  return { directory, store, server, request, publish, base };
}

test('public reads and publishing work without credentials, including no-Origin loopback CLI', async t => {
  const f = await fixture(t);
  const initial = await f.request('/current');
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), seed);
  assert.equal(initial.headers.get('etag'), '"0"');
  assert.match(initial.headers.get('cache-control'), /no-store/);
  const local = await fetch(`${f.base}/preset-config/current`);
  assert.equal(local.status, 200);
  const result = await f.publish(edited(), 0, randomUUID(), { headers: { Origin: origin } });
  assert.equal(result.status, 200);
  const document = await result.json();
  assert.equal(document.revision, 1);
  assert.equal(document.roots[0].children[0].priceCents, 6000);
  assert.ok(Date.parse(document.updatedAt));
  assert.equal(result.headers.get('etag'), '"1"');
  const unchanged = await f.request('/current', { headers: { 'If-None-Match': '"1"' } });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
});

test('two publishers at the same revision yield one commit and one stale response with current data', async t => {
  const f = await fixture(t);
  const responses = await Promise.all([f.publish(edited(seed, 6100)), f.publish(edited(seed, 6200))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 412]);
  const success = await responses.find(r => r.status === 200).json();
  const conflict = await responses.find(r => r.status === 412).json();
  assert.equal(success.revision, 1);
  assert.deepEqual(conflict.current, success);
  assert.equal(typeof conflict.error, 'string');
  assert.deepEqual(await (await f.request('/current')).json(), success);
});

test('concurrent replays and later replays return the current document without incrementing revision', async t => {
  const f = await fixture(t);
  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.publish(edited(), 0, key)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
  }
  const first = await (await f.request('/current')).json();
  const second = await (await f.publish(edited(first, 7000))).json();
  const replay = await f.publish(edited(), 0, key);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), second);
  const status = await f.request(`/publications/${key}`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { revision: 1, document: second });
  assert.equal((await f.request(`/publications/${randomUUID()}`)).status, 404);
});

test('reusing a publication key with different roots or base revision is a conflict', async t => {
  const f = await fixture(t);
  const key = randomUUID();
  const current = await (await f.publish(edited(), 0, key)).json();
  assert.equal((await f.publish(edited(seed, 6001), 0, key)).status, 409);
  assert.equal((await f.publish(edited(current, 6000), 1, key)).status, 409);
  assert.deepEqual(await (await f.request('/current')).json(), current);
});

test('replay identity ignores client timestamps and property ordering', async t => {
  const f = await fixture(t);
  const key = randomUUID();
  assert.equal((await f.publish(edited(), 0, key)).status, 200);
  const replay = edited();
  replay.updatedAt = '2026-10-11T01:00:00.000Z';
  replay.roots[0].children[0] = { priceCents: 6000, visible: true, label: '', kind: 'item', key: 'price' };
  assert.equal((await f.publish(replay, 0, key)).status, 200);
  assert.equal((await (await f.request('/current')).json()).revision, 1);
});

test('invalid publications never change current settings or record a successful key', async t => {
  const f = await fixture(t);
  const invalid = [];
  for (const price of [0, -1, 1.5, 10_000_000_000]) invalid.push(edited(seed, price));
  const duplicate = edited();
  duplicate.roots[0].children.push(structuredClone(duplicate.roots[0].children[0]));
  invalid.push(duplicate);
  const empty = edited(); empty.roots[0].children = []; invalid.push(empty);
  const six = edited();
  for (let i = 0; i < 5; i++) six.roots.push({ key: `extra-${i}`, kind: 'group', label: `Hidden ${i}`, visible: false, children: [] });
  invalid.push(six);
  const deep = edited();
  let child = deep.roots[0].children[0];
  for (let i = 0; i < 3; i++) child = { key: `nested-${i}`, kind: 'group', label: `Nested ${i}`, visible: true, children: [child] };
  deep.roots[0].children = [child]; invalid.push(deep);
  const tooMany = edited();
  tooMany.roots[0].children = Array.from({ length: 2000 }, (_, i) => ({ key: `item-${i}`, kind: 'item', label: `Item ${i}`, visible: true, priceCents: 100 }));
  invalid.push(tooMany);
  const timestamp = edited(); timestamp.updatedAt = 'October 10, 2026'; invalid.push(timestamp);
  for (const document of invalid) {
    const key = randomUUID();
    const response = await f.publish(document, 0, key);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
    assert.equal((await f.request(`/publications/${key}`)).status, 404);
  }
  assert.deepEqual(await (await f.request('/current')).json(), seed);
});

test('price-only items and five roots including hidden groups can publish', async t => {
  const f = await fixture(t);
  const document = edited(seed, 9_999_999_999);
  for (let i = 0; i < 4; i++) document.roots.push({ key: `hidden-${i}`, kind: 'group', label: `Hidden ${i}`, visible: false, children: [] });
  const response = await f.publish(document);
  assert.equal(response.status, 200);
  const published = await response.json();
  assert.equal(published.roots.length, 5);
  assert.equal(published.roots[0].children[0].label, '');
  assert.equal(published.roots[0].children[0].priceCents, 9_999_999_999);
});

test('JSON, request envelope and revision headers are required without adding authentication', async t => {
  const f = await fixture(t);
  const cases = [
    { headers: { 'Content-Type': 'text/plain' } },
    { headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } },
    { body: '{bad json' },
    { body: JSON.stringify({ roots: seed.roots }) },
    { body: JSON.stringify({ document: edited(), sales: [] }) },
    { headers: { 'If-Match': '' } },
    { headers: { 'If-Match': '0' } },
    { headers: { 'If-Match': '"9007199254740992"' } },
    { headers: { 'Idempotency-Key': '' } },
    { headers: { 'Idempotency-Key': 'a'.repeat(129) } },
  ];
  for (const init of cases) assert.equal((await f.publish(edited(), 0, randomUUID(), init)).status, 400);
  assert.deepEqual(await (await f.request('/current')).json(), seed);
});

test('oversized streamed JSON is rejected with 413 and leaves the service usable', async t => {
  const f = await fixture(t);
  const payload = JSON.stringify({ document: seed, padding: 'x'.repeat(1_048_576) });
  const result = await new Promise((resolve, reject) => {
    const request = http.request(`${f.base}/preset-config/publish`, { method: 'POST', headers: {
      Host: 'presets.example', 'Content-Type': 'application/json', 'If-Match': '"0"', 'Idempotency-Key': randomUUID(),
    } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    for (let i = 0; i < payload.length; i += 65536) request.write(payload.slice(i, i + 65536));
    request.end();
  });
  assert.equal(result.status, 413);
  assert.equal(typeof result.body.error, 'string');
  assert.deepEqual(await (await f.request('/current')).json(), seed);
});

test('UTF-8 byte size is bounded even when character count is below one MiB', async t => {
  const f = await fixture(t);
  const document = edited(); document.extra = '🙂'.repeat(270_000);
  assert.ok(JSON.stringify(document).length < 1_048_576);
  assert.equal((await f.publish(document)).status, 413);
});

test('an unfinished oversized upload receives a JSON 413 before the sender finishes', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const result = await new Promise((resolve, reject) => {
    const request = http.request(`${f.base}/preset-config/publish`, { method: 'POST', headers: {
      Host: 'presets.example', 'Content-Type': 'application/json', 'If-Match': '"0"', 'Idempotency-Key': randomUUID(),
    } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => { request.destroy(); resolve({ status: response.statusCode, body: JSON.parse(body) }); });
    });
    request.on('error', reject);
    request.write('x'.repeat(1_048_577));
  });
  assert.equal(result.status, 413);
  assert.equal(typeof result.body.error, 'string');
});

test('unexpected Host, Origin and proxy protocol are rejected; same host origin and absent Origin work', async t => {
  const f = await fixture(t);
  for (const headers of [
    { Host: 'evil.example' }, { Origin: 'https://evil.example' }, { Origin: `${origin}.evil.example` },
    { Origin: 'null' }, { 'X-Forwarded-Host': 'evil.example' }, { 'X-Forwarded-Proto': 'http' },
  ]) assert.equal((await f.request('/current', { headers })).status, 403, JSON.stringify(headers));
  assert.equal((await f.request('/current', { headers: { Origin: origin, 'X-Forwarded-Host': 'presets.example', 'X-Forwarded-Proto': 'https' } })).status, 200);
  assert.equal((await f.publish(edited(), 0, randomUUID(), { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.deepEqual(await (await f.request('/current')).json(), seed);
});

test('ambiguous duplicate Host headers cannot bypass the host check', async t => {
  const f = await fixture(t);
  const reply = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: f.server.address().port }, () => {
      socket.write('GET /preset-config/current HTTP/1.1\r\nHost: presets.example\r\nHost: evil.example\r\nConnection: close\r\n\r\n');
    });
    let data = ''; socket.on('data', chunk => { data += chunk; });
    socket.on('error', reject); socket.on('end', () => resolve(data));
  });
  assert.match(reply, /^HTTP\/1\.1 (400|403) /);
});

test('only config routes exist, and unsupported methods have a JSON response', async t => {
  const f = await fixture(t);
  for (const route of ['/sales', '/receipts', '/login']) assert.equal((await f.request(route)).status, 404);
  const result = await f.request('/current', { method: 'POST', body: '{}' });
  assert.equal(result.status, 405);
  assert.equal(typeof (await result.json()).error, 'string');
});

test('restart preserves settings and replay records together', async t => {
  const f = await fixture(t);
  const key = randomUUID();
  const published = await (await f.publish(edited(), 0, key)).json();
  const restarted = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await restarted.current(), published);
  assert.deepEqual(await restarted.publication(key), { revision: 1, document: published });
  assert.deepEqual(await restarted.publish(edited(), { expectedRevision: 0, key }), published);
  assert.equal((await restarted.current()).revision, 1);
});

test('five previous versions are config snapshots and survive restart', async t => {
  const f = await fixture(t);
  let current = seed;
  for (let i = 1; i <= 7; i++) current = await (await f.publish(edited(current, 5000 + i))).json();
  const result = await f.request('/versions');
  assert.equal(result.status, 200);
  const versions = await result.json();
  assert.deepEqual(versions.map(v => v.revision), [6, 5, 4, 3, 2]);
  assert.deepEqual(Object.keys(versions[0]).sort(), ['revision', 'roots', 'schemaVersion', 'updatedAt']);
  const restarted = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await restarted.versions(), versions);
  assert.equal((await fs.readdir(f.directory)).filter(name => /^recovery-\d+\.json$/.test(name)).length, 5);
});

test('corrupted current and newest recovery fall back to a valid committed envelope without reseeding', async t => {
  const f = await fixture(t);
  let current = seed;
  for (let i = 1; i <= 3; i++) current = await (await f.publish(edited(current, 5100 + i))).json();
  await fs.writeFile(path.join(f.directory, 'current.json'), '{partial');
  await fs.writeFile(path.join(f.directory, 'recovery-2.json'), '{partial');
  const restarted = await createStore({ directory: f.directory, seed });
  assert.equal((await restarted.current()).revision, 4);
  assert.equal((await restarted.current()).roots[0].children[0].priceCents, 5101);
  assert.deepEqual((await restarted.versions()).map(document => document.revision), [1, 0]);
  const next = await restarted.publish(edited(await restarted.current(), 8000), { expectedRevision: 4, key: randomUUID() });
  assert.equal(next.revision, 5);
  const again = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await again.current(), next);
});

test('recovery exposes a new public revision to cached clients and lets a stale draft reconcile', async t => {
  const f = await fixture(t);
  let cached = seed;
  const operations = [];
  for (let i = 1; i <= 7; i++) {
    const operation = { document: edited(cached, 5000 + i), key: randomUUID() };
    operations.push(operation);
    cached = await (await f.publish(operation.document, cached.revision, operation.key)).json();
  }
  // Make the recovery timestamp independently recognizable, rather than relying on clock timing.
  const recoveryPath = path.join(f.directory, 'recovery-6.json');
  const oldEnvelope = JSON.parse(await fs.readFile(recoveryPath, 'utf8'));
  oldEnvelope.document.updatedAt = '2020-01-01T00:00:00.000Z';
  await fs.writeFile(recoveryPath, JSON.stringify(oldEnvelope));
  await fs.writeFile(path.join(f.directory, 'current.json'), '{damaged');
  const recoveredStore = await createStore({ directory: f.directory, seed });
  const server = createServer({ store: recoveredStore, allowedOrigin: origin });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const request = (route, init = {}) => wireRequest(`http://127.0.0.1:${server.address().port}/preset-config${route}`, {
    ...init, headers: { Host: 'presets.example', ...init.headers },
  });
  const publish = (document, key = randomUUID()) => request('/publish', {
    method: 'POST', body: JSON.stringify({ document }), headers: {
      'Content-Type': 'application/json', 'If-Match': `"${document.revision}"`, 'Idempotency-Key': key,
    },
  });
  const read = await request('/current', { headers: { 'If-None-Match': `"${cached.revision}"` } });
  assert.equal(read.status, 200);
  const recovered = await read.json();
  assert.ok(recovered.revision > cached.revision, 'a client rejecting older GET revisions must accept recovery');
  assert.equal(recovered.revision, 8);
  assert.equal(read.headers.get('etag'), '"8"');
  assert.equal(recovered.roots[0].children[0].priceCents, 5006);
  assert.notEqual(recovered.updatedAt, oldEnvelope.document.updatedAt);
  const versions = await (await request('/versions')).json();
  assert.deepEqual(versions.map(document => document.revision), [6, 5, 4, 3, 2]);
  assert.deepEqual(versions[0], oldEnvelope.document);
  const retained = operations[5];
  const lookup = await request(`/publications/${retained.key}`);
  assert.deepEqual(await lookup.json(), { revision: 6, document: recovered });
  const replay = await publish(retained.document, retained.key);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), recovered);
  const conflict = await publish(edited(cached, 8000));
  assert.equal(conflict.status, 412);
  const stale = await conflict.json();
  assert.deepEqual(stale.current, recovered);
  const reconciled = await publish(edited(stale.current, 8000));
  assert.equal(reconciled.status, 200);
  const published = await reconciled.json();
  assert.equal(published.revision, 9);
  const restarted = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await restarted.current(), published);
  assert.deepEqual((await restarted.versions()).map(document => document.revision), [8, 6, 5, 4, 3]);
});

test('repeated recovery advances past cached recovery revisions even when the newest backup is damaged', async t => {
  const f = await fixture(t);
  let current = seed;
  for (let i = 1; i <= 3; i++) current = await (await f.publish(edited(current, 5100 + i))).json();
  const currentPath = path.join(f.directory, 'current.json');
  await fs.writeFile(currentPath, '{damaged');
  const first = await createStore({ directory: f.directory, seed });
  assert.equal((await first.current()).revision, 4);
  const files = (await fs.readdir(f.directory)).filter(name => /^recovery-\d+\.json$/.test(name))
    .sort((a, b) => Number(b.slice(9, -5)) - Number(a.slice(9, -5)));
  await fs.writeFile(currentPath, '{damaged again');
  await fs.writeFile(path.join(f.directory, files[0]), '{damaged backup');
  const second = await createStore({ directory: f.directory, seed });
  const recovered = await second.current();
  assert.ok(recovered.revision > 4, 'a device holding the first recovery must also accept the second');
  assert.equal(recovered.roots[0].children[0].priceCents, 5101);
  assert.deepEqual((await second.versions()).map(document => document.revision), [1, 0]);
  const stableRestart = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await stableRestart.current(), recovered);
  assert.ok((await fs.readdir(f.directory)).filter(name => /^recovery-\d+\.json$/.test(name)).length <= 5);
});

test('an unreadable or invalid store returns 503 and never invents a baseline over existing data', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'current.json'), '{partial');
  await assert.rejects(createStore({ directory: f.directory, seed }), error => error.status === 503);
  const server = createServer({ directory: f.directory, seed, allowedOrigin: origin });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const result = await fetch(`http://127.0.0.1:${server.address().port}/preset-config/current`, { headers: { Host: 'presets.example' } });
  assert.equal(result.status, 503);
  assert.equal(typeof (await result.json()).error, 'string');
  assert.equal(await fs.readFile(path.join(f.directory, 'current.json'), 'utf8'), '{partial');
});

test('startup never seeds over an existing current entry whose read reports missing', async t => {
  const f = await fixture(t);
  const io = { ...fs, open: async (...args) => {
    if (path.basename(String(args[0])) === 'current.json' && args[1] === 'r') {
      throw Object.assign(new Error('dangling current file'), { code: 'ENOENT' });
    }
    return fs.open(...args);
  } };
  await assert.rejects(createStore({ directory: f.directory, seed: edited(seed, 9999), fs: io }), error => error.status === 503);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.directory, 'current.json'), 'utf8')).document, seed);
});

test('failed atomic rename leaves prior settings and replay records unchanged, and retry can commit once', async t => {
  let fail = false;
  const io = { ...fs, rename: async (from, to) => {
    if (fail && path.basename(to) === 'current.json') throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return fs.rename(from, to);
  } };
  const f = await fixture(t, { store: { fs: io } });
  const key = randomUUID(); fail = true;
  assert.equal((await f.publish(edited(), 0, key)).status, 503);
  assert.deepEqual(await (await f.request('/current')).json(), seed);
  assert.equal((await f.request(`/publications/${key}`)).status, 404);
  const restarted = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await restarted.current(), seed);
  fail = false;
  assert.equal((await f.publish(edited(), 0, key)).status, 200);
  assert.equal((await (await f.request('/current')).json()).revision, 1);
  assert.equal((await fs.readdir(f.directory)).some(name => name.endsWith('.tmp')), false);
});

test('a file flush failure never publishes settings or a replay record', async t => {
  let fail = false;
  const io = { ...fs, open: async (...args) => {
    const handle = await fs.open(...args);
    if (String(args[0]).endsWith('.tmp')) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { if (fail) throw Object.assign(new Error('flush failed'), { code: 'EIO' }); await sync(); };
    }
    return handle;
  } };
  const f = await fixture(t, { store: { fs: io } });
  const key = randomUUID(); fail = true;
  assert.equal((await f.publish(edited(), 0, key)).status, 503);
  assert.deepEqual(await f.store.current(), seed);
  fail = false;
  const restarted = await createStore({ directory: f.directory, seed });
  assert.deepEqual(await restarted.current(), seed);
  assert.equal(await restarted.publication(key), null);
});

test('a directory flush failure after rename reports uncertainty until restart and then reconciles the key', async t => {
  let fail = false;
  let committed = false;
  const io = { ...fs,
    rename: async (from, to) => { await fs.rename(from, to); if (fail && path.basename(to) === 'current.json') committed = true; },
    open: async (...args) => {
      if (fail && committed && !path.extname(String(args[0]))) return { sync: async () => { throw Object.assign(new Error('directory flush failed'), { code: 'EIO' }); }, close: async () => {} };
      return fs.open(...args);
    },
  };
  const f = await fixture(t, { store: { fs: io } });
  const key = randomUUID(); fail = true;
  assert.equal((await f.publish(edited(), 0, key)).status, 503);
  assert.equal((await f.request('/current')).status, 503);
  fail = false;
  const restarted = await createStore({ directory: f.directory, seed });
  assert.equal((await restarted.publication(key)).revision, 1);
  assert.equal((await restarted.publish(edited(), { expectedRevision: 0, key })).revision, 1);
});

test('existing settings survive a changed bundled seed and an interrupted temp file is ignored', async t => {
  const f = await fixture(t);
  const current = await (await f.publish(edited())).json();
  await fs.writeFile(path.join(f.directory, `.preset-${randomUUID()}.tmp`), '{partial');
  const restarted = await createStore({ directory: f.directory, seed: edited(seed, 9999) });
  assert.deepEqual(await restarted.current(), current);
  assert.equal((await fs.readdir(f.directory)).some(name => name.endsWith('.tmp')), false);
});

test('the executable uses PRESET_CONFIG_DIR/PRESET_PORT and the immutable shared defaults', { timeout: 10_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'simplepos-presets-main-'));
  const defaultsPath = new URL('../../src/presets/defaults.json', import.meta.url);
  const defaultsText = await fs.readFile(defaultsPath, 'utf8');
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./main.mjs', import.meta.url))], {
    env: { ...process.env, PRESET_CONFIG_DIR: directory, PRESET_PORT: String(port), PRESET_ALLOWED_ORIGIN: `http://localhost:${port}` },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error(stderr || 'Service exited before listening.')));
    child.stdout.once('data', resolve);
  });
  const result = await fetch(`http://127.0.0.1:${port}/preset-config/current`);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), JSON.parse(defaultsText));
  assert.equal(await fs.readFile(defaultsPath, 'utf8'), defaultsText);
  assert.ok((await fs.stat(path.join(directory, 'current.json'))).isFile());
});

test('idempotency records have a bounded retention window persisted across restart', async t => {
  const f = await fixture(t, { store: { maxPublications: 3 } });
  const keys = Array.from({ length: 4 }, () => randomUUID());
  let current = seed;
  for (const key of keys) current = await (await f.publish(edited(current, current.roots[0].children[0].priceCents + 1), current.revision, key)).json();
  assert.equal((await f.request(`/publications/${keys[0]}`)).status, 404);
  const restarted = await createStore({ directory: f.directory, seed, maxPublications: 3 });
  assert.equal(await restarted.publication(keys[0]), null);
  assert.equal((await restarted.publication(keys[1])).revision, 2);
  assert.equal((await restarted.current()).revision, 4);
});

test('returned documents cannot mutate the in-process committed state', async t => {
  const f = await fixture(t);
  const current = await f.store.current(); current.roots.length = 0;
  assert.deepEqual(await f.store.current(), seed);
  const result = await f.store.publish(edited(), { expectedRevision: 0, key: randomUUID() });
  result.roots.length = 0;
  assert.equal((await f.store.current()).roots.length, 1);
});

test('operational rate limits return 429 with Retry-After', async t => {
  const f = await fixture(t, { server: { rateLimit: { burst: 2, refillPerSecond: 0.001 } } });
  assert.equal((await f.request('/current')).status, 200);
  assert.equal((await f.request('/current')).status, 200);
  const limited = await f.request('/current');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(typeof (await limited.json()).error, 'string');
});

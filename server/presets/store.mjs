import { createHash, randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import path from 'node:path';
import { validateDocument } from '../../src/presets/schema.mjs';
import { MAX_DOCUMENT_BYTES, ServiceError, storageError, validKey } from './errors.mjs';

const MAX_ENVELOPE_BYTES = 8 * MAX_DOCUMENT_BYTES;
const MAX_PUBLICATIONS = 256;
const RECOVERY_NAME = /^recovery-(0|[1-9]\d*)\.json$/;
const TEMP_NAME = /^\.preset-[a-f0-9-]{36}\.tmp$/;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const isoTimestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));

function checkedDocument(input) {
  try {
    if (Buffer.byteLength(JSON.stringify(input) ?? '') > MAX_DOCUMENT_BYTES) {
      throw new ServiceError(413, 'Preset settings exceed the 1 MiB limit.');
    }
    if (!isoTimestamp(input?.updatedAt)) throw new Error('updatedAt must be an ISO timestamp.');
    return validateDocument(input);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, error.message || 'Invalid preset settings.');
  }
}

function checkedEnvelope(input, maxPublications) {
  if (input?.formatVersion !== 1 || !Array.isArray(input.versions) || input.versions.length > 5
    || !Array.isArray(input.publications) || input.publications.length > maxPublications) throw storageError();
  const document = checkedDocument(input.document);
  if (!nonnegativeInteger(input.revisionFloor) || input.revisionFloor < document.revision) throw storageError();
  const versions = input.versions.map(checkedDocument);
  let previous = document.revision;
  for (const version of versions) {
    if (version.revision >= previous) throw storageError();
    previous = version.revision;
  }
  const keys = new Set();
  const publications = input.publications.map(record => {
    if (!validKey(record?.key) || keys.has(record.key) || !/^[a-f0-9]{64}$/.test(record.hash)
      || !nonnegativeInteger(record.baseRevision) || !nonnegativeInteger(record.revision)
      || record.baseRevision >= record.revision || record.revision > input.revisionFloor) throw storageError();
    keys.add(record.key);
    return { key: record.key, hash: record.hash, baseRevision: record.baseRevision, revision: record.revision };
  });
  return { formatVersion: 1, revisionFloor: input.revisionFloor, document, versions, publications };
}

/** One process owns a directory. The envelope commits configuration, history and replay records together. */
export async function createStore({
  directory = process.env.PRESET_CONFIG_DIR || '/var/lib/simplepos-presets',
  seed, fs = nodeFs, maxPublications = MAX_PUBLICATIONS,
} = {}) {
  if (!Number.isInteger(maxPublications) || maxPublications < 1 || maxPublications > MAX_PUBLICATIONS) {
    throw new TypeError('maxPublications must be between 1 and 256.');
  }
  const currentPath = path.join(directory, 'current.json');
  let state;
  let healthy = true;
  let queue = Promise.resolve();
  let pending = 0;

  async function syncDirectory() {
    let handle;
    try {
      handle = await fs.open(directory, 'r');
      await handle.sync();
    } catch (error) {
      // Windows cannot fsync directory handles; production systemd runs on Linux.
      if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'EACCES'].includes(error.code)) throw error;
    } finally {
      await handle?.close();
    }
  }

  async function atomicWrite(target, envelope) {
    const temp = path.join(directory, `.preset-${randomUUID()}.tmp`);
    let handle;
    let renamed = false;
    try {
      const serialized = JSON.stringify(envelope);
      if (Buffer.byteLength(serialized) > MAX_ENVELOPE_BYTES) throw storageError();
      handle = await fs.open(temp, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temp, target);
      renamed = true;
      await syncDirectory();
    } catch (error) {
      // After rename, durability is uncertain. Stop serving cached state until restart/recovery.
      if (renamed && target === currentPath) healthy = false;
      throw error;
    } finally {
      await handle?.close().catch(() => {});
      await fs.unlink(temp).catch(() => {});
    }
  }

  async function readEnvelope(filename) {
    const handle = await fs.open(path.join(directory, filename), 'r');
    try {
      if ((await handle.stat()).size > MAX_ENVELOPE_BYTES) throw storageError();
      return checkedEnvelope(JSON.parse(await handle.readFile('utf8')), maxPublications);
    } finally {
      await handle.close();
    }
  }

  async function recoveryFiles() {
    return (await fs.readdir(directory))
      .filter(name => RECOVERY_NAME.test(name) && nonnegativeInteger(Number(RECOVERY_NAME.exec(name)[1])))
      .sort((a, b) => Number(RECOVERY_NAME.exec(b)[1]) - Number(RECOVERY_NAME.exec(a)[1]));
  }

  async function pruneRecovery() {
    const files = await recoveryFiles();
    for (const filename of files.slice(5)) await fs.unlink(path.join(directory, filename));
    if (files.length > 5) await syncDirectory();
  }

  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const files = await fs.readdir(directory);
    for (const filename of files.filter(name => TEMP_NAME.test(name))) await fs.unlink(path.join(directory, filename));
    const recoveries = await recoveryFiles();
    let recoveredFilename;
    let currentMissing = false;
    try {
      state = await readEnvelope('current.json');
    } catch (error) {
      currentMissing = error.code === 'ENOENT' && !files.includes('current.json');
    }
    if (!state) {
      // Only committed recovery files are candidates; leftover temp files never become settings.
      for (const filename of recoveries.slice(0, 5)) {
        try {
          const recovered = await readEnvelope(filename);
          const namedRevision = Number(RECOVERY_NAME.exec(filename)[1]);
          // Ordinary backups are named by document revision; recovery reservations by their floor.
          if (recovered.document.revision !== namedRevision && recovered.revisionFloor !== namedRevision) continue;
          state = recovered;
          recoveredFilename = filename;
          break;
        } catch { /* Try the next committed recovery version. */ }
      }
      if (state) {
        // A backup at N may precede a damaged publication at N+1. Recovery must be newer than both.
        const highestBackup = Number(RECOVERY_NAME.exec(recoveries[0])[1]);
        const revision = Math.max(state.revisionFloor, highestBackup) + 2;
        if (!Number.isSafeInteger(revision)) throw storageError();
        const snapshot = state.document;
        const reserved = { ...state, revisionFloor: revision };
        // Persist the reservation in an envelope AND its filename before exposing recovered contents.
        // Even if this recovery copy later becomes unreadable, its name prevents revision reuse.
        await atomicWrite(path.join(directory, `recovery-${revision}.json`), reserved);
        await fs.unlink(path.join(directory, recoveredFilename));
        await pruneRecovery();
        state = {
          ...reserved,
          document: { ...snapshot, revision, updatedAt: new Date().toISOString() },
          versions: [snapshot, ...state.versions].slice(0, 5),
        };
        await atomicWrite(currentPath, state);
      } else {
        if (!currentMissing || recoveries.length) throw storageError();
        const baseline = seed ?? JSON.parse(await fs.readFile(new URL('../../src/presets/defaults.json', import.meta.url), 'utf8'));
        const document = checkedDocument(baseline);
        state = { formatVersion: 1, revisionFloor: document.revision, document, versions: [], publications: [] };
        await atomicWrite(currentPath, state);
      }
    }
    await pruneRecovery();
  } catch {
    throw storageError();
  }

  function requireHealthy() {
    if (!healthy) throw storageError();
    return state;
  }

  return {
    async current() { return structuredClone(requireHealthy().document); },
    async versions() { return structuredClone(requireHealthy().versions); },
    async publication(key) {
      if (!validKey(key)) throw new ServiceError(400, 'Invalid publication key.');
      const envelope = requireHealthy();
      const record = envelope.publications.find(record => record.key === key);
      return record ? { revision: record.revision, document: structuredClone(envelope.document) } : null;
    },
    async publish(input, { expectedRevision, key } = {}) {
      if (pending >= 32) throw new ServiceError(429, 'Too many publications are pending.', { retryAfter: 2 });
      let snapshot;
      try { snapshot = structuredClone(input); } catch { throw new ServiceError(400, 'Invalid preset document.'); }
      pending++;
      const operation = queue.then(async () => {
        const envelope = requireHealthy();
        if (!nonnegativeInteger(expectedRevision) || !validKey(key)) throw new ServiceError(400, 'Provide a revision and an idempotency key.');
        const document = checkedDocument(snapshot);
        if (document.revision !== expectedRevision) throw new ServiceError(400, 'Document revision must match If-Match.');
        const hash = createHash('sha256').update(JSON.stringify({ roots: document.roots, baseRevision: expectedRevision })).digest('hex');
        const replay = envelope.publications.find(record => record.key === key);
        if (replay) {
          if (replay.hash !== hash) throw new ServiceError(409, 'This publication key was already used for different changes.');
          return structuredClone(envelope.document);
        }
        if (expectedRevision !== envelope.document.revision) {
          throw new ServiceError(412, 'Preset settings changed. Review the current revision before publishing.', { current: structuredClone(envelope.document) });
        }
        const revision = envelope.revisionFloor + 1;
        if (!Number.isSafeInteger(revision)) throw storageError();
        const published = { ...document, revision, updatedAt: new Date().toISOString() };
        const next = {
          formatVersion: 1, revisionFloor: revision, document: published,
          versions: [envelope.document, ...envelope.versions].slice(0, 5),
          publications: [...envelope.publications, { key, hash, baseRevision: expectedRevision, revision }].slice(-maxPublications),
        };
        try {
          await atomicWrite(path.join(directory, `recovery-${envelope.document.revision}.json`), envelope);
          await pruneRecovery();
          await atomicWrite(currentPath, next);
        } catch { throw storageError(); }
        state = next;
        return structuredClone(published);
      });
      queue = operation.catch(() => {});
      try { return await operation; } finally { pending--; }
    },
  };
}

import http from 'node:http';
import { createStore } from './store.mjs';
import { MAX_DOCUMENT_BYTES, ServiceError, storageError, validKey } from './errors.mjs';

export { createStore } from './store.mjs';

const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

function bucket(burst, refillPerSecond) {
  if (!(burst >= 1 && burst <= 10_000 && refillPerSecond > 0 && refillPerSecond <= 1000)) {
    throw new TypeError('Invalid rate limit.');
  }
  let tokens = burst;
  let last = performance.now();
  return () => {
    const now = performance.now();
    tokens = Math.min(burst, tokens + (now - last) * refillPerSecond / 1000);
    last = now;
    if (tokens < 1) throw new ServiceError(429, 'Request rate limit reached.', { retryAfter: Math.max(1, Math.ceil((1 - tokens) / refillPerSecond)) });
    tokens--;
  };
}

async function jsonBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(request.headers['content-type'] ?? '')
    || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) {
    throw new ServiceError(400, 'Send uncompressed application/json.');
  }
  if (Number(request.headers['content-length']) > MAX_DOCUMENT_BYTES) throw new ServiceError(413, 'Request exceeds the 1 MiB limit.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_DOCUMENT_BYTES) throw new ServiceError(413, 'Request exceeds the 1 MiB limit.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'document')) throw new Error();
    return body.document;
  } catch { throw new ServiceError(400, 'Send JSON containing only {document: PresetDocument}.'); }
}

/** Public config-only HTTP service. Listen on loopback behind the configured same-origin proxy. */
export function createServer({
  store, directory, seed,
  allowedOrigin = process.env.PRESET_ALLOWED_ORIGIN || `http://localhost:${process.env.PRESET_PORT || 4318}`,
  rateLimit = {},
} = {}) {
  const allowed = new URL(allowedOrigin);
  if (!['http:', 'https:'].includes(allowed.protocol) || allowed.origin !== allowedOrigin) {
    throw new TypeError('PRESET_ALLOWED_ORIGIN must be an exact HTTP(S) origin without a trailing slash.');
  }
  const ready = store ? Promise.resolve(store) : createStore({ directory, seed });
  // Initialization failures are reported as 503 for every config request, without an unhandled rejection.
  ready.catch(() => {});
  const allowRequest = bucket(rateLimit.burst ?? 120, rateLimit.refillPerSecond ?? 2);
  const allowPublish = bucket(rateLimit.publishBurst ?? 30, rateLimit.publishRefillPerSecond ?? 0.5);

  const server = http.createServer({ joinDuplicateHeaders: true, maxHeaderSize: 8192, requestTimeout: 10_000, headersTimeout: 5000, keepAliveTimeout: 5000 }, async (request, response) => {
    const send = (status, value, revision) => {
      response.statusCode = status;
      if (revision !== undefined) response.setHeader('ETag', `"${revision}"`);
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const localPort = request.socket.localPort;
      const host = request.headers.host?.toLowerCase();
      const localHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`, `[::1]:${localPort}`];
      if (!loopback(request.socket.remoteAddress) || !host || (host !== allowed.host.toLowerCase() && !localHosts.includes(host))
        || (request.headers.origin !== undefined && request.headers.origin !== allowedOrigin)
        || (request.headers['x-forwarded-host'] !== undefined && request.headers['x-forwarded-host'].toLowerCase() !== allowed.host.toLowerCase())
        || (request.headers['x-forwarded-proto'] !== undefined && request.headers['x-forwarded-proto'] !== allowed.protocol.slice(0, -1))) {
        throw new ServiceError(403, 'Host or Origin is not allowed for this config service.');
      }
      allowRequest();
      const url = new URL(request.url, allowedOrigin);
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new ServiceError(400, 'Invalid request target.');
      const route = url.pathname;
      const isPublication = /^\/preset-config\/publications\/[^/]+$/.test(route);
      const method = route === '/preset-config/publish' ? 'POST' : 'GET';
      if (!['/preset-config/current', '/preset-config/publish', '/preset-config/versions'].includes(route) && !isPublication) {
        throw new ServiceError(404, 'Config route not found.');
      }
      if (request.method !== method) {
        response.setHeader('Allow', method);
        throw new ServiceError(405, `Use ${method} for this config route.`);
      }
      const config = await ready;
      if (route === '/preset-config/current') {
        const document = await config.current();
        const etag = `"${document.revision}"`;
        const tags = request.headers['if-none-match']?.split(',').map(tag => tag.trim()) ?? [];
        const unchanged = tags.some(tag => tag === '*' || tag === etag || tag === `W/${etag}`);
        send(unchanged ? 304 : 200, unchanged ? undefined : document, document.revision);
      } else if (route === '/preset-config/versions') {
        send(200, await config.versions());
      } else if (isPublication) {
        let key;
        try { key = decodeURIComponent(route.slice('/preset-config/publications/'.length)); } catch { throw new ServiceError(400, 'Invalid publication key.'); }
        if (!validKey(key)) throw new ServiceError(400, 'Invalid publication key.');
        const publication = await config.publication(key);
        if (!publication) throw new ServiceError(404, 'Publication key not found.');
        send(200, publication, publication.document.revision);
      } else {
        allowPublish();
        const match = /^"(0|[1-9]\d*)"$/.exec(request.headers['if-match'] ?? '');
        const key = request.headers['idempotency-key'];
        if (!match || !Number.isSafeInteger(Number(match[1])) || !validKey(key)) {
          throw new ServiceError(400, 'Provide a quoted If-Match revision and an 8–128 character Idempotency-Key.');
        }
        const document = await jsonBody(request);
        const published = await config.publish(document, { expectedRevision: Number(match[1]), key });
        send(200, published, published.revision);
      }
    } catch (error) {
      const failure = error instanceof ServiceError ? error : storageError();
      if (response.destroyed || response.writableEnded) return;
      if (!request.complete) response.setHeader('Connection', 'close');
      if (failure.retryAfter) response.setHeader('Retry-After', String(failure.retryAfter));
      send(failure.status, { error: failure.message, ...(failure.current ? { current: failure.current } : {}) }, failure.current?.revision);
      request.resume();
    }
  });
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(15_000, socket => socket.destroy());
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n{"error":"Invalid HTTP request."}');
  });
  return server;
}

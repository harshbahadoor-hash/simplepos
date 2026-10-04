import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const SKIP = /\.(map|txt)$/;

/**
 * Emits `sw.js` that precaches every built file, so the POS reloads and runs
 * without internet once it has been opened. The cache name changes with the
 * build contents; old caches are removed when the new worker activates.
 */
export function serviceWorkerPlugin(): Plugin {
  return {
    name: "simplepos-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((file) => !SKIP.test(file) && file !== "sw.js");
      const hash = createHash("sha256");
      for (const file of files.sort()) {
        const chunk = bundle[file]!;
        hash.update(file);
        hash.update(chunk.type === "chunk" ? chunk.code : typeof chunk.source === "string" ? chunk.source : Buffer.from(chunk.source));
      }
      const version = hash.digest("hex").slice(0, 16);
      const precache = ["/", ...files.filter((file) => file !== "index.html").map((file) => `/${file}`)];
      this.emitFile({ type: "asset", fileName: "sw.js", source: workerSource(version, precache) });
    },
  };
}

function workerSource(version: string, precache: string[]): string {
  return `const CACHE = "simplepos-${version}";
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("simplepos-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(caches.match("/", { cacheName: CACHE }).then((cached) => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)));
});
`;
}

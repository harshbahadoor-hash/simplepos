import { createServer } from './server.mjs';

const port = Number(process.env.PRESET_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PRESET_PORT must be between 1 and 65535.');
const server = createServer();
server.on('error', error => { console.error(`Preset config listener failed: ${error.code || 'listener error'}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Preset config service listening on 127.0.0.1:${port}`));

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 15_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

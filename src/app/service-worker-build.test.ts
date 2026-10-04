import { it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { serviceWorkerPlugin } from '../../build/service-worker-plugin';

it('updates offline caches for HTML-only and public-icon-only releases', async () => {
  const root = mkdtempSync(join(tmpdir(), 'simplepos-sw-'));
  if (!realpathSync(root).startsWith(realpathSync(tmpdir()) + sep + 'simplepos-sw-')) throw new Error('Unexpected fixture path');
  const html = (title: string) => `<title>${title}</title><script type="module" src="/entry.js"></script>`;
  try {
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'entry.js'), 'document.body.dataset.boot = "ready";');
    writeFileSync(join(root, 'index.html'), html('Simple POS'));
    writeFileSync(join(root, 'public', 'simplepos-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="gold"/></svg>');
    const release = async () => {
      await build({ root, configFile: false, logLevel: 'silent', plugins: [serviceWorkerPlugin()] });
      return readFileSync(join(root, 'dist', 'sw.js'), 'utf8');
    };
    const original = await release();
    writeFileSync(join(root, 'index.html'), html('New Simple POS title'));
    const htmlUpdate = await release();
    expect(htmlUpdate).not.toBe(original);
    writeFileSync(join(root, 'public', 'simplepos-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="green"/></svg>');
    expect(await release()).not.toBe(htmlUpdate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { PresetDocument } from '../src/presets/model';

const baselineDocument = (): PresetDocument => JSON.parse(readFileSync(new URL('../src/presets/defaults.json', import.meta.url), 'utf8'));

// The real UI/sync code runs; only the HTTP configuration boundary is replaced.
async function sharedPresets(page: Page, initial = baselineDocument()) {
  let current = structuredClone(initial);
  let failure: 'stale' | 'offline' | 'lost-reply' | 'lost-uncommitted' | null = null;
  let statusFailure: 'offline' | 'missing' | null = null;
  let publicationWait: Promise<void> | null = null;
  const publications = new Map<string, PresetDocument>();
  const statusRequests: string[] = [];
  const attempts: { revision: string | undefined; requestId: string | undefined; document: PresetDocument; persisted: unknown }[] = [];
  await page.route('**/preset-config/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/current')) {
      await route.fulfill({ json: current, headers: { ETag: `"${current.revision}"` } });
    } else if (pathname.endsWith('/publish')) {
      const body = request.postDataJSON() as { document: PresetDocument };
      const requestId = request.headers()['idempotency-key'] ?? '';
      const persisted = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('simplePosPresetDraftV1') ?? '{}').pending; }
        catch { return null; }
      });
      attempts.push({ revision: request.headers()['if-match'], requestId, document: body.document, persisted });
      if (publicationWait) await publicationWait;
      if (publications.has(requestId)) {
        await route.fulfill({ json: publications.get(requestId) });
      } else if (failure === 'offline') {
        await route.fulfill({ status: 503, json: { error: 'Service unavailable. Your draft is kept.' } });
      } else if (failure === 'lost-reply') {
        current = { ...body.document, revision: current.revision + 1, updatedAt: '2026-10-10T12:00:00Z' };
        publications.set(requestId, current);
        await route.abort('connectionreset');
      } else if (failure === 'lost-uncommitted') {
        current = { ...current, revision: current.revision + 1 };
        await route.abort('connectionreset');
      } else if (failure === 'stale') {
        current = { ...current, revision: current.revision + 1 };
        await route.fulfill({ status: 412, json: { error: 'Presets changed on another device.', current } });
      } else if (request.headers()['if-match'] !== `"${current.revision}"`) {
        await route.fulfill({ status: 412, json: { error: 'Presets changed on another device.', current } });
      } else {
        current = { ...body.document, revision: current.revision + 1, updatedAt: '2026-10-10T12:00:00Z' };
        publications.set(requestId, current);
        await route.fulfill({ json: current });
      }
    } else if (pathname.includes('/publications/')) {
      const id = decodeURIComponent(pathname.split('/').at(-1) ?? '');
      statusRequests.push(id);
      const document = publications.get(id);
      if (statusFailure === 'offline') await route.fulfill({ status: 503, json: { error: 'Status unavailable.' } });
      else if (statusFailure === 'missing' || !document) await route.fulfill({ status: 404, json: { error: 'Publication not found.' } });
      else await route.fulfill({ json: { revision: document.revision, document } });
    } else {
      await route.fulfill({ status: 404, json: { error: 'Publication not found.' } });
    }
  });
  return {
    attempts, statusRequests, fail: (mode: typeof failure) => { failure = mode; },
    failStatus: (mode: typeof statusFailure) => { statusFailure = mode; },
    holdPublication: () => {
      let release: () => void = () => {};
      publicationWait = new Promise<void>(resolve => { release = resolve; });
      return () => { release(); publicationWait = null; };
    },
  };
}

const manager = (page: Page) => page.getByRole('dialog', { name: 'Manage presets', exact: true });

test('tablet editor remains usable while the on-screen keyboard reduces available height', async ({page}) => {
  await sharedPresets(page);
  await page.setViewportSize({width:1280,height:396});
  await page.goto('/');
  await page.addStyleTag({content:'body{font-size:20.8px}'});
  await page.getByRole('button',{name:/Settings/}).click();
  await page.getByRole('button',{name:'Manage presets',exact:true}).click();
  await manager(page).getByRole('button',{name:'Add preset',exact:true}).click();
  await manager(page).getByLabel('Group name',{exact:true}).fill('Keyboard test');
  const scroll=await manager(page).locator('.pm-scroll').boundingBox();
  expect(scroll!.height).toBeGreaterThanOrEqual(120);
  const save=manager(page).getByRole('button',{name:'Save to draft',exact:true});
  await save.scrollIntoViewIfNeeded();
  expect(await save.evaluate(element=>{
    const r=element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  })).toBe(true);
  await save.click();
  await expect(manager(page).getByRole('button',{name:'Open Keyboard test',exact:true})).toBeVisible();
});
const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });

async function openManager(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await button(page, 'Manage presets').click();
  await expect(manager(page)).toBeVisible();
}

async function addGroup(page: Page, label: string) {
  const panel = manager(page);
  await button(panel, 'Add preset').click();
  await panel.getByLabel('Group name', { exact: true }).fill(label);
  await button(panel, 'Save to draft').click();
  await button(panel, `Open ${label}`).click();
}

async function addPrice(page: Page, price: string, label = '') {
  const panel = manager(page);
  await button(panel, 'Add price').click();
  await panel.getByLabel('Size or item name', { exact: true }).fill(label);
  await panel.getByLabel('Price (Rs)', { exact: true }).fill(price);
  await button(panel, 'Save to draft').click();
}

async function reviewChanges(page: Page) {
  await button(manager(page), 'Review changes').click();
  await expect(manager(page).getByRole('heading', { name: 'Review changes', exact: true })).toBeVisible();
  // A deliberate second gesture must follow the production 500ms tap-through guard.
  await page.waitForTimeout(550);
}

async function publish(page: Page) {
  await reviewChanges(page);
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
  await button(manager(page), 'Close manager').click();
}

test('create a price-only preset, publish, and select it as a generic counter line', async ({ page }) => {
  const server = await sharedPresets(page);
  await openManager(page);
  await addGroup(page, 'Pooja items');
  await addPrice(page, '25');
  await expect(page.locator('.items article')).toHaveCount(0);
  await expect(manager(page).getByText('Rs 25.00', { exact: true })).toBeVisible();
  await publish(page);
  await button(page, 'More presets').click();
  await button(page, 'Pooja items').click();
  await button(page, 'Rs 25.00').click();
  await expect(page.getByTestId('total')).toHaveText('Rs 25.00');
  await expect(page.locator('.items article')).toContainText('1 × Rs 25.00');
  await expect(page.locator('.items article')).not.toContainText('Pooja');
  expect(server.attempts).toHaveLength(1);
  expect(server.attempts[0]?.revision).toBe('"0"');
  expect(server.attempts[0]?.document.roots[2]?.children[0]).toMatchObject({ kind: 'item', label: '', priceCents: 2500 });
});

test('allows item names directly within a preset, without a type or brand', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  await addGroup(page, 'Pooja items');
  await addPrice(page, '35.50', 'Incense sticks');
  await expect(button(manager(page), 'Edit Incense sticks')).toBeVisible();
  await publish(page);
  await button(page, 'More presets').click();
  await button(page, 'Pooja items').click();
  await page.getByRole('button', { name: 'Incense sticks · Rs 35.50', exact: true }).click();
  await expect(page.locator('.items article')).toContainText('1 × Rs 35.50');
  await expect(page.locator('.items article')).not.toContainText('Incense sticks');
});

test('five-group cap includes the existing Ghee and Oil roots', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  for (const name of ['Other 1', 'Other 2', 'Other 3']) {
    await addGroup(page, name);
    await button(manager(page), 'All presets').click();
  }
  await expect(button(manager(page), 'Add preset')).toBeDisabled();
  await expect(manager(page)).toContainText('Five preset groups total');
  await expect(button(manager(page), 'Open Ghee')).toBeVisible();
  await expect(button(manager(page), 'Open Oil')).toBeVisible();
});

test('edit a brand and item price, review the old/new price, and publish', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  const panel = manager(page);
  await button(panel, 'Open Ghee').click();
  await button(panel, 'Edit Cow ghee').click();
  await panel.getByLabel('Group name', { exact: true }).fill('Cow premium ghee');
  await button(panel, 'Save to draft').click();
  await button(panel, 'Open Cow premium ghee').click();
  await button(panel, 'Edit 150 g').click();
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('125');
  await button(panel, 'Save to draft').click();
  await reviewChanges(page);
  const price = panel.getByRole('listitem').filter({ hasText: 'Ghee / Cow premium ghee / 150 g' });
  await expect(price).toContainText('Rs 115.00');
  await expect(price).toContainText('Rs 125.00');
  await button(panel, 'Publish changes').click();
  await expect(panel.getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
});

test('delete confirmation counts descendants and Undo restores the complete group', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  const panel = manager(page);
  await button(panel, 'Delete Ghee').click();
  await expect(panel).toContainText('40 prices');
  await expect(panel).toContainText('12 groups');
  await button(panel, 'Confirm delete').click();
  await expect(button(panel, 'Open Ghee')).toHaveCount(0);
  await button(panel, 'Undo').click();
  await button(panel, 'Open Ghee').click();
  await button(panel, 'Open Cow ghee').click();
  await expect(button(panel, 'Edit 150 g')).toBeVisible();
  await expect(button(panel, 'Edit 1.6 kg')).toBeVisible();
});

test('stale publication preserves a draft through reopening and reload needs explicit discard', async ({ page }) => {
  const server = await sharedPresets(page);
  server.fail('stale');
  await openManager(page);
  const panel = manager(page);
  await button(panel, 'Open Ghee').click();
  await button(panel, 'Open Cow ghee').click();
  await button(panel, 'Edit 150 g').click();
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('125');
  await button(panel, 'Save to draft').click();
  await reviewChanges(page);
  await button(panel, 'Publish changes').click();
  await expect(panel.getByRole('alert')).toContainText('another device');
  await expect(button(panel, 'Publish changes')).toBeDisabled();
  await button(panel, 'Close manager').click();
  await button(panel, 'Keep draft').click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await button(page, 'Manage presets').click();
  await reviewChanges(page);
  await expect(panel).toContainText('Rs 125.00');
  await button(panel, 'Reload latest').click();
  await expect(button(panel, 'Discard draft and reload')).toBeVisible();
  await button(panel, 'Continue editing').click();
  await expect(panel).toContainText('Rs 125.00');
  expect(server.attempts).toHaveLength(1);
  await button(panel, 'Reload latest').click();
  await button(panel, 'Discard draft and reload').click();
  await expect(panel).toContainText('Base revision 1');
  await expect(button(panel, 'Reload latest')).toHaveCount(0);
  await expect(button(panel, 'Review changes')).toBeDisabled();
});

test('failed publication keeps the draft and retries with the same request id', async ({ page }) => {
  const server = await sharedPresets(page);
  server.fail('offline');
  await openManager(page);
  await addGroup(page, 'Pooja items');
  await addPrice(page, '25');
  await reviewChanges(page);
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('alert')).toContainText('draft is kept');
  server.fail(null);
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
  expect(server.attempts).toHaveLength(2);
  expect(server.attempts[0]?.requestId).toBeTruthy();
  expect(server.attempts[1]?.requestId).toBe(server.attempts[0]?.requestId);
});

test('local storage failure is visible and does not discard in-memory edits', async ({ page }) => {
  await sharedPresets(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'simplePosPresetDraftV1') throw new Error('Storage full');
      setItem.call(this, key, value);
    };
  });
  await openManager(page);
  await addGroup(page, 'Pooja items');
  await addPrice(page, '25');
  await expect(manager(page).getByRole('alert')).toContainText('could not be saved');
  await expect(manager(page).getByText('Rs 25.00', { exact: true })).toBeVisible();
  await button(manager(page), 'Close manager').click();
  await expect(button(manager(page), 'Keep draft')).toBeDisabled();
  await button(manager(page), 'Continue editing').click();
  await expect(manager(page).getByText('Rs 25.00', { exact: true })).toBeVisible();
});

test('draft survives reload, validation preserves typed input, and Enter stays out of checkout', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  await addGroup(page, 'Pooja items');
  const panel = manager(page);
  await button(panel, 'Add price').click();
  await panel.getByLabel('Size or item name', { exact: true }).fill('Incense');
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('12.999');
  await panel.getByLabel('Price (Rs)', { exact: true }).press('Enter');
  await expect(panel.getByRole('alert')).toContainText('decimal');
  await expect(panel.getByLabel('Price (Rs)', { exact: true })).toHaveValue('12.999');
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('25');
  await panel.getByLabel('Price (Rs)', { exact: true }).press('Enter');
  await expect(button(panel, 'Edit Incense')).toBeVisible();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await page.reload();
  await page.getByRole('button', { name: /Settings/ }).click();
  await button(page, 'Manage presets').click();
  await button(panel, 'Open Pooja items').click();
  await expect(button(panel, 'Edit Incense')).toBeVisible();
});

test('manager actions remain reachable with larger text on tablet and portrait', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  await page.addStyleTag({ content: '.preset-manager { font-size: 22px !important; }' });
  const panel = manager(page);
  await button(panel, 'Open Ghee').click();
  await button(panel, 'Edit Cow ghee').click();
  const save = button(panel, 'Save to draft');
  await save.scrollIntoViewIfNeeded();
  const bounds = await save.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds?.height).toBeGreaterThanOrEqual(48);
  expect(bounds && viewport && bounds.y + bounds.height <= viewport.height).toBe(true);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('typing a new entry keeps focus in the editor as the draft becomes dirty', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  await button(manager(page), 'Add preset').click();
  const name = manager(page).getByLabel('Group name', { exact: true });
  await name.pressSequentially('Pooja items');
  await expect(name).toHaveValue('Pooja items');
  await expect(name).toBeFocused();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});

test('nested type and brand stop at four levels including the price', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  await addGroup(page, 'Pooja items');
  const panel = manager(page);
  for (const label of ['Incense', 'Garden']) {
    await button(panel, 'Add type or brand').click();
    await panel.getByLabel('Group name', { exact: true }).fill(label);
    await button(panel, 'Save to draft').click();
    await button(panel, `Open ${label}`).click();
  }
  await expect(button(panel, 'Add type or brand')).toBeDisabled();
  await addPrice(page, '50', 'Box of 20');
  await reviewChanges(page);
  await expect(panel).toContainText('Pooja items / Incense / Garden / Box of 20');
  await expect(button(panel, 'Publish changes')).toBeEnabled();
});

test('large price changes require acknowledgement and empty draft groups cannot publish', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  const panel = manager(page);
  await addGroup(page, 'Unfinished');
  await reviewChanges(page);
  await expect(panel.getByRole('alert')).toContainText('visible size or price');
  await expect(button(panel, 'Publish changes')).toBeDisabled();
  await button(panel, 'Back to editing').click();
  await addPrice(page, '25');
  await button(panel, 'All presets').click();
  await button(panel, 'Open Ghee').click();
  await button(panel, 'Open Cow ghee').click();
  await button(panel, 'Edit 150 g').click();
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('200');
  await button(panel, 'Save to draft').click();
  await reviewChanges(page);
  await expect(button(panel, 'Publish changes')).toBeDisabled();
  await panel.getByRole('checkbox', { name: 'I have checked the large price changes' }).check();
  await expect(button(panel, 'Publish changes')).toBeEnabled();
});

test('closing an unsaved entry can keep it as a draft or discard it explicitly', async ({ page }) => {
  await sharedPresets(page);
  await openManager(page);
  const panel = manager(page);
  await button(panel, 'Add preset').click();
  await panel.getByLabel('Group name', { exact: true }).fill('Kept entry');
  await button(panel, 'Close manager').click();
  await button(panel, 'Keep draft').click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await button(page, 'Manage presets').click();
  await expect(button(panel, 'Open Kept entry')).toBeVisible();
  await button(panel, 'Close manager').click();
  await button(panel, 'Discard draft').click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await button(page, 'Manage presets').click();
  await expect(button(panel, 'Open Kept entry')).toHaveCount(0);
});

test('publishing disables duplicate submission and closing until the reply arrives', async ({ page }) => {
  const server = await sharedPresets(page);
  await openManager(page);
  await addGroup(page, 'Pooja items');
  await addPrice(page, '25');
  const release = server.holdPublication();
  const panel = manager(page);
  await reviewChanges(page);
  await button(panel, 'Publish changes').click();
  await expect(button(panel, 'Publishing…')).toBeDisabled();
  await expect(button(panel, 'Close manager')).toBeDisabled();
  await expect(button(panel, 'Back to editing')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  release();
  await expect(panel.getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
  expect(server.attempts).toHaveLength(1);
});

test('five-root checkout shortcuts fit larger tablet text and a 320px screen', async ({ page }) => {
  const five = baselineDocument();
  for (let i = 0; i < 3; i++) five.roots.push({ key: `extra-${i}`, kind: 'group', label: `Extra ${i}`, visible: true,
    children: [{ key: `price-${i}`, kind: 'item', label: '', visible: true, priceCents: 2500 }] });
  await sharedPresets(page, five);
  await page.goto('/');
  await expect(button(page, 'More presets')).toBeVisible();
  await page.addStyleTag({ content: 'body{font-size:20.8px}' });
  await page.evaluate(() => document.fonts.ready);
  for (const label of ['Ghee', 'Oil', 'More presets']) {
    const bounds = await button(page, label).boundingBox();
    const viewport = page.viewportSize();
    expect(bounds?.height).toBeGreaterThanOrEqual(48);
    expect(bounds?.width).toBeGreaterThanOrEqual(48);
    if (test.info().project.name === 'samsung-sm-x230') expect(bounds && viewport && bounds.y + bounds.height <= viewport.height).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  await button(page, 'More presets').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('main header, .calculator, .calculator-shortcuts, .basket, footer'))
      .map(element => ({ name: element.className || element.tagName, right: element.getBoundingClientRect().right }))
      .filter(element => element.right > window.innerWidth),
  }));
  expect(layout).toEqual({ width: 320, overflowing: [] });
  for (const label of ['Ghee', 'Oil', 'More presets']) {
    const bounds = await button(page, label).boundingBox();
    expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320).toBe(true);
  }
});

test('double tapping Review after deleting Ghee cannot publish its replacement button', async ({ page }) => {
  // Reproduce the reported overlap; taller layouts place the footer elsewhere.
  await page.setViewportSize({ width: 1280, height: 722 });
  const server = await sharedPresets(page);
  await openManager(page);
  const panel = manager(page);
  await button(panel, 'Delete Ghee').click();
  await button(panel, 'Confirm delete').click();
  await page.evaluate(() => document.fonts.ready);
  const review = button(panel, 'Review changes');
  // Inspect both layouts with keyboard activation, then use their actual overlap.
  await review.press('Enter');
  const replacement = await button(panel, 'Publish changes').boundingBox();
  await button(panel, 'Back to editing').press('Enter');
  const before = await review.boundingBox();
  if (!before || !replacement) throw new Error('Review and Publish must both have measurable bounds.');
  const left = Math.max(before.x, replacement.x), right = Math.min(before.x + before.width, replacement.x + replacement.width);
  const top = Math.max(before.y, replacement.y), bottom = Math.min(before.y + before.height, replacement.y + replacement.height);
  expect(right - left).toBeGreaterThan(32);
  expect(bottom - top).toBeGreaterThan(12);
  const x = right - 20, y = bottom - 6;
  await page.touchscreen.tap(x, y);
  const after = await button(panel, 'Publish changes').boundingBox();
  // The second touch shifts beyond the point guard's 10px radius but stays in
  // both button areas. Only the full-area transition shield can block it.
  expect(after && x + 12 >= after.x && x + 12 <= after.x + after.width && y >= after.y && y <= after.y + after.height).toBe(true);
  await page.touchscreen.tap(x + 12, y);
  await expect(panel.getByRole('heading', { name: 'Review changes', exact: true })).toBeVisible();
  expect(server.attempts).toHaveLength(0);
  await expect(button(panel, 'Publish changes')).toBeEnabled();
});

test('fully blocked draft storage still permits explicit discard and close with a warning', async ({ page }) => {
  await sharedPresets(page);
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) Storage.prototype[method] = () => { throw new Error('Storage blocked'); };
  });
  await openManager(page);
  await addGroup(page, 'Temporary');
  const panel = manager(page);
  await button(panel, 'Close manager').click();
  await expect(button(panel, 'Keep draft')).toBeDisabled();
  await button(panel, 'Discard draft').click();
  await expect(panel.getByRole('alert')).toContainText('saved draft may remain');
  await button(panel, 'Discard and close').click();
  await expect(panel).toBeHidden();
  await button(page, '5').click();
  await button(page, '+ Add Item').click();
  await expect(page.getByTestId('total')).toHaveText('Rs 5.00');
});

async function losePublication(page: Page, server: Awaited<ReturnType<typeof sharedPresets>>, mode: 'lost-reply' | 'lost-uncommitted') {
  server.fail(mode); server.failStatus('offline');
  await openManager(page);
  await addGroup(page, 'Recovered preset');
  await addPrice(page, '25');
  await reviewChanges(page);
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('alert')).toContainText('Could not confirm publication');
  expect(server.attempts).toHaveLength(1);
  expect(server.attempts[0]?.persisted).toMatchObject({ id: server.attempts[0]?.requestId, fingerprint: expect.any(String) });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(manager(page)).toContainText('publication is unconfirmed');
  await expect(manager(page)).toContainText('Latest known revision: 1.');
  await expect(button(manager(page), 'Reload latest')).toHaveCount(0);
  await expect(button(manager(page), 'Publish changes')).toBeEnabled();
  expect(server.attempts).toHaveLength(1);
  await button(manager(page), 'Close manager').click();
  await button(manager(page), 'Keep draft').click();
  await openManager(page); // Full navigation proves the request id survives a new JS runtime.
  await expect(manager(page)).toContainText('publication is unconfirmed');
  await expect(manager(page)).toContainText('Latest known revision: 1.');
  await reviewChanges(page);
}

test('lost reply resolves by read-only publication status after reopening without another POST', async ({ page }) => {
  const server = await sharedPresets(page);
  await losePublication(page, server, 'lost-reply');
  server.failStatus(null);
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
  expect(server.attempts).toHaveLength(1);
  expect(server.statusRequests.at(-1)).toBe(server.attempts[0]?.requestId);
});

test('unknown publication explicitly retries the durable key even after a newer revision', async ({ page }) => {
  const server = await sharedPresets(page);
  await losePublication(page, server, 'lost-reply');
  server.fail(null); server.failStatus('missing');
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('status', { name: 'Preset manager message' })).toContainText('Published');
  expect(server.attempts).toHaveLength(2);
  expect(server.attempts[1]?.requestId).toBe(server.attempts[0]?.requestId);
  expect(server.attempts[1]?.revision).toBe('"0"');
});

test('definitive stale retry becomes a conflict while preserving the unconfirmed draft', async ({ page }) => {
  const server = await sharedPresets(page);
  await losePublication(page, server, 'lost-uncommitted');
  server.fail(null); server.failStatus('missing');
  await button(manager(page), 'Publish changes').click();
  await expect(manager(page).getByRole('alert')).toContainText('another device');
  await expect(button(manager(page), 'Publish changes')).toBeDisabled();
  await expect(manager(page)).toContainText('Recovered preset / Rs 25.00');
  expect(server.attempts).toHaveLength(2);
  expect(server.attempts[1]?.requestId).toBe(server.attempts[0]?.requestId);
});

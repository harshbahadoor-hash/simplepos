import { test, expect } from '@playwright/test';

test('twenty rapid lines keep controls stationary and undo the last edit', async ({ page }) => {
  await page.route('**/*.woff2', async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '+ Add Item', exact: true }).waitFor();
  const before = await page.getByRole('button', { name: '+ Add Item', exact: true }).boundingBox();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.getByRole('button', { name: '+ Add Item', exact: true }).boundingBox()).toEqual(before);
  for (let i = 0; i < 20; i++) { await page.keyboard.type('2*10'); await page.keyboard.press('Enter'); }
  await expect(page.getByTestId('total')).toHaveText('Rs 400.00');
  expect(await page.getByRole('button', { name: '+ Add Item', exact: true }).boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Edit Item 20', exact: true }).click();
  await page.getByLabel('Unit price').fill('25');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 430.00');
  await page.getByRole('button', { name: 'Undo item edit' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 400.00');
});

test('canceled and secondary pointers never activate keys', async ({ page }) => {
  await page.goto('/');
  const key = page.getByRole('button', { name: '5', exact: true });
  for (const canceled of [true, false]) {
    await key.evaluate((button, cancel) => {
      const bounds = button.getBoundingClientRect();
      const options = { bubbles: true, pointerId: 7, isPrimary: cancel, button: 0, clientX: bounds.x + 10, clientY: bounds.y + 10 };
      button.dispatchEvent(new PointerEvent('pointerdown', options));
      if (cancel) button.dispatchEvent(new PointerEvent('pointercancel', options));
      button.dispatchEvent(new PointerEvent('pointerup', options));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    }, canceled);
    await expect(page.locator('output')).toHaveText('0');
  }
  await key.click(); await expect(page.locator('output')).toHaveText('5');
});

test('storage failure and invalid cash preserve a usable sale', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
  await page.goto('/'); await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  for (const invalid of ['', '12.', '12.999', '1.2.3']) {
    await page.getByLabel('Cash received').fill(invalid);
    await page.getByRole('button', { name: 'Complete & Print' }).click();
    await expect(page.getByText('Sale complete', { exact: true })).not.toBeVisible();
  }
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 0.00');
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await expect(page.getByTestId('change')).not.toBeVisible();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await expect(page.getByLabel('Cash received')).toHaveValue('');
});

test('loaded POS and icon reload without a network', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(baseURL!);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    await context.setOffline(true); await page.reload();
    await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
    expect(await page.locator('.calculator-mark img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.keyboard.type('15.50'); await page.keyboard.press('Enter');
    await expect(page.getByTestId('total')).toHaveText('Rs 16.00');
  } finally { await context.close(); }
});

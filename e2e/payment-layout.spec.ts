import { test, expect, type Page } from '@playwright/test';

async function payment(page: Page, amount = '140') {
  await page.goto('/'); await page.keyboard.type(amount); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.evaluate(() => document.fonts.ready);
}
async function connectTestPrinter(page: Page) {
  await page.addInitScript(() => {
    const writes: number[] = []; Object.defineProperty(window, 'paymentWrites', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { writes.push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-80', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await payment(page); await page.getByRole('button', { name: 'Back to sale', exact: true }).click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)', exact: true }).click();
  await expect(page.getByText('Selected: XP-80 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Pay —' }).click(); await page.getByRole('button', { name: 'Exact', exact: true }).click();
}
async function receiptCount(page: Page) {
  const bytes: number[] = await page.evaluate(() => Reflect.get(window, 'paymentWrites'));
  return bytes.filter((value, index) => value === 29 && bytes[index + 1] === 86 && bytes[index + 2] === 0).length;
}
// Android WebView scales explicit pixel font sizes as well as inherited text.
async function androidTextScale(page: Page) {
  await page.evaluate(() => {
    const fonts = [...document.querySelectorAll<HTMLElement>('body, body *')].map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of fonts) element.style.fontSize = `${size * 1.3}px`;
  });
}
async function fitsWithoutScroll(page: Page) {
  const metrics = await page.locator('.payment').evaluate(panel => {
    const panels = [panel, ...panel.querySelectorAll('.payment-input, .payment-summary')];
    return panels.map(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  });
  for (const metric of metrics) expect(metric.scroll).toBeLessThanOrEqual(metric.client + 1);
  for (const control of await page.locator('.payment button,.payment input').all()) {
    const bounds = await control.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(48); expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
}

test('tablet payment fits every key and action at actual Android text scale', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Landscape tablet fit contract');
  await payment(page); await androidTextScale(page); await fitsWithoutScroll(page);
  const header = await page.locator('header').boundingBox();
  expect(header!.height).toBeLessThanOrEqual(68);
  const panel = await page.locator('.payment').boundingBox();
  expect(panel!.width).toBe(page.viewportSize()!.width - 40);
  for (const action of await page.locator('header>button').all()) {
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  const input = await page.locator('.payment-input').boundingBox();
  for (const key of await page.getByRole('group', { name: 'Cash keypad' }).getByRole('button').all()) {
    const rect = await key.boundingBox(); expect(rect!.y + rect!.height).toBeLessThanOrEqual(input!.y + input!.height);
  }
});

test('change, due and cash shortcuts keep completion stationary', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Landscape tablet fit contract');
  await payment(page); await androidTextScale(page);
  const complete = page.getByRole('button', { name: 'Complete & Print', exact: true });
  const bounds = await complete.boundingBox();
  await page.getByRole('button', { name: 'Cash 200', exact: true }).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  expect(await complete.boundingBox()).toEqual(bounds);
  await page.getByRole('button', { name: 'Clear cash', exact: true }).click();
  await expect(page.getByTestId('due')).toHaveText('Rs 140.00'); expect(await complete.boundingBox()).toEqual(bounds);
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 0.00'); expect(await complete.boundingBox()).toEqual(bounds);
  await fitsWithoutScroll(page);
});

test('short landscape tablet keeps cash controls reachable without scrolling', async ({ page }) => {
  test.skip(test.info().project.name !== 'samsung-sm-x230', 'One explicit short tablet viewport');
  await page.setViewportSize({ width: 1024, height: 600 });
  for (const amount of ['10500', '99999999']) {
    await payment(page, amount); await androidTextScale(page); await fitsWithoutScroll(page);
    await page.getByRole('button', { name: 'Back to sale', exact: true }).click();
    await page.getByRole('button', { name: 'Delete Item 1', exact: true }).click();
  }
});

test('failed receipt keeps retry, change and New Sale on screen', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Landscape tablet fit contract');
  await payment(page); await page.getByRole('button', { name: 'Cash 200', exact: true }).click();
  await page.getByRole('button', { name: 'Complete & Print', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Print', exact: true })).toBeVisible();
  await androidTextScale(page); await fitsWithoutScroll(page);
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
});

test('double tapping Complete cannot print again through the replacement button', async ({ page }) => {
  await connectTestPrinter(page);
  await page.getByRole('button', { name: 'Complete & Print', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Print Again', exact: true })).toBeVisible();
  expect(await receiptCount(page)).toBe(1);
  await page.getByRole('button', { name: 'New Sale', exact: true }).dblclick();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00'); await expect(page.locator('output')).toHaveText('0');
});

test('two fast touch taps with finger drift cannot reprint the completed receipt', async ({ page }) => {
  test.skip(test.info().project.name !== 'samsung-sm-x230', 'Actual tablet touch geometry');
  await connectTestPrinter(page); await androidTextScale(page);
  await page.getByRole('button', { name: 'Cash 200', exact: true }).click();
  const bounds = (await page.getByRole('button', { name: 'Complete & Print', exact: true }).boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + 12;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(130); // Reproduce a fast second touch with ordinary finger drift.
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x + 12, y)?.textContent, { x, y })).toBe('Print Again');
  await page.touchscreen.tap(x + 12, y);
  await expect(page.getByRole('button', { name: 'Print Again', exact: true })).toBeVisible();
  expect(await receiptCount(page)).toBe(1);
});

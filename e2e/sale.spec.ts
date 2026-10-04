import { test, expect } from '@playwright/test';
test('keyboard sale calculates 140 total and keeps 60 change after completion', async ({ page }) => {
  await page.goto('/');
  for (const value of ['10', '15', '2*20', '3*25']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('total')).toHaveText('Rs 140.00');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByLabel('Cash received').fill('200');
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await expect(page.getByText('Sale complete', { exact: true })).toBeVisible();
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  await page.getByRole('button', { name: 'New Sale' }).click();
  await page.getByRole('button', { name: 'Start new sale', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});
test('audio failure cannot block rapid entry, undo, clear confirmation or short-cash validation', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Audio blocked'); } } }); });
  await page.goto('/');
  await page.keyboard.type('1234567890');
  await expect(page.locator('output')).toHaveText('1234567890');
  await page.keyboard.press('Escape');
  await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Delete Item 1' }).click();
  await page.getByRole('button', { name: 'Undo removal' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
  await page.getByRole('button', { name: 'Clear sale', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByLabel('Cash received').fill('5');
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await expect(page.getByRole('status')).toContainText('Rs 5.00 short');
  await expect(page.getByText('Sale complete', { exact: true })).not.toBeVisible();
});
test('BLE printing sends real receipt bytes and supports printing again', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[] = [];
    Object.defineProperty(window, 'receiptOutput', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { writes.push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-58', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)' }).click();
  await expect(page.getByText('Selected: XP-58 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.keyboard.type('2*15.50'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByLabel('Cash received').fill('50');
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await expect(page.getByRole('status')).toHaveText('Receipt sent to printer.');
  const output = await page.evaluate(() => new TextDecoder().decode(new Uint8Array(Reflect.get(window, 'receiptOutput'))));
  expect(output).toContain('31.00'); expect(output).toContain('19.00'); expect(output).toContain('BAHADOOR POOJA SHOP');
  await page.getByRole('button', { name: 'Print Again' }).click();
  await expect(page.getByRole('status')).toHaveText('Receipt sent to printer.');
});
test('editing quantity and price recalculates the sale', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await page.getByLabel('Quantity').fill('3');
  await page.getByLabel('Unit price').fill('25');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 75.00');
});
test('tablet keeps keypad, total and payment inside the visible screen', async ({ page }) => {
  test.skip(test.info().project.name !== 'samsung-sm-x230');
  await page.goto('/');
  for (const name of ['7', '0', '+ Add Item']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(722);
  }
  const pay = await page.getByRole('button', { name: 'Pay —' }).boundingBox();
  expect(pay!.y + pay!.height).toBeLessThanOrEqual(722);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(722);
});
test('undo does not redirect an edit to a restored item', async ({ page }) => {
  await page.goto('/');
  for (const value of ['10', '20']) { await page.keyboard.type(value); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Delete Item 1' }).click();
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await page.getByRole('button', { name: 'Undo removal' }).click();
  await expect(page.getByRole('button', { name: 'Save Item', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit Item 2' }).click();
  await page.getByLabel('Unit price').fill('25');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 35.00');
});
test('refresh recovers an unfinished sale but stores no completed sale', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.reload(); await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await page.reload(); await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});

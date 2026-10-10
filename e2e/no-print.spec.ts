import { test, expect } from '@playwright/test';

test('complete without printing validates cash and retains change and optional receipt', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('140'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  const complete = page.getByRole('button', { name: 'Complete Without Printing', exact: true });
  await expect(complete).toBeVisible();
  await page.getByRole('textbox', { name: 'Cash received' }).fill('100'); await complete.click();
  await expect(page.getByRole('status', { name: 'Counter message' })).toHaveText('Cash received is Rs 40.00 short.');
  await expect(complete).toBeVisible();
  await page.getByRole('button', { name: 'Cash 200', exact: true }).click(); await complete.dblclick();
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  await expect(page.getByRole('status', { name: 'Counter message' })).toHaveText('Sale complete without printing.');
  await expect(page.getByRole('button', { name: 'Print Receipt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue Without Printing', exact: true })).toHaveCount(0);
  // Separate the next customer's gesture from the 500 ms tap-through guard.
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: 'New Sale', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});

test('skip printing never writes even with a connected printer and Other payment', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'noPrintWrites', { value: [] });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { Reflect.get(window, 'noPrintWrites').push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-80', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)' }).click();
  await expect(page.getByText('Selected: XP-80 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.keyboard.type('25'); await page.keyboard.press('Enter'); await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Without Printing', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Counter message' })).toHaveText('Sale complete without printing.');
  expect(await page.evaluate(() => Reflect.get(window, 'noPrintWrites').length)).toBe(0);
  await page.getByRole('button', { name: 'Print Receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print Again', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'noPrintWrites').length)).toBeGreaterThan(0);
});

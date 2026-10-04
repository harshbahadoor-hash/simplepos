import { test, expect } from '@playwright/test';

test('waiting updates are offered only between customers and never reload new input', async ({ page }) => {
  await page.addInitScript(() => {
    const worker = new EventTarget();
    let requests = 0;
    Object.assign(worker, { register: async () => ({ waiting: { postMessage: () => requests++ }, addEventListener() {} }) });
    Object.defineProperty(navigator, 'serviceWorker', { value: worker });
    Object.defineProperty(window, 'updateRequests', { get: () => requests });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Apply update' })).toBeVisible();
  await page.keyboard.type('10');
  await expect(page.getByRole('button', { name: 'Apply update' })).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Apply update' }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'updateRequests'))).toBe(1);
  await page.keyboard.type('25');
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(page.locator('output')).toHaveText('25');
});

test('printer timeout aborts BLE and leaves reconnect usable', async ({ page }) => {
  await page.addInitScript(() => {
    let aborted = false;
    Object.defineProperty(window, 'printerAborted', { get: () => aborted });
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-58', addEventListener() {}, gatt: { connected: false, connect: () => new Promise(() => {}), disconnect: () => { aborted = true; } } }) } });
  });
  await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)' }).click();
  await expect(page.getByRole('button', { name: 'Change Printer (BLE)' })).toBeDisabled();
  await page.clock.fastForward(16000);
  await expect(page.getByRole('status', { name: 'Counter message' })).toContainText('timed out');
  expect(await page.evaluate(() => Reflect.get(window, 'printerAborted'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Change Printer (BLE)' })).toBeEnabled();
});

test('duplicate completion sends exactly one receipt', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[] = [];
    Object.defineProperty(window, 'receiptOutput', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { await new Promise(resolve => setTimeout(resolve, 5)); writes.push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-58', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)' }).click();
  await expect(page.getByText('Selected: XP-58 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click(); await page.getByRole('button', { name: 'Exact' }).click();
  await page.getByRole('button', { name: 'Complete & Print' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Print Again' })).toBeEnabled();
  const receipt = await page.evaluate(() => new TextDecoder().decode(new Uint8Array(Reflect.get(window, 'receiptOutput'))));
  expect(receipt.match(/BAHADOOR POOJA SHOP/g)).toHaveLength(1);
  await expect(page.getByTestId('change')).toHaveText('Rs 0.00');
});

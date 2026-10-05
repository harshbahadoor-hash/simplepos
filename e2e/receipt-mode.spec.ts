import { test, expect } from '@playwright/test';

test('saved receipt toggle combines only printed lines and reprints either format', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[] = []; Object.defineProperty(window, 'receiptModeWrites', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => {
      writes.push(...bytes);
      if (Reflect.get(window, 'holdReceipt')) await new Promise<void>(resolve => {
        Reflect.set(window, 'releaseReceipt', () => { Reflect.set(window, 'holdReceipt', false); resolve(); });
      });
    } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-80', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/'); await page.getByRole('button', { name: /Settings/ }).click();
  const toggle = page.getByRole('button', { name: /Combine same-price receipt lines/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false'); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Change Printer (BLE)', exact: true }).click();
  await expect(page.getByText('Selected: XP-80 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  for (const entry of ['40', '20', '30', '2.5*20', '2*40']) { await page.keyboard.type(entry); await page.keyboard.press('Enter'); }
  await expect(page.locator('.items article')).toHaveCount(5); await expect(page.getByTestId('total')).toHaveText('Rs 220.00');
  await page.getByRole('button', { name: 'Pay —' }).click(); await page.getByRole('button', { name: 'Cash 500', exact: true }).click();
  await page.evaluate(() => Reflect.set(window, 'holdReceipt', true));
  await page.getByRole('button', { name: 'Complete & Print', exact: true }).click();
  const formats = page.getByRole('group', { name: 'Receipt line format' });
  await expect(formats.getByRole('button', { name: 'Original', exact: true })).toBeDisabled();
  await expect(formats.getByRole('button', { name: 'Combine same prices', exact: true })).toBeDisabled();
  await page.waitForFunction(() => typeof Reflect.get(window, 'releaseReceipt') === 'function');
  await page.evaluate(() => Reflect.get(window, 'releaseReceipt')());
  await expect(page.getByRole('button', { name: 'Print Again', exact: true })).toBeEnabled();
  await expect(formats.getByRole('button', { name: 'Combine same prices', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const first: number[] = await page.evaluate(() => Reflect.get(window, 'receiptModeWrites'));
  const compact = new TextDecoder().decode(new Uint8Array(first));
  expect(compact.match(/^\d+\./gm)).toHaveLength(3);
  expect(compact).toMatch(/1\. 3 x 40.00 +120.00/); expect(compact).toMatch(/2\. 3.5 x 20.00 +70.00/);
  await formats.getByRole('button', { name: 'Original', exact: true }).click();
  await page.getByRole('button', { name: 'Print Again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print Again', exact: true })).toBeEnabled();
  const all: number[] = await page.evaluate(() => Reflect.get(window, 'receiptModeWrites'));
  const original = new TextDecoder().decode(new Uint8Array(all.slice(first.length)));
  expect(original.match(/^\d+\./gm)).toHaveLength(5);
  expect(original).toMatch(/4\. 2.5 x 20.00 +50.00/); expect(original).toMatch(/5\. 2 x 40.00 +80.00/);
  for (const text of [compact, original]) expect(text).toMatch(/TOTAL +Rs 220.00\nCash +Rs 500.00\nChange +Rs 280.00/);
  if (test.info().project.name !== 'phone-portrait') {
    const panels = await page.locator('.payment,.payment-input,.payment-summary').evaluateAll(elements => elements.map(element => [element.clientHeight, element.scrollHeight]));
    for (const [client, scroll] of panels) expect(scroll).toBeLessThanOrEqual(client! + 1);
  }
  await formats.getByRole('button', { name: 'Combine same prices', exact: true }).click();
  await page.getByRole('button', { name: 'New Sale', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: /Settings/ }).click(); await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click(); await page.reload(); await page.getByRole('button', { name: /Settings/ }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

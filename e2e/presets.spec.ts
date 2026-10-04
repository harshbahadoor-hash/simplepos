import { test, expect } from '@playwright/test';

test('00 key makes high prices fast and stays within tablet touch bounds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: '00', exact: true }).click();
  await expect(page.locator('output')).toHaveText('500');
  await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 500.00');
  const bounds = await page.getByRole('button', { name: '00', exact: true }).boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(48);
  expect(bounds!.width).toBeGreaterThanOrEqual(48);
  if (test.info().project.name === 'samsung-sm-x230') expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(722);
});

test('Ghee picker adds generic priced lines, supports quantity and Undo', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type('1.5*');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Ghee presets' });
  await picker.getByRole('button', { name: 'Gopal ghee', exact: true }).click();
  await picker.getByRole('button', { name: '150 ml · Rs 130.00', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.getByTestId('total')).toHaveText('Rs 195.00');
  await expect(page.locator('.items article')).toContainText('1.5 × Rs 130.00');
  await expect(page.getByTestId('quantity-display')).toContainText('1');
  await page.getByRole('button', { name: 'Undo added Rs 195.00' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await picker.getByRole('button', { name: 'RKG ghee', exact: true }).click();
  await picker.getByRole('button', { name: 'Back to brands', exact: true }).click();
  await picker.getByRole('button', { name: 'Stanwood ghee', exact: true }).click();
  await picker.getByRole('button', { name: '200 ml · Rs 90.00', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 90.00');
});

test('preset navigation preserves pending prices and edits', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('25');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ghee presets' })).not.toBeVisible();
  await expect(page.locator('output')).toHaveText('25');
  await expect(page.getByRole('status', { name: 'Counter message' })).toContainText('Add or clear');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await expect(page.getByRole('button', { name: 'Ghee', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Cow ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Close presets', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 25.00');
});

test('a preset commits once and returns keyboard focus to the calculator', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Agni ghee', exact: true }).click();
  await page.getByRole('button', { name: '500 ml · Rs 150.00', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.locator('.items article')).toHaveCount(1);
  await expect(page.getByTestId('total')).toHaveText('Rs 150.00');
  await expect(page.locator('output')).toBeFocused();
  await page.keyboard.type('5'); await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('Rs 155.00');
});

test('rapid second taps cannot pass through a closing preset picker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'RKG ghee', exact: true }).click();
  await page.getByRole('button', { name: '5 L · Rs 2,650.00', exact: true }).dblclick();
  await expect(page.locator('output')).toHaveText('0');
  await expect(page.locator('.items article')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('Rs 2,650.00');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(page.locator('output')).toHaveText('77');
});

test('Escape and Close preserve pending quantity and return focus', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('1.5*');
  const opener = page.getByRole('button', { name: 'Ghee', exact: true });
  await opener.click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ghee presets' })).not.toBeVisible();
  await expect(page.getByTestId('quantity-display')).toContainText('1.5');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Cow ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Close presets', exact: true }).click();
  await expect(page.getByTestId('quantity-display')).toContainText('1.5');
  await expect(opener).toBeFocused();
});

test('double-clicking a brand cannot select its replacement size', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'RKG ghee', exact: true }).dblclick();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await expect(page.getByRole('dialog', { name: 'Ghee presets' })).toBeVisible();
  await page.getByRole('button', { name: '200 ml · Rs 145.00', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 145.00');
});

test('double-clicking Close cannot type into the calculator underneath', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('1.5*');
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Cow ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Close presets', exact: true }).dblclick();
  await expect(page.locator('output')).toHaveText('0');
  await expect(page.getByTestId('quantity-display')).toContainText('1.5');
  await expect(page.getByRole('button', { name: 'Ghee', exact: true })).toBeFocused();
});

test('intentional brand-to-size taps stay fast at the tablet text scaling', async ({ page }) => {
  await page.goto('/'); await page.addStyleTag({ content: 'body{font-size:20.8px}' });
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Agni ghee', exact: true }).click();
  await page.getByRole('button', { name: '500 ml · Rs 150.00', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ghee presets' })).not.toBeVisible();
  await expect(page.getByTestId('total')).toHaveText('Rs 150.00');
});

test('preset receipts contain only generic quantities and prices, and still cut', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[] = [];
    Object.defineProperty(window, 'receiptOutput', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { writes.push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-80', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Change Printer (BLE)' }).click();
  await expect(page.getByText('Selected: XP-80 · Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'RKG ghee', exact: true }).click();
  await page.getByRole('button', { name: '5 L · Rs 2,650.00', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 2,650.00');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await expect(page.getByRole('status', { name: 'Counter message' })).toHaveText('Receipt sent to printer.');
  const bytes: number[] = await page.evaluate(() => Reflect.get(window, 'receiptOutput'));
  const receipt = new TextDecoder().decode(new Uint8Array(bytes));
  expect(receipt).toContain('1. 1 x 2650.00');
  expect(receipt).not.toMatch(/ghee|rkg|5 L/i);
  expect(bytes.slice(-3)).toEqual([29, 86, 0]);
});

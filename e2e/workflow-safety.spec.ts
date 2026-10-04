import { test, expect } from '@playwright/test';

test('Pay cannot drop a pending price; additions can be undone and edits canceled', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.keyboard.type('25');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await expect(page.locator('output')).toHaveText('25');
  await expect(page.getByRole('status', { name: 'Counter message' })).toContainText('Add or clear');
  await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
  await page.getByRole('button', { name: /Undo added/ }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await page.getByLabel('Unit price').fill('50');
  await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
});

test('cash keypad shows due before change and retains receipt before a new sale', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('140'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await expect(page.getByTestId('change')).not.toBeVisible();
  const keypad = page.getByRole('group', { name: 'Cash keypad' });
  await keypad.getByRole('button', { name: '1', exact: true }).click();
  await keypad.getByRole('button', { name: '0', exact: true }).click();
  await keypad.getByRole('button', { name: '0', exact: true }).click();
  await expect(page.getByTestId('due')).toHaveText('Rs 40.00');
  await page.getByRole('button', { name: 'Cash 200', exact: true }).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  await page.getByRole('button', { name: 'Complete & Print' }).click();
  await page.getByRole('button', { name: 'New Sale', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Start a new sale?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep receipt', exact: true }).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
  await page.getByRole('button', { name: 'New Sale', exact: true }).click();
  await page.getByRole('button', { name: 'Start new sale', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});

test('dragging off a key and held Enter do not enter extra digits or lines', async ({ page }) => {
  await page.goto('/');
  const bounds = await page.getByRole('button', { name: '5', exact: true }).boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds!.x + bounds!.width + 25, bounds!.y); await page.mouse.up();
  await expect(page.locator('output')).toHaveText('0');
  await page.keyboard.type('10');
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })));
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
});

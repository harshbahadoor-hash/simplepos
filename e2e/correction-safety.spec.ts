import { test, expect } from '@playwright/test';

test('deleting a basket item preserves the price currently being entered', async ({ page }) => {
  await page.goto('/');
  for (const price of ['10', '20']) { await page.keyboard.type(price); await page.keyboard.press('Enter'); }
  await page.keyboard.type('1.5*25');
  await page.getByRole('button', { name: 'Delete Item 1', exact: true }).click();
  await expect(page.locator('output')).toHaveText('25');
  await expect(page.getByTestId('quantity-display')).toContainText('1.5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('Rs 58.00');
});

test('Undo preserves a new pending price instead of dropping it', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await page.keyboard.type('25');
  await page.getByRole('button', { name: 'Undo added Rs 10.00', exact: true }).click();
  await expect(page.locator('output')).toHaveText('25');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('Rs 25.00');
});

test('Edit cannot silently replace a pending price or another unsaved edit', async ({ page }) => {
  await page.goto('/');
  for (const price of ['10', '20']) { await page.keyboard.type(price); await page.keyboard.press('Enter'); }
  await page.keyboard.type('25');
  await page.getByRole('button', { name: 'Edit Item 1', exact: true }).click();
  await expect(page.locator('output')).toHaveText('25');
  await expect(page.getByRole('button', { name: 'Save Item', exact: true })).not.toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Edit Item 1', exact: true }).click();
  await page.getByLabel('Unit price', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Edit Item 2', exact: true }).click();
  await expect(page.getByLabel('Unit price', { exact: true })).toHaveValue('50');
  await page.getByRole('button', { name: 'Undo added Rs 25.00', exact: true }).click();
  await expect(page.getByLabel('Unit price', { exact: true })).toHaveValue('50');
  await page.getByRole('button', { name: 'Save Item', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 95.00');
});

test('tapping the already selected Cash method preserves entered cash', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('140'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay —' }).click();
  await page.getByLabel('Cash received', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await expect(page.getByLabel('Cash received', { exact: true })).toHaveValue('200');
  await expect(page.getByTestId('change')).toHaveText('Rs 60.00');
});

import { test, expect } from '@playwright/test';

test('large times button is directly above Add and quantity resets after adding', async ({ page }) => {
  await page.goto('/');
  const quantity = page.getByTestId('quantity-display');
  await expect(quantity).toContainText('1');
  const multiply = page.getByRole('button', { name: 'Multiply', exact: true });
  const box = await multiply.boundingBox();
  const add = await page.getByRole('button', { name: '+ Add Item', exact: true }).boundingBox();
  expect(Math.abs(box!.x - add!.x)).toBeLessThan(2);
  expect(Math.abs(box!.width - add!.width)).toBeLessThan(2);
  expect(box!.y + box!.height).toBeLessThanOrEqual(add!.y);
  expect(await multiply.locator('.times-symbol').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(36);
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: 'Multiply', exact: true }).click();
  await expect(quantity.locator('strong')).toHaveText('2');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
  await expect(quantity.locator('strong')).toHaveText('1');
  await expect(page.getByTestId('total')).toHaveText('Rs 20.00');
});

test('large Add sits beside keypad and a second tap adds no duplicate', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: '+ Add Item', exact: true });
  await expect(add).toBeDisabled();
  const keypad = await page.locator('.keypad').boundingBox();
  const action = await add.boundingBox();
  expect(action!.x).toBeGreaterThanOrEqual(keypad!.x + keypad!.width + 10);
  expect(Math.abs(action!.y - keypad!.y)).toBeLessThan(2);
  expect(action!.height).toBeGreaterThanOrEqual(keypad!.height - 2);
  expect(action!.width).toBeGreaterThanOrEqual(90);
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await expect(add).toBeEnabled();
  await add.dblclick();
  await expect(page.getByTestId('total')).toHaveText('Rs 10.00');
  await expect(page.getByRole('button', { name: 'Edit Item 2' })).not.toBeVisible();
  await expect(add).toBeDisabled();
});

test('decimal quantity works through times button and during editing', async ({ page }) => {
  await page.goto('/');
  for (const name of ['1', '.', '2', '5', 'Multiply', '1', '5', '.', '5', '0']) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 20.00');
  await expect(page.locator('.items article>strong')).toHaveText('Rs 19.38');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await page.getByLabel('Quantity').fill('0');
  await page.getByLabel('Quantity').pressSequentially('.5');
  await expect(page.getByLabel('Quantity')).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 8.00');
  await expect(page.locator('.items article>strong')).toHaveText('Rs 7.75');
});

test('quantity field follows reselected items, Escape and keypad multiplication during edit', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('1.25*15.50'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('2.5');
  await page.getByRole('button', { name: 'Edit Item 1' }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('1.25');
  await page.locator('output').focus(); await page.keyboard.press('Escape');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('1');
  await page.keyboard.type('2.5*10');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('2.5');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 25.00');
});

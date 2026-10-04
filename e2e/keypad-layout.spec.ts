import { test, expect } from '@playwright/test';

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

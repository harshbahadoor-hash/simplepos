import { test, expect, type Page } from '@playwright/test';

// Independent values transcribed from the requested menu, not production data.
const oils = [
  { type: 'Coconut oil', total: 'Rs 900.00', brands: [
    { name: 'Badaye', sizes: [['100 ml', 40]] },
    { name: 'Tristar', sizes: [['500 ml', 150], ['1 L', 260]] },
    { name: 'RKG', sizes: [['500 ml', 160], ['1 L', 290]] },
  ] },
  { type: 'Mustard oil', total: 'Rs 1,670.00', brands: [
    { name: 'Badye', sizes: [['100 ml', 35], ['500 ml', 80]] },
    { name: 'Vishal', sizes: [['200 ml', 55], ['500 ml', 100], ['1 L', 200]] },
    { name: 'Patanjali', sizes: [['1 L', 230]] },
    { name: 'RKG', sizes: [['200 ml', 65], ['500 ml', 130], ['1 L', 200]] },
    { name: 'Dabur', sizes: [['1 L', 200]] },
    { name: 'Mughal', sizes: [['250 ml', 65], ['500 ml', 110], ['1 L', 200]] },
  ] },
  { type: 'Sesame oil', total: 'Rs 950.00', brands: [
    { name: 'Badye', sizes: [['100 ml', 35], ['500 ml', 80]] },
    { name: 'Vishal', sizes: [['200 ml', 55], ['500 ml', 100], ['1 L', 200]] },
    { name: 'RKG', sizes: [['200 ml', 75], ['500 ml', 145]] },
    { name: 'Patanjali', sizes: [['1 L', 260]] },
  ] },
  { type: 'Chameli oil', total: 'Rs 490.00', brands: [
    { name: '', sizes: [['100 ml', 75], ['200 ml', 140], ['500 ml', 275]] },
  ] },
] as const;

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function chooseOil(page: Page, type: string, brand: string, size: string, rupees: number) {
  await button(page, 'Oil').click();
  await button(page, type).click();
  if (brand) await button(page, brand).click();
  await button(page, `${size} · Rs ${rupees.toFixed(2)}`).click();
}

for (const oil of oils) test(`${oil.type} menu adds every supplied brand/size at its exact price`, async ({ page }) => {
  await page.goto('/');
  let count = 0;
  for (const brand of oil.brands) for (const [size, price] of brand.sizes) {
    await chooseOil(page, oil.type, brand.name, size, price);
    await expect(page.getByRole('dialog', { name: 'Oil presets' })).not.toBeVisible();
    await expect(page.locator('.items article').last()).toContainText(`1 × Rs ${price.toFixed(2)}`);
    await expect(page.locator('.items article').last()).toContainText(`Item ${++count}`);
  }
  await expect(page.locator('.items article')).toHaveCount(count);
  await expect(page.getByTestId('total')).toHaveText(oil.total);
  await expect(page.locator('.items')).not.toContainText(oil.type);
});

test('oil navigation, Escape and Undo preserve decimal quantity and calculator focus', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('1.5*');
  await button(page, 'Oil').click();
  await button(page, 'Mustard oil').click(); await button(page, 'RKG').click();
  await button(page, 'Back to brands').click();
  await expect(page.getByRole('heading', { name: 'Mustard oil · Choose a brand' })).toBeVisible();
  await button(page, 'Back to oil types').click();
  await button(page, 'Chameli oil').click();
  await button(page, 'Back to oil types').click();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Oil')).toBeFocused();
  await expect(page.getByTestId('quantity-display')).toHaveText('Qty 1.5');
  await chooseOil(page, 'Coconut oil', 'Badaye', '100 ml', 40);
  await expect(page.getByTestId('total')).toHaveText('Rs 60.00');
  await expect(page.getByTestId('quantity-display')).toHaveText('Qty 1');
  await expect(page.locator('output')).toBeFocused();
  await button(page, 'Undo added Rs 60.00').click();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
});

test('oil shortcuts cannot overwrite a price or an item edit', async ({ page }) => {
  await page.goto('/'); await page.keyboard.type('25');
  await button(page, 'Oil').click();
  await expect(page.getByRole('dialog', { name: 'Oil presets' })).not.toBeVisible();
  await expect(page.locator('output')).toHaveText('25');
  await expect(page.locator('output')).toBeFocused();
  await page.keyboard.press('Enter'); await button(page, 'Edit Item 1').click();
  await expect(button(page, 'Oil')).toBeDisabled();
  await expect(button(page, 'Ghee')).toBeDisabled();
  await button(page, 'Cancel edit').click();
  await chooseOil(page, 'Chameli oil', '', '100 ml', 75);
  await expect(page.getByTestId('total')).toHaveText('Rs 100.00');
});

test('rapid oil type, brand, Back and size taps cannot advance or add accidentally', async ({ page }) => {
  await page.goto('/'); await page.addStyleTag({ content: 'body{font-size:20.8px}' });
  await button(page, 'Oil').click(); await button(page, 'Mustard oil').dblclick();
  await expect(page.getByRole('heading', { name: 'Mustard oil · Choose a brand' })).toBeVisible();
  await button(page, 'RKG').dblclick();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await button(page, 'Back to brands').dblclick();
  await expect(page.getByRole('heading', { name: 'Mustard oil · Choose a brand' })).toBeVisible();
  await button(page, 'RKG').click();
  await button(page, '200 ml · Rs 65.00').dblclick();
  await expect(page.locator('.items article')).toHaveCount(1);
  await expect(page.locator('output')).toHaveText('0');
  await expect(page.getByTestId('total')).toHaveText('Rs 65.00');
  await button(page, '7').click(); await button(page, '7').click();
  await expect(page.locator('output')).toHaveText('77');
});

test('oil and ghee shortcuts fit the tablet without moving the primary controls', async ({ page }) => {
  await page.goto('/'); await page.addStyleTag({ content: 'body{font-size:20.8px}' });
  await page.evaluate(() => document.fonts.ready);
  const add = await button(page, '+ Add Item').boundingBox();
  const controls = [];
  for (const name of ['00', 'Ghee', 'Oil', 'Clear input']) {
    const bounds = await button(page, name).boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(48); expect(bounds!.height).toBeGreaterThanOrEqual(48);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (test.info().project.name !== 'phone-portrait') expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    controls.push(bounds!);
  }
  for (let i = 1; i < controls.length; i++) expect(controls[i]!.x).toBeGreaterThanOrEqual(controls[i - 1]!.x + controls[i - 1]!.width);
  await chooseOil(page, 'Sesame oil', 'Patanjali', '1 L', 260);
  expect(await button(page, '+ Add Item').boundingBox()).toEqual(add);
});

test('shortcuts remain reachable on a 320px screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/'); await page.addStyleTag({ content: 'body{font-size:20.8px}' });
  await page.evaluate(() => document.fonts.ready);
  for (const name of ['00', 'Ghee', 'Oil', 'Clear input']) {
    const bounds = await button(page, name).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(bounds!.width).toBeGreaterThanOrEqual(48); expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await chooseOil(page, 'Chameli oil', '', '100 ml', 75);
  await expect(page.getByTestId('total')).toHaveText('Rs 75.00');
});

test('updated ghee options add sized Gavardhan, Stanwood and Trishul lines', async ({ page }) => {
  await page.goto('/');
  for (const [brand, size, price] of [
    ['Gavardhan ghee', '200 ml', 150], ['Gavardhan ghee', '500 ml', 300], ['Gavardhan ghee', '1 L', 550],
    ['Stanwood ghee', '200 ml', 90], ['Stanwood ghee', '500 ml', 160], ['Stanwood ghee', '1 L', 285],
    ['Trishul ghee', '100 ml', 50], ['Trishul ghee', '200 ml', 80], ['Trishul ghee', '500 ml', 135], ['Trishul ghee', '1 L', 235],
  ] as const) {
    await button(page, 'Ghee').click(); await button(page, brand).click();
    await button(page, `${size} · Rs ${price.toFixed(2)}`).click();
    await expect(page.locator('.items article').last()).toContainText(`1 × Rs ${price.toFixed(2)}`);
  }
  await expect(page.locator('.items article')).toHaveCount(10);
  await expect(page.getByTestId('total')).toHaveText('Rs 2,035.00');
});

test('mixed oil and ghee receipt uses numbered prices, rounds total and sends cut', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[] = [];
    Object.defineProperty(window, 'receiptOutput', { value: writes });
    const characteristic = { properties: { write: true }, writeValueWithResponse: async (bytes: Uint8Array) => { writes.push(...bytes); } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => ({ name: 'XP-80', addEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }) } }) } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click(); await button(page, 'Change Printer (BLE)').click();
  await expect(page.getByText('Selected: XP-80 · Connected')).toBeVisible(); await button(page, 'Done').click();
  await page.keyboard.type('1.25*'); await chooseOil(page, 'Mustard oil', 'Badye', '100 ml', 35);
  await chooseOil(page, 'Chameli oil', '', '200 ml', 140);
  await button(page, 'Ghee').click(); await button(page, 'Gavardhan ghee').click(); await button(page, '200 ml · Rs 150.00').click();
  await expect(page.getByTestId('total')).toHaveText('Rs 334.00');
  await page.getByRole('button', { name: 'Pay —' }).click(); await button(page, 'Cash 500').click();
  await expect(page.getByTestId('change')).toHaveText('Rs 166.00'); await button(page, 'Complete & Print').click();
  await expect(page.getByRole('status', { name: 'Counter message' })).toHaveText('Receipt sent to printer.');
  const bytes: number[] = await page.evaluate(() => Reflect.get(window, 'receiptOutput'));
  const receipt = new TextDecoder().decode(new Uint8Array(bytes));
  expect(receipt).toContain('1. 1.25 x 35.00'); expect(receipt).toContain('2. 1 x 140.00'); expect(receipt).toContain('3. 1 x 150.00');
  expect(receipt).toMatch(/Subtotal\s+Rs 333.75/); expect(receipt).toMatch(/Round up\s+Rs 0.25/); expect(receipt).toMatch(/TOTAL\s+Rs 334.00/);
  expect(receipt).not.toMatch(/oil|badye|mustard|chameli|ghee|gavardhan|100 ml|200 ml/i);
  expect(bytes.slice(-3)).toEqual([29, 86, 0]);
  await expect(page.getByTestId('change')).toHaveText('Rs 166.00');
});

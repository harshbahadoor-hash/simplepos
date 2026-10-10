import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('landscape presets sit beside the narrower sale without covering key controls', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  await page.goto('/');
  await page.addStyleTag({ content: 'body { font-size:20.8px }' });
  await page.evaluate(() => document.fonts.ready);
  const panel = page.getByRole('region', { name: 'Quick presets' });
  await expect(panel).toBeVisible();
  const sale = await page.getByRole('region', { name: 'Current sale' }).boundingBox();
  const presets = await panel.boundingBox();
  expect(presets!.x).toBeGreaterThanOrEqual(sale!.x + sale!.width);
  for (const name of ['Multiply', '+ Add Item', '7', '00', 'Pay — Rs 0.00']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('inline navigation protects double taps and uses decimal quantity without printing labels', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Quick presets' });
  await panel.getByRole('button', { name: 'Open preset Ghee', exact: true }).dblclick();
  await expect(page.locator('.items article')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Open preset Cow ghee', exact: true }).click();
  await page.keyboard.type('1.5*');
  await panel.getByRole('button', { name: 'Add preset 150 g · Rs 115.00', exact: true }).dblclick();
  await expect(page.locator('.items article')).toHaveCount(1);
  await expect(page.getByTestId('total')).toHaveText('Rs 173.00');
  await expect(page.locator('.items article')).toContainText('1.5 × Rs 115.00');
  await expect(page.locator('.items')).not.toContainText('ghee');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('output')).toBeFocused();
  await page.keyboard.type('25');
  await expect(panel.getByRole('button', { name: 'Add preset 150 g · Rs 115.00', exact: true })).toBeDisabled();
  await expect(page.locator('output')).toHaveText('25');
});

test('all five roots and direct named, size, and price-only choices work in the side panel', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  const document = JSON.parse(readFileSync('src/presets/defaults.json', 'utf8'));
  for (const [index, label] of ['Pooja items', 'Other', 'Extra'].entries()) document.roots.push({ key:`extra-${index}`,kind:'group',label,visible:true,children:[
    { key:`named-${index}`,kind:'item',label:'Incense sticks',visible:true,priceCents:3550 },
    { key:`size-${index}`,kind:'item',label:'100 ml',visible:true,priceCents:1550 },
    { key:`price-${index}`,kind:'item',label:'',visible:true,priceCents:2500 },
  ] });
  await page.route('**/preset-config/current', route => route.fulfill({ json:document }));
  await page.goto('/');
  await page.addStyleTag({ content:'body{font-size:20.8px}' });
  const panel = page.getByRole('region', { name:'Quick presets' });
  await panel.getByRole('button', { name:'Open preset Pooja items',exact:true }).click();
  await panel.getByRole('button', { name:'Add preset Incense sticks · Rs 35.50',exact:true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 36.00');
  await panel.getByRole('button', { name:'Add preset 100 ml · Rs 15.50',exact:true }).click();
  await panel.getByRole('button', { name:'Add preset Rs 25.00',exact:true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 76.00');
  await expect(page.locator('.items')).not.toContainText('Incense');
  const box = await page.getByRole('button', { name:'More presets',exact:true }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('incoming prices stay fixed while browsing and apply after returning to root', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  let document = JSON.parse(readFileSync('src/presets/defaults.json','utf8'));
  await page.route('**/preset-config/current', route => route.fulfill({json:document}));
  await page.goto('/');
  const panel = page.getByRole('region',{name:'Quick presets'});
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Cow ghee',exact:true}).click();
  document=structuredClone(document); document.revision=1;
  document.roots[0].children.find((node:{label:string})=>node.label==='Cow ghee').children[0].priceCents=12000;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('simplePosPresetCacheV1')||'{}').revision)).toBe(1);
  await expect(panel.getByRole('button',{name:'Add preset 150 g · Rs 115.00',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'All presets',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Cow ghee',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Add preset 150 g · Rs 120.00',exact:true})).toBeVisible();
});

test('double tapping delete cannot remove the next item that moves into its place', async ({ page }) => {
  await page.goto('/');
  for(const price of ['10','15','20']) { await page.keyboard.type(price); await page.keyboard.press('Enter'); }
  await page.getByRole('button',{name:'Delete Item 1',exact:true}).dblclick();
  await expect(page.locator('.items article')).toHaveCount(2);
  await expect(page.getByTestId('total')).toHaveText('Rs 35.00');
  await page.getByRole('button',{name:'Undo removal',exact:true}).click();
  await expect(page.locator('.items article')).toHaveCount(3);
  await expect(page.getByTestId('total')).toHaveText('Rs 45.00');
});

test('returning to landscape restores the freeze for a still-open price menu', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  let document = JSON.parse(readFileSync('src/presets/defaults.json','utf8'));
  await page.route('**/preset-config/current', route => route.fulfill({json:document}));
  await page.goto('/');
  const panel=page.getByRole('region',{name:'Quick presets'});
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Cow ghee',exact:true}).click();
  await page.setViewportSize({width:800,height:1000});
  await expect(panel).toBeHidden();
  await page.setViewportSize({width:1280,height:722});
  await expect(panel.getByRole('button',{name:'Add preset 150 g · Rs 115.00',exact:true})).toBeVisible();
  document=structuredClone(document); document.revision=1;
  document.roots[0].children.find((node:{label:string})=>node.label==='Cow ghee').children[0].priceCents=12000;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('simplePosPresetCacheV1')||'{}').revision)).toBe(1);
  await expect(panel.getByRole('button',{name:'Add preset 150 g · Rs 115.00',exact:true})).toBeVisible();
});

test('Pay, Back, and deleting the last item releases an empty counter for new prices', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  let document=JSON.parse(readFileSync('src/presets/defaults.json','utf8'));
  await page.route('**/preset-config/current',route=>route.fulfill({json:document}));
  await page.goto('/');
  const panel=page.getByRole('region',{name:'Quick presets'});
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Cow ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Add preset 150 g · Rs 115.00',exact:true}).click();
  document=structuredClone(document); document.revision=1;
  document.roots[0].children.find((node:{label:string})=>node.label==='Cow ghee').children[0].priceCents=12000;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('simplePosPresetCacheV1')||'{}').revision)).toBe(1);
  await page.getByRole('button',{name:'Pay — Rs 115.00',exact:true}).click();
  await page.getByRole('button',{name:'Back to sale',exact:true}).click();
  await page.getByRole('button',{name:'Delete Item 1',exact:true}).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 0.00');
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Cow ghee',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Add preset 150 g · Rs 120.00',exact:true})).toBeVisible();
});

test('intentional fast taps into first groups and first prices are not mistaken for double taps', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  await page.goto('/');
  const panel=page.getByRole('region',{name:'Quick presets'});
  await panel.getByRole('button',{name:'Open preset Ghee',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Gopal ghee',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Add preset 150 ml · Rs 130.00',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Add preset 150 ml · Rs 130.00',exact:true}).click();
  await panel.getByRole('button',{name:'All presets',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Oil',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Coconut oil',exact:true}).click();
  await panel.getByRole('button',{name:'Open preset Badaye',exact:true}).click();
  await panel.getByRole('button',{name:'Add preset 100 ml · Rs 40.00',exact:true}).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 170.00');
});

test('long group labels and price-only choices keep deliberate fast taps distinct', async ({ page }) => {
  test.skip(test.info().project.name === 'phone-portrait', 'Portrait uses the dialog picker.');
  const document=JSON.parse(readFileSync('src/presets/defaults.json','utf8'));
  const label='Long preset category name Long preset category name';
  document.roots=[{key:'long-group',kind:'group',label,visible:true,children:[
    {key:'blank-price',kind:'item',label:'',visible:true,priceCents:2500},
  ]}];
  await page.route('**/preset-config/current',route=>route.fulfill({json:document}));
  await page.goto('/');
  await page.addStyleTag({content:'body{font-size:20.8px}'});
  await page.evaluate(()=>document.fonts.ready);
  const panel=page.getByRole('region',{name:'Quick presets'});
  await panel.getByRole('button',{name:`Open preset ${label}`,exact:true}).click();
  await panel.getByRole('button',{name:'Add preset Rs 25.00',exact:true}).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 25.00');
});

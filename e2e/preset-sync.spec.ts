import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('another device publishes prices without changing an active sale', async ({ browser, page }) => {
  let shared=JSON.parse(readFileSync('src/presets/defaults.json','utf8'));
  const tabletContext=await browser.newContext({viewport:{width:1280,height:722},serviceWorkers:'block'});
  const tablet=await tabletContext.newPage();
  for (const current of [page,tablet]) await current.route('**/preset-config/**',async route=>{
    if(route.request().method()==='POST') {
      if(route.request().headers()['if-match']!==`"${shared.revision}"`) return route.fulfill({status:412,json:{error:'Presets changed elsewhere.',current:shared}});
      shared={...route.request().postDataJSON().document,revision:shared.revision+1}; return route.fulfill({json:shared});
    }
    return route.fulfill({json:shared});
  });
  try {
    await tablet.goto('http://127.0.0.1:4317/');
    await tablet.getByRole('button',{name:'Ghee',exact:true}).click(); await tablet.getByRole('button',{name:'Cow ghee',exact:true}).click();
    await tablet.getByRole('button',{name:'150 g · Rs 115.00',exact:true}).click();
    await expect(tablet.getByTestId('total')).toHaveText('Rs 115.00');
    await page.goto('/');
    const next=structuredClone(shared); next.roots[0].children.find((n:{label:string})=>n.label==='Cow ghee').children[0].priceCents=12000;
    await page.evaluate(async document=>{ const response=await fetch('/preset-config/publish',{method:'POST',headers:{'Content-Type':'application/json','If-Match':'"0"','Idempotency-Key':'test-sync'},body:JSON.stringify({document})}); if(!response.ok) throw Error('Publication failed'); },next);
    await tablet.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await tablet.getByRole('button',{name:/Settings/}).click();
    await expect(tablet.getByText('New preset prices will apply after this sale.')).toBeVisible();
    await tablet.getByRole('button',{name:'Done',exact:true}).click();
    await expect(tablet.getByTestId('total')).toHaveText('Rs 115.00');
    await tablet.getByRole('button',{name:'Pay —'}).click(); await tablet.getByRole('button',{name:'Exact',exact:true}).click();
    await tablet.getByRole('button',{name:'Complete Without Printing',exact:true}).click();
    await expect(tablet.getByTestId('change')).toHaveText('Rs 0.00');
    await tablet.getByRole('button',{name:'New Sale',exact:true}).click();
    await tablet.getByRole('button',{name:'Ghee',exact:true}).click(); await tablet.getByRole('button',{name:'Cow ghee',exact:true}).click();
    await tablet.getByRole('button',{name:'150 g · Rs 120.00',exact:true}).click();
    await expect(tablet.getByTestId('total')).toHaveText('Rs 120.00');
  } finally { await tabletContext.close(); }
});

test('malformed remote presets leave baseline usable and do not block no-print payment',async({page})=>{
  await page.route('**/preset-config/**',route=>route.fulfill({body:'<html>Error</html>'}));
  await page.goto('/'); await page.getByRole('button',{name:'Ghee',exact:true}).click(); await page.getByRole('button',{name:'Cow ghee',exact:true}).click();
  await page.getByRole('button',{name:'150 g · Rs 115.00',exact:true}).click();
  await page.getByRole('button',{name:'Pay —'}).click(); await page.getByRole('button',{name:'Exact',exact:true}).click();
  await page.getByRole('button',{name:'Complete Without Printing',exact:true}).click();
  await expect(page.getByTestId('change')).toHaveText('Rs 0.00');
  await expect(page.getByRole('status',{name:'Counter message'})).toHaveText('Sale complete without printing.');
});

test('a slow earlier poll cannot replace a newly published price', async ({ page }) => {
  let shared = JSON.parse(readFileSync('src/presets/defaults.json', 'utf8'));
  let delay = false;
  let started = false;
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/preset-config/**', async route => {
    if (route.request().method() === 'POST') {
      shared = { ...route.request().postDataJSON().document, revision: shared.revision + 1 };
      return route.fulfill({ json: shared });
    }
    const snapshot = structuredClone(shared);
    if (delay) { started = true; await held; }
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Manage presets', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Manage presets' });
  await panel.getByRole('button', { name: 'Open Ghee', exact: true }).click();
  await panel.getByRole('button', { name: 'Open Cow ghee', exact: true }).click();
  await panel.getByRole('button', { name: 'Edit 150 g', exact: true }).click();
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('120');
  await panel.getByRole('button', { name: 'Save to draft', exact: true }).click();
  await panel.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.waitForTimeout(550); // Publishing follows a deliberate review gesture.
  delay = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => started).toBe(true);
  await panel.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Published revision 1');
  const response = page.waitForResponse(response => response.url().endsWith('/current'));
  release();
  await response;
  await panel.getByRole('button', { name: 'Close manager', exact: true }).click();
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Cow ghee', exact: true }).click();
  await page.getByRole('button', { name: '150 g · Rs 120.00', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 120.00');
});

test('a delayed publication reply cannot replace a newer revision discovered by polling', async ({ page }) => {
  let shared = JSON.parse(readFileSync('src/presets/defaults.json', 'utf8'));
  let committed = false;
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/preset-config/**', async route => {
    if (route.request().method() === 'POST') {
      shared = { ...route.request().postDataJSON().document, revision: 1 };
      const reply = structuredClone(shared);
      committed = true;
      await held;
      return route.fulfill({ json: reply });
    }
    if (route.request().url().includes('/publications/')) return route.fulfill({status:404,json:{error:'Not found'}});
    return route.fulfill({ json: shared });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Manage presets', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Manage presets' });
  await panel.getByRole('button', { name: 'Open Ghee', exact: true }).click();
  await panel.getByRole('button', { name: 'Open Cow ghee', exact: true }).click();
  await panel.getByRole('button', { name: 'Edit 150 g', exact: true }).click();
  await panel.getByLabel('Price (Rs)', { exact: true }).fill('120');
  await panel.getByRole('button', { name: 'Save to draft', exact: true }).click();
  await panel.getByRole('button', { name: 'Review changes', exact: true }).click();
  // Publishing is a distinct gesture after reviewing.
  await page.waitForTimeout(550);
  await panel.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await expect.poll(() => committed).toBe(true);
  shared = structuredClone(shared);
  shared.revision = 2;
  shared.roots[0].children.find((node: { label: string }) => node.label === 'Cow ghee').children[0].priceCents = 13000;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('simplePosPresetCacheV1') || '{}').revision)).toBe(2);
  release();
  await expect(panel.getByRole('status')).toContainText('Published revision 2');
  await panel.getByRole('button', { name: 'Close manager', exact: true }).click();
  await page.getByRole('button', { name: 'Ghee', exact: true }).click();
  await page.getByRole('button', { name: 'Cow ghee', exact: true }).click();
  await page.getByRole('button', { name: '150 g · Rs 130.00', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('Rs 130.00');
});

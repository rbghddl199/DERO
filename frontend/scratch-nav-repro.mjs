import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

async function state() {
  return page.evaluate(() => ({
    hasLoading: !!document.querySelector('[data-testid="screen-loading"]'),
    hasSelect: !!document.querySelector('[data-testid="screen-select"]'),
    hasSim: !!document.querySelector('[data-testid="screen-sim"]'),
    ready: window.__sim?.ready,
  }));
}

// 1) First entry via client-side navigation from home (not a hard reload)
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await page.getByRole('link', { name: '작업실 바로가기' }).click();
console.log('immediately after first client-side nav to /simulator:', JSON.stringify(await state()));
await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30000 });
console.log('after ready (first visit):', JSON.stringify(await state()));

// enter the sim screen so screen !== 'select' when we leave
await page.getByTestId(/desk-card-(?!custom)/).first().click().catch(async () => {
  await page.locator('.desk-card').first().click();
});
await page.waitForTimeout(500);
console.log('after picking a desk (screen should be sim):', JSON.stringify(await state()));

await page.evaluate(() => {
  const app = document.querySelector('#app');
  if (app) app.dataset.marker = 'visit1';
  window.__visit1CanvasCount = document.querySelectorAll('canvas').length;
});

// 2) Leave via the exit button (client-side router.back()), then re-enter via Link again
await page.getByTestId('exit-simulator').click();
await page.waitForTimeout(500);
console.log('after clicking exit (back at home):', page.url());

await page.getByRole('link', { name: '작업실 바로가기' }).click();
console.log('immediately after SECOND client-side nav to /simulator:', JSON.stringify(await state()));
await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30000 });
console.log('after ready (second visit):', JSON.stringify(await state()));

const marker = await page.evaluate(() => ({
  appMarker: document.querySelector('#app')?.dataset.marker ?? null,
  canvasCount: document.querySelectorAll('canvas').length,
  visit1CanvasCount: window.__visit1CanvasCount,
  uiRootHTML: document.querySelector('.ui-root')?.outerHTML?.slice(0, 300) ?? null,
}));
console.log('reuse check:', JSON.stringify(marker, null, 2));

await browser.close();

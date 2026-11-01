/**
 * Regression: the browser bundle must take its UI language from the Host locale
 * service, not from the <html lang="en"> the Host serves while its locale is
 * still resolving. The delayed native bridge reproduces a cold desktop start;
 * before the fix the sidebar entry and the panel title stayed English
 * even though the Host had switched the document to zh-CN.
 *
 * Needs the desktop host running and the DSH auth cookie available, like
 * test/ui-flow.cjs.
 */
const { execSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (_error) {}
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

const { chromium } = loadPlaywright();

(async () => {
  const guiUrl = process.env.DSH_GUI_URL || 'http://127.0.0.1:50251';
  const cookieDb = JSON.stringify(process.env.HOME + '/Library/Application Support/@deepseek-ai/dsh-desktop/Cookies');
  const cookieName =
    process.env.DSH_AUTH_COOKIE ||
    execSync(
      'sqlite3 ' +
        cookieDb +
        ' "select name from cookies where name like \'dsh-auth-%\' order by creation_utc desc limit 1"',
    )
      .toString()
      .trim();
  if (!cookieName) throw new Error('No DSH auth cookie found; set DSH_AUTH_COOKIE.');
  const cookieValue = execSync('sqlite3 ' + cookieDb + ' "select value from cookies where name=\'' + cookieName + '\'"')
    .toString()
    .trim();
  const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  await context.addCookies([
    { name: cookieName, value: cookieValue, url: guiUrl + '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 500));
  });
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 500)));

  // A cold desktop start: the native locale read resolves well after the client
  // plugin bundle has loaded.
  await page.addInitScript(() => {
    window.__DSH_LOCALE__ = {
      read: () => new Promise((resolve) => setTimeout(() => resolve({ languages: ['zh-CN'], preference: 'zh' }), 1200)),
      onChange: () => {},
    };
  });

  await page.goto(guiUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DSH_BOOT__), null, { timeout: 20000 });
  await page.waitForTimeout(4000);

  const entry = page.locator('button[aria-label="上帝视角"], button[aria-label*="God"]').first();
  assert.equal(await entry.count(), 1, 'sidebar entry is present');
  const entryLabel = await entry.getAttribute('aria-label');
  assert.equal(entryLabel, '上帝视角', 'sidebar entry follows the Host locale');

  await entry.click();
  await page.waitForTimeout(1200);
  const railLabel = await page.locator('.pt-side').first().getAttribute('aria-label');
  assert.equal(railLabel, '活跃项目', 'panel follows the Host locale');
  const switchLabel = await page.locator('.pt-root [role="switch"]').first().getAttribute('aria-label');
  assert.equal(switchLabel, '协作开关', 'the switch is labelled in the Host locale');

  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  assert.equal(htmlLang, 'zh-CN', 'host document language settled on Chinese');

  assert.deepEqual(errors, [], 'no console or page errors');
  console.log('ENTRY', entryLabel);
  console.log('PANEL', railLabel, switchLabel);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch((error) => {
  console.error('FAIL', error);
  process.exit(1);
});

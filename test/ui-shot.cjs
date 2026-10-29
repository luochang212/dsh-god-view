const { execSync } = require('node:child_process');
const path = require('node:path');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (_error) {}
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

const { chromium } = loadPlaywright();
const fs = require('node:fs');

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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([
    { name: cookieName, value: cookieValue, url: guiUrl + '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 500));
  });
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 500)));
  await page.goto(guiUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DSH_BOOT__), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  const cont = page.getByRole('button', { name: '继续' });
  if (await cont.count()) {
    await cont.first().click();
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="协作台"]').first().click();
  await page.waitForTimeout(1500);
  const target = page.locator('.pt-project', { hasText: 'dsh-parallel' }).first();
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(900);
  }
  fs.mkdirSync('screenshots/local', { recursive: true });
  await page.screenshot({ path: 'screenshots/local/01-panel.png', fullPage: false });
  console.log('TEXT', (await page.locator('.pt-root').innerText()).slice(0, 1800));
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/local/03-dark.png', fullPage: false });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

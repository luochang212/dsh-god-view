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
        ' "select name from cookies where name like \'dsh-auth-%\' order by expires_utc desc limit 1"',
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
    { name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' },
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

  const controls = await page.locator('.pt-root input, .pt-root select, .pt-root textarea').count();
  const text = await page.locator('.pt-root').innerText();
  console.log('CONTROLS', controls);
  console.log('HAS_PROJECTS', text.includes('最近活跃项目'));
  console.log('HAS_TIMELINE', text.includes('占用甘特图'));
  console.log('HAS_SESSION', text.includes('session'));
  console.log('TEXT >>>');
  console.log(text.slice(0, 2400));
  console.log('<<< TEXT');
  if (controls !== 0) throw new Error('read-only panel must not contain inputs/selects/textareas');
  if (!text.includes('最近活跃项目') || !text.includes('占用甘特图')) throw new Error('projects/gantt section missing');

  await page.screenshot({ path: 'screenshots/local/01-panel.png', fullPage: false });
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/local/03-dark.png', fullPage: false });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

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
  await page.locator('button[aria-label="上帝视角"]').first().click();
  await page.waitForTimeout(1500);
  // The board is named after the repository directory, which need not match the package name.
  const target = page.locator('.pt-project', { hasText: path.basename(process.cwd()) }).first();
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(900);
  }
  fs.mkdirSync('screenshots/local', { recursive: true });

  const controls = await page.locator('.pt-root input, .pt-root select, .pt-root textarea').count();
  const switches = page.locator('.pt-root [role="switch"]');
  const switchCount = await switches.count();
  const text = await page.locator('.pt-root').innerText();
  const hasActiveRows = (await page.locator('.pt-project').count()) > 0;
  console.log('CONTROLS', controls);
  console.log('SWITCHES', switchCount);
  console.log('HAS_PROJECTS', text.includes('活跃项目'));
  console.log('HAS_TIMELINE', text.includes('占用甘特图'));
  console.log('ACTIVE_ROWS', hasActiveRows);
  console.log('HAS_WORKING', text.includes('进行中'));
  console.log('HAS_SESSION', text.includes('session'));
  console.log('TEXT >>>');
  console.log(text.slice(0, 2400));
  console.log('<<< TEXT');
  if (controls !== 0) throw new Error('the read-only panel must not contain inputs/selects/textareas');
  if (switchCount !== 1) throw new Error('the panel must expose exactly one coordination switch');
  if (!text.includes('活跃项目')) throw new Error('project rail caption missing');
  if (hasActiveRows && !text.includes('占用甘特图')) throw new Error('gantt section missing for an active project');

  // The switch is the only control, and it must actually flip and come back.
  const switchState = await switches.first().getAttribute('data-coordination');
  console.log('SWITCH_STATE', switchState);
  if (switchState === 'unavailable') {
    // The refreshed client is newer than the running host process.
    console.log('SWITCH_FLIP_SKIPPED', 'restart the host to load /coordination');
  } else {
    // The control is a slider: its position, not its text, carries the state.
    const switchValue = async () => await switches.first().getAttribute('aria-checked');
    const before = await switchValue();
    await switches.first().click();
    await page.waitForTimeout(1400);
    const after = await switchValue();
    await switches.first().click();
    await page.waitForTimeout(1400);
    const restored = await switchValue();
    console.log('SWITCH_BEFORE', before);
    console.log('SWITCH_AFTER', after);
    console.log('SWITCH_RESTORED', restored);
    if (before === after) throw new Error('the coordination switch did not change state');
    if (restored !== before) throw new Error('the coordination switch did not return to its original state');
  }

  const layout = await page.evaluate(() => {
    const root = document.querySelector('.pt-root');
    const side = document.querySelector('.pt-side');
    const foot = document.querySelector('.pt-side-foot');
    const topbar = document.querySelector('.pt-topbar');
    const content = document.querySelector('.pt-content');
    if (!root || !side || !foot || !topbar || !content) return null;
    const before = foot.getBoundingClientRect().bottom - side.getBoundingClientRect().bottom;
    content.scrollTop = content.scrollHeight;
    const after = foot.getBoundingClientRect().bottom - side.getBoundingClientRect().bottom;
    const contentScrolls = content.scrollHeight > content.clientHeight;
    content.scrollTop = 0;
    const railFullHeight = Math.abs(side.getBoundingClientRect().height - root.getBoundingClientRect().height) <= 1;
    return {
      grounded: Math.abs(before) <= 1 && Math.abs(after) <= 1,
      contentScrolls,
      railFullHeight,
      topbarHeight: Math.round(topbar.getBoundingClientRect().height),
      railWidth: Math.round(side.getBoundingClientRect().width),
    };
  });
  console.log('SIDEBAR_GROUNDED', Boolean(layout && layout.grounded));
  console.log('RAIL_FULL_HEIGHT', Boolean(layout && layout.railFullHeight));
  console.log('CONTENT_SCROLLS', Boolean(layout && layout.contentScrolls));
  console.log('RAIL_WIDTH', layout && layout.railWidth);
  console.log('TOPBAR_HEIGHT', layout && layout.topbarHeight);
  if (!layout || !layout.grounded)
    throw new Error('sidebar footer must stay at the rail bottom while the detail pane scrolls');
  if (!layout.railFullHeight) throw new Error('the project rail must reach the bottom of the panel');
  if (layout.topbarHeight !== 56) throw new Error('the topbar must render at 56px');
  if (layout.railWidth !== 264) throw new Error('the project rail must render at 264px');

  // The rail lives on the right, next to the host's own left sidebar.
  const sides = await page.evaluate(() => {
    const main = document.querySelector('.pt-main');
    const side = document.querySelector('.pt-side');
    if (!main || !side) return null;
    return {
      sideLeft: Math.round(side.getBoundingClientRect().left),
      mainRight: Math.round(main.getBoundingClientRect().right),
      toggles: document.querySelectorAll('.pt-iconbtn').length,
    };
  });
  console.log('RAIL_ON_RIGHT', Boolean(sides && sides.sideLeft >= sides.mainRight - 1));
  console.log('RAIL_TOGGLE', sides && sides.toggles);
  if (!sides || sides.sideLeft < sides.mainRight - 1) throw new Error('the rail must sit on the right side');
  if (sides.toggles !== 1) throw new Error('the topbar must carry exactly one rail toggle');

  // Collapsing goes to zero, and the toggle restores it.
  const toggle = page.locator('.pt-iconbtn').first();
  const railBefore = await page.locator('.pt-side').count();
  await toggle.click();
  await page.waitForTimeout(400);
  const railHidden = await page.locator('.pt-side').count();
  const expanded = await toggle.getAttribute('aria-expanded');
  await toggle.click();
  await page.waitForTimeout(400);
  const railBack = await page.locator('.pt-side').count();
  console.log('RAIL_COLLAPSE', railBefore, railHidden, railBack, expanded);
  if (railBefore !== 1 || railHidden !== 0 || railBack !== 1)
    throw new Error('the rail must collapse to zero and restore');
  if (expanded !== 'false') throw new Error('the toggle must report the collapsed state');

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

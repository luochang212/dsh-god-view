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
  console.log('HAS_PROJECTS', hasActiveRows);
  console.log('HAS_TIMELINE', text.includes('占用甘特图'));
  console.log('ACTIVE_ROWS', hasActiveRows);
  console.log('HAS_WORKING', text.includes('进行中'));
  console.log('HAS_SESSION', text.includes('session'));
  console.log('TEXT >>>');
  console.log(text.slice(0, 2400));
  console.log('<<< TEXT');
  if (controls !== 0) throw new Error('the read-only panel must not contain inputs/selects/textareas');
  if (switchCount !== 1) throw new Error('the panel must expose exactly one coordination switch');
  if (!hasActiveRows) throw new Error('the rail rendered no project rows');
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
    const topbar = document.querySelector('.pt-topbar');
    const content = document.querySelector('.pt-content');
    if (!root || !side || !topbar || !content) return null;
    content.scrollTop = content.scrollHeight;
    const contentScrolls = content.scrollHeight > content.clientHeight;
    content.scrollTop = 0;
    const railFullHeight = Math.abs(side.getBoundingClientRect().height - root.getBoundingClientRect().height) <= 1;
    const children = Array.from(side.children);
    const toggle = document.querySelector('.pt-rail-toggle');
    const firstRow = side.querySelector('.pt-project');
    const railTopGap =
      toggle && firstRow
        ? Math.round(firstRow.getBoundingClientRect().top - toggle.getBoundingClientRect().bottom)
        : null;
    return {
      contentScrolls,
      railFullHeight,
      railTopGap,
      chrome: document.querySelectorAll('.pt-side-head, .pt-side-foot, .pt-side-count').length,
      railChildren: children.length,
      railChildClass: children.length === 1 ? String(children[0].className) : '',
      topbarHeight: Math.round(topbar.getBoundingClientRect().height),
      railWidth: Math.round(side.getBoundingClientRect().width),
    };
  });
  console.log('RAIL_CHROME', layout && layout.chrome);
  console.log('RAIL_CHILDREN', layout && layout.railChildren, layout && layout.railChildClass);
  console.log('RAIL_FULL_HEIGHT', Boolean(layout && layout.railFullHeight));
  console.log('RAIL_TOP_GAP', layout && layout.railTopGap);
  console.log('CONTENT_SCROLLS', Boolean(layout && layout.contentScrolls));
  console.log('RAIL_WIDTH', layout && layout.railWidth);
  console.log('TOPBAR_HEIGHT', layout && layout.topbarHeight);
  if (!layout) throw new Error('panel layout did not render');
  if (layout.chrome !== 0) throw new Error('the rail must carry no header, count or footer');
  if (layout.railChildren !== 1 || !layout.railChildClass.includes('pt-projects'))
    throw new Error('the rail must contain only the project list');
  if (!layout.railFullHeight) throw new Error('the project rail must reach the bottom of the panel');
  if (layout.railTopGap === null || layout.railTopGap < 12)
    throw new Error('the first project row must clear the pinned rail toggle');
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
      toggles: document.querySelectorAll('.pt-rail-toggle').length,
    };
  });
  console.log('RAIL_ON_RIGHT', Boolean(sides && sides.sideLeft >= sides.mainRight - 1));
  console.log('RAIL_TOGGLE', sides && sides.toggles);
  if (!sides || sides.sideLeft < sides.mainRight - 1) throw new Error('the rail must sit on the right side');
  if (sides.toggles !== 1) throw new Error('the panel must carry exactly one pinned rail toggle');

  // The toggle is pinned: collapsing must not move it, so the same spot reopens.
  const toggle = page.locator('.pt-rail-toggle').first();
  const openBox = await toggle.boundingBox();
  await toggle.click();
  await page.waitForTimeout(400);
  const closedBox = await toggle.boundingBox();
  const expanded = await toggle.getAttribute('aria-expanded');
  const railHidden = await page.locator('.pt-side').count();
  console.log('TOGGLE_PINNED', JSON.stringify(openBox), JSON.stringify(closedBox));
  console.log('RAIL_COLLAPSE', railHidden, expanded);
  if (!openBox || !closedBox) throw new Error('rail toggle is not visible');
  if (Math.abs(openBox.x - closedBox.x) > 1 || Math.abs(openBox.y - closedBox.y) > 1)
    throw new Error('the rail toggle must stay in place when the rail collapses');
  if (railHidden !== 0) throw new Error('the rail must collapse to zero');
  if (expanded !== 'false') throw new Error('the toggle must report the collapsed state');
  await toggle.click();
  await page.waitForTimeout(400);
  const railBack = await page.locator('.pt-side').count();
  if (railBack !== 1) throw new Error('the toggle must reopen the rail from the same spot');

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

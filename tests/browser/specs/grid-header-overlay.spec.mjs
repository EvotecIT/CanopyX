import { test, expect } from "@playwright/test";
import { viewPage, openGridControl } from "./support.mjs";
import path from "node:path";

const columns = Array.from({ length: 12 }, (_, index) => ({ id: "c" + index, title: "Port " + index,
  kind: "text", priority: "essential", sortable: true, ...(index === 0 ? { rowHeader: true } : {}) }));
const makeView = (overflow = false, menus = true) => ({ protocol: "canopyx/2", type: "grid", id: "overlay", label: "Ports",
  density: "compact", selection: "single", rowHeight: 32, pageSize: 100, source: { kind: "inline" },
  toolbar: { columnMenus: menus }, columns: columns.map(column => ({ ...column, ...(overflow ? { width: 180, fixed: true } : {}) })),
  rows: Array.from({ length: 7 }, (_, row) => ({ id: "r" + row,
    cells: Object.fromEntries(columns.map(column => [column.id, "123456789"])) })) });

async function open(page, { overflow = false, menus = true, dark = false, definition } = {}) {
  let html = viewPage(definition || makeView(overflow, menus)).replace('</head>', '<style>body.cx-page>[data-canopyx-host]{width:min(1100px,100%);height:420px}</style></head>');
  if (dark) html = html.replace('data-cx-theme="light"', 'data-cx-theme="dark"');
  await page.route("http://canopyx.test/overlay", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/overlay");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('.cx-grid').getAttribute('aria-busy') === 'false');
}
const header = (page, id = "c1") => page.locator(`.cx-hcell[data-cx-column="${id}"]`);
const button = (page, id = "c1") => header(page, id).locator('.cx-grid-column-menu');
const geometry = page => page.locator('.cx-grid').evaluate(grid => ({ width: grid.clientWidth, scroll: grid.scrollWidth,
  columns: [...grid.querySelectorAll('.cx-hcell')].map(cell => cell.getBoundingClientRect().width) }));

test('header-row hover reveals every menu faintly without changing the twelve-column fit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const definition = makeView();
  definition.rows.forEach(row => Object.keys(row.cells).forEach(id => row.cells[id] = '1'));
  definition.toolbar.columnMenus = false;
  await open(page, { definition }); const baseline = await geometry(page);
  definition.toolbar.columnMenus = true;
  await open(page, { definition });
  expect(await geometry(page)).toEqual(baseline);
  expect(baseline.columns).toHaveLength(12);
  expect(baseline.scroll).toBeLessThanOrEqual(baseline.width);
  await header(page, 'c0').hover();
  await expect(button(page, 'c0')).toHaveCSS('opacity', '1');
  await expect(button(page, 'c1')).toHaveCSS('opacity', '0.4');
  await expect(button(page, 'c11')).toHaveCSS('opacity', '0.4');
  const span = await header(page, 'c0').locator('.cx-htext').boundingBox();
  expect(span.width, 'the fade belongs to the header edge, not the intrinsic caption width').toBeGreaterThan(baseline.columns[0] - 25);
  expect(await header(page, 'c1').locator('.cx-htext').evaluate(text => getComputedStyle(text).maskImage)).toContain('linear-gradient');
  expect(await geometry(page)).toEqual(baseline);
  await page.mouse.move(0, 0);
  await expect(button(page, 'c1')).toHaveCSS('opacity', '0');
  await expect(header(page, 'c1').locator('.cx-htext')).toHaveCSS('mask-image', 'none');
});

test('touch long-press opens actions without sorting and a moved press stays a scroll gesture', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright does not emulate touch contexts in Firefox');
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(); await open(page);
    const sort = header(page, 'c0').locator('.cx-sort');
    let cdp;
    if (browserName === 'chromium') {
      cdp = await context.newCDPSession(page);
      const box = await sort.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 12, y: box.y + box.height / 2 }] });
    } else await sort.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: 30, clientY: 100 });
    await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeVisible();
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else {
      await sort.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch' });
      expect(await sort.evaluate(el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))).toBe(false);
      await sort.dispatchEvent('click');
    }
    await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeFocused();
    await expect(header(page, 'c0')).not.toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Escape');
    // Native context-menu gestures may cancel the pointer without sending a compatibility click.
    await sort.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0 });
    await sort.dispatchEvent('contextmenu');
    await sort.dispatchEvent('pointercancel', { pointerId: 11, pointerType: 'touch' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await sort.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', isPrimary: true, button: 0, clientX: 30, clientY: 100 });
    await sort.dispatchEvent('pointermove', { pointerId: 8, pointerType: 'touch', clientX: 55, clientY: 100 });
    await page.waitForTimeout(650);
    await sort.dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await header(page, 'c0').tap({ position: { x: 8, y: 2 } });
    await expect(button(page, 'c0')).toHaveCSS('opacity', '1');
    await button(page, 'c0').tap();
    await page.getByRole('menuitem', { name: 'Sort ascending', exact: true }).tap();
    await expect(header(page, 'c0')).toHaveAttribute('aria-sort', 'ascending');
    await sort.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0 });
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnVisible('c11', false));
    await page.waitForTimeout(650);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await sort.dispatchEvent('pointerdown', { pointerId: 10, pointerType: 'touch', isPrimary: true, button: 0 });
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.destroy());
    await page.waitForTimeout(650);
    await expect(page.getByRole('menu')).toHaveCount(0);
  } finally { await context.close(); }
});

test('active numeric headers keep indicators and a trailing menu visible without reserving caption width', async ({ page }) => {
  const definition = makeView();
  Object.assign(definition.columns[1], { title: 'Size', kind: 'number' });
  definition.rows.forEach(row => row.cells.c1 = 4999);
  await open(page, { definition });
  for (const query of [{ sort: [{ column: 'c1', direction: 'asc' }] },
    { filters: [{ column: 'c1', operator: 'eq', values: [4999] }] },
    { sort: [{ column: 'c1', direction: 'asc' }, { column: 'c2', direction: 'desc' }], filters: [{ column: 'c1', operator: 'eq', values: [4999] }] }]) {
    await page.evaluate(query => document.querySelector('[data-canopyx-host]').canopyx.setQuery(query), query);
    await expect(button(page)).toHaveCSS('opacity', '1');
    const layout = await header(page).evaluate(cell => {
      const menu = cell.querySelector('.cx-grid-column-menu').getBoundingClientRect();
      const text = cell.querySelector('.cx-htext'), style = getComputedStyle(cell);
      const filter = cell.querySelector('.cx-grid-header-filter');
      const priority = cell.querySelector('.cx-sort-priority');
      return { edge: cell.getBoundingClientRect().right - menu.right, padding: style.paddingInlineEnd,
        fade: getComputedStyle(text).maskImage, clipped: text.scrollWidth > text.clientWidth + 1,
        filterClear: filter.hidden || filter.getBoundingClientRect().right <= menu.left,
        sort: getComputedStyle(cell.querySelector('.cx-sort'), '::after').content,
        sortOrder: getComputedStyle(cell.querySelector('.cx-sort'), '::after').order,
        priorityClear: !priority || priority.getBoundingClientRect().right <= menu.left };
    });
    expect(layout.edge).toBeLessThanOrEqual(5); expect(layout.edge).toBeGreaterThanOrEqual(4);
    expect(layout.padding).toBe('8px'); expect(layout.fade).toContain('linear-gradient');
    expect(layout.clipped).toBe(false); expect(layout.filterClear).toBe(true);
    expect(layout.priorityClear, 'multi-sort priority must remain clear of the trailing menu').toBe(true);
    if (query.sort) { expect(layout.sort).toContain('↑'); expect(layout.sortOrder).toBe('-2'); }
  }
});

test('twelve columns fit at 1440 and overlaid menus stay accessible without adding body chrome', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { menus: false });
  const baseline = await geometry(page);
  await open(page);
  await expect.poll(async () => (await geometry(page)).scroll).toBeLessThanOrEqual(baseline.width);
  expect((await geometry(page)).columns).toHaveLength(baseline.columns.length);
  await expect(button(page)).toHaveCSS('position', 'absolute');
  await expect(button(page)).toHaveCSS('opacity', '0');
  await header(page).hover(); await expect(button(page)).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await button(page).focus(); await expect(button(page)).toHaveCSS('opacity', '1');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(header(page)).toHaveAttribute('aria-sort', 'ascending');
  await page.locator('.cx-grid').focus();
  await expect(button(page)).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ filters: [{ column: 'c2', operator: 'eq', values: ['123456789'] }] }));
  await expect(button(page, 'c2')).toHaveAttribute('data-cx-filtered', 'true');
  await expect(button(page, 'c2')).toHaveCSS('opacity', '1');
});

test('header context and keyboard menus and the Columns panel reach the same column actions', async ({ page }) => {
  await open(page);
  await header(page).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(button(page)).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Pin left', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await header(page).locator('.cx-sort').focus();
  await expect(button(page)).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(header(page)).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('ContextMenu');
  await expect(page.getByRole('menuitem', { name: 'Sort descending', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnVisible('c3', false));
  await openGridControl(page, 'columns');
  await page.locator('.cx-grid-column-choice[data-cx-column="c3"]').getByRole('button', { name: 'Menu for Port 3', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Filter…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Port 3: Filter…' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Port 3: Filter…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cx-grid')).toBeFocused();
});

for (const dark of [false, true]) test(`pinned cells are opaque and show an edge only under scrolling in ${dark ? 'dark' : 'light'}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { dark });
  const cell = page.locator('.cx-cell[data-cx-pin="left"]').first();
  await expect(cell).not.toHaveCSS('position', 'sticky');
  await expect(cell).toHaveCSS('box-shadow', 'none');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnPinned('c1', 'left'));
  const fittedPins = await page.locator('.cx-hrow').evaluate(row => [...row.children].slice(0, 2).map(cell => {
    const box = cell.getBoundingClientRect(); return { left: box.left, right: box.right };
  }));
  expect(fittedPins[1].left, 'suspended pins must not retain their sticky offsets').toBeCloseTo(fittedPins[0].right, 1);
  await open(page, { overflow: true, dark });
  await expect(cell).toHaveCSS('position', 'sticky');
  await expect(cell).toHaveCSS('box-shadow', 'none');
  await page.locator('.cx-grid').evaluate(grid => { grid.scrollLeft = 240; });
  await expect(cell).not.toHaveCSS('box-shadow', 'none');
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, `header-overlay-${dark ? 'dark' : 'light'}-1440.png`) });
  const left = await cell.evaluate(element => element.getBoundingClientRect().left);
  await page.locator('.cx-grid').evaluate(grid => { grid.scrollLeft = 300; });
  expect(await cell.evaluate(element => element.getBoundingClientRect().left)).toBe(left);
  await cell.hover();
  expect(await cell.evaluate(element => ({ color: getComputedStyle(element).backgroundColor,
    image: getComputedStyle(element).backgroundImage }))).toMatchObject({ image: expect.stringContaining('linear-gradient') });
  await cell.click();
  expect(await cell.evaluate(element => getComputedStyle(element).backgroundColor)).not.toMatch(/rgba\([^)]*, 0\)|transparent/);
  await page.locator('.cx-grid').evaluate(grid => { grid.scrollLeft = 0; });
  await expect(cell).toHaveCSS('box-shadow', 'none');
  if (process.env.CANOPYX_EVIDENCE) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, `header-overlay-${dark ? 'dark' : 'light'}-390.png`) });
  }
});

test('a touch tap reaches the overlaid column menu at phone width', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright does not emulate touch contexts in Firefox');
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(); await open(page);
    await expect(button(page, 'c0')).toHaveCSS('opacity', '0');
    await header(page, 'c0').tap({ position: { x: 8, y: 2 } });
    await expect(button(page, 'c0')).toHaveCSS('opacity', '1');
    await button(page, 'c0').tap();
    await expect(page.getByRole('menuitem', { name: 'Sort ascending', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

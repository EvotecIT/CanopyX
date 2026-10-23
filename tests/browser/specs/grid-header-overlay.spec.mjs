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

test('row hover reveals menus only beside complete captions and own hover uses an opaque chip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const definition = makeView();
  Object.assign(definition.columns[1], { title: 'Latency', kind: 'number', width: 80, maxWidth: 80, autoSize: 'none' });
  definition.rows.forEach(row => Object.keys(row.cells).forEach(id => row.cells[id] = '1'));
  definition.rows.forEach(row => row.cells.c1 = 12);
  definition.toolbar.columnMenus = false;
  await open(page, { definition }); const baseline = await geometry(page);
  definition.toolbar.columnMenus = true;
  await open(page, { definition });
  expect(await geometry(page)).toEqual(baseline);
  expect(baseline.columns).toHaveLength(12);
  expect(baseline.scroll).toBeLessThanOrEqual(baseline.width);
  await header(page, 'c0').hover();
  await expect(button(page, 'c0')).toHaveCSS('opacity', '1');
  const revealed = await page.locator('.cx-hcell').evaluateAll(cells => cells.slice(1).map(cell => {
    const menu=cell.querySelector('.cx-grid-column-menu'), box=menu.getBoundingClientRect(), range=document.createRange();
    range.selectNodeContents(cell.querySelector('.cx-htext'));
    return { opacity:getComputedStyle(menu).opacity, overlap:[...range.getClientRects()].some(rect=>rect.right>box.left-1) };
  }));
  expect(revealed.some(item=>item.overlap), 'the fixture includes narrow captions').toBe(true);
  for(const item of revealed) expect(item.opacity).toBe(item.overlap ? '0' : '0.4');
  await expect(button(page,'c0')).toHaveCSS('background-color', await header(page,'c0').evaluate(cell=>getComputedStyle(cell).backgroundColor));
  expect(await button(page,'c0').evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('linear-gradient');
  expect(await header(page,'c1').locator('.cx-htext').evaluate(el=>getComputedStyle(el).maskImage)).toBe('none');
  expect(await geometry(page)).toEqual(baseline);
  await page.mouse.move(0, 0);
  await expect(button(page,'c1')).toHaveCSS('opacity','0');
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

test('sorted and filtered narrow headers reserve state width and keep complete captions without idle menus', async ({ page }) => {
  const definition=makeView();
  definition.columns.forEach((column,index)=>Object.assign(column,{title:index===1?'Latency':'Port '+index,kind:'number'}));
  definition.rows.forEach(row=>Object.keys(row.cells).forEach(id=>row.cells[id]=4999));
  await open(page,{definition});
  for(const query of [{sort:[{column:'c1',direction:'asc'}]},
    {filters:[{column:'c1',operator:'eq',values:[4999]}]},
    {sort:definition.columns.map(column=>({column:column.id,direction:'asc'})),filters:[{column:'c1',operator:'eq',values:[4999]}]}]){
    await page.evaluate(query=>document.querySelector('[data-canopyx-host]').canopyx.setQuery(query),query);
    await page.locator('.cx-grid').focus(); await page.mouse.move(0,0);
    await expect(button(page)).toHaveCSS('opacity','0');
    const states=await page.locator('.cx-hcell').evaluateAll(cells=>cells.map(cell=>{
      const text=cell.querySelector('.cx-htext'),box=text.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(text);
      const filter=cell.querySelector('.cx-grid-header-filter'),priority=cell.querySelector('.cx-sort-priority');
      return {clipped:[...range.getClientRects()].some(rect=>rect.left<box.left-.6||rect.right>box.right+.6||rect.bottom>box.bottom+.6),
        filterClear:filter.hidden||filter.getBoundingClientRect().right<=box.left,
        priorityClear:!priority||priority.getBoundingClientRect().right<=box.left};
    }));
    for(const state of states){expect(state.clipped).toBe(false);expect(state.filterClear).toBe(true);expect(state.priorityClear).toBe(true);}
    await header(page).hover();await expect(button(page)).toHaveCSS('opacity','1');
    expect(await button(page).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toMatch(/transparent|rgba\([^)]*, 0\)/);
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
  await expect(button(page)).toHaveCSS('opacity', '0');
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ filters: [{ column: 'c2', operator: 'eq', values: ['123456789'] }] }));
  await expect(header(page, 'c2').locator('.cx-grid-header-filter')).toBeVisible();
  await expect(button(page, 'c2')).toHaveCSS('opacity', '0');
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

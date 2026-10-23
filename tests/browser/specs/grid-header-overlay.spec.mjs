import { test, expect } from "@playwright/test";
import { viewPage, openGridControl } from "./support.mjs";
import path from "node:path";

const columns = Array.from({ length: 11 }, (_, index) => ({ id: "c" + index, title: "Port " + index,
  kind: "text", priority: "essential", sortable: true, ...(index === 0 ? { rowHeader: true } : {}) }));
const makeView = (overflow = false, menus = true) => ({ protocol: "canopyx/2", type: "grid", id: "overlay", label: "Ports",
  density: "compact", selection: "single", rowHeight: 32, pageSize: 100, source: { kind: "inline" },
  toolbar: { columnMenus: menus }, columns: columns.map(column => ({ ...column, ...(overflow ? { width: 180, fixed: true } : {}) })),
  rows: Array.from({ length: 7 }, (_, row) => ({ id: "r" + row,
    cells: Object.fromEntries(columns.map(column => [column.id, "123456789"])) })) });

async function open(page, { overflow = false, menus = true, dark = false, definition } = {}) {
  let html = viewPage(definition || makeView(overflow, menus)).replace('</head>', '<style>body.cx-page>.cx-host{width:min(1100px,100%);height:420px}</style></head>');
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

test('active numeric header menus never obscure their caption', async ({ page }) => {
  const definition = makeView();
  Object.assign(definition.columns[1], { title: 'Size', kind: 'number' });
  definition.rows.forEach(row => row.cells.c1 = 4999);
  await open(page, { definition });
  for (const query of [{ sort: [{ column: 'c1', direction: 'asc' }] },
    { filters: [{ column: 'c1', operator: 'eq', values: [4999] }] },
    { sort: [{ column: 'c1', direction: 'asc' }], filters: [{ column: 'c1', operator: 'eq', values: [4999] }] }]) {
    await page.evaluate(query => document.querySelector('[data-canopyx-host]').canopyx.setQuery(query), query);
    await expect(button(page)).toHaveCSS('opacity', '1');
    const overlap = await header(page).evaluate(cell => {
      const range = document.createRange(); range.selectNodeContents(cell.querySelector('.cx-htext'));
      const menu = cell.querySelector('.cx-grid-column-menu').getBoundingClientRect();
      return [...range.getClientRects()].reduce((area, text) => area +
        Math.max(0, Math.min(menu.right, text.right) - Math.max(menu.left, text.left)) *
        Math.max(0, Math.min(menu.bottom, text.bottom) - Math.max(menu.top, text.top)), 0);
    });
    expect(overlap, 'a permanently visible menu must leave the entire numeric caption readable').toBe(0);
  }
});

test('eleven columns fit at 1440 and overlaid menus stay accessible without adding body chrome', async ({ page }) => {
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

import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo, runtimeAssets, settleGrid } from "./support.mjs";
import { call } from "./view-modes-support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(path.join(repo, "CanopyX.Html/Assets")); });
test.afterAll(async () => { await server?.close(); });

function cards(count = 40, extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "work-items", label: "Work items", pageSize: 100,
    selection: "multiple", search: true, rowHeight: 34, layout: { mode: "cards" },
    cardTemplate: { name: "{name}", due: "{due}" }, source: { kind: "inline" },
    columns: [
      { id: "name", title: "Name", kind: "text", rowHeader: true, sortable: true },
      { id: "status", title: "Status", kind: "text", presenter: { kind: "enum" } },
      { id: "owner", title: "Owner", kind: "text", sortable: true },
      { id: "team", title: "Team", kind: "text", sortable: true },
      { id: "priority", title: "Priority", kind: "text" },
      { id: "due", title: "Due", kind: "datetime" }
    ], rows: Array.from({ length: count }, (_, i) => ({ id: "item-" + String(i).padStart(5, "0"), cells: {
      name: "Item " + (i + 1), status: { value: i % 3 ? "Scheduled" : "Needs review", tone: i % 3 ? "info" : "warning" },
      owner: ["Alex Morgan", "Sam Rivera", "Jordan Lee", "Casey Taylor"][i % 4], team: i % 2 ? "Operations" : "Platform",
      priority: i % 4 ? "Normal" : "High", due: new Date(Date.UTC(2026, 10, 1 + i, 9)).toISOString()
    } })), ...extra };
}

async function openCards(page, view, { theme = "light", script = "" } = {}) {
  const { script: runtime, style } = runtimeAssets(view.reporting ? "reporting" : "grid");
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const config = JSON.stringify(view).replace(/</g, "\\u003c");
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Work item cards</title><style>' + style +
    'body{margin:0}main{padding:16px}.cx-host{height:720px}</style><script>' + runtime + '</script></head><body class="cx-page"><main><div data-canopyx-host data-cx-theme="' + theme + '">' +
    (script ? '' : '<script class="cx-config" type="application/json">' + config + '</script>') + '</div></main>' +
    (script ? '<script>const definition=' + config + ';' + script + '</script>' : '') + '</body></html>';
  await page.route(server.url + "card-fixture.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(server.url + "card-fixture.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  if (view.rows?.length === 0) await expect(page.locator(".cx-state")).toBeVisible();
  else await settleGrid(page);
}

const records = page => page.locator('.cx-canvas > .cx-row[data-cx-id]');
const focused = page => page.evaluate(() => document.activeElement.closest(".cx-row")?.dataset.cxId);
async function visibleCards(page) {
  return records(page).evaluateAll(rows => {
    const grid = document.querySelector(".cx-grid").getBoundingClientRect();
    return rows.map(row => ({ id: row.dataset.cxId, index: Number(row.getAttribute("aria-rowindex")), ...row.getBoundingClientRect().toJSON() }))
      .filter(row => row.bottom > grid.top + 1 && row.top < grid.bottom - 1);
  });
}

test("ordinary cards retain warning and danger state indicators without a success surface", async ({ page }) => {
  const view = cards(3);
  delete view.cardTemplate;
  view.columns[1].presenter = { kind: "state" };
  view.rows[1].cells.status = { value: "Blocked", tone: "danger" };
  await openCards(page, view);
  await expect(records(page).first().locator('.p-state .p-dot.warning')).toBeVisible();
  await expect(records(page).nth(1).locator('.p-state .p-dot.danger')).toBeVisible();
  const colors = await records(page).first().locator('.p-state').evaluate(state => {
    const actual = getComputedStyle(state).backgroundColor;
    state.style.backgroundColor = "var(--cx-tone-success-bg)";
    const success = getComputedStyle(state).backgroundColor;
    state.style.removeProperty("background-color");
    return { actual, success };
  });
  expect(colors.actual).not.toBe(colors.success);
  const boxes = await visibleCards(page);
  expect(boxes).toHaveLength(3);
  expect(new Set(boxes.map(row => row.top)).size).toBe(1);
  expect(page.errors).toEqual([]);
});

for (const width of [1440, 390]) for (const initiallyEmpty of [false, true]) {
  test(`empty cards retain the authored bound and settle through resize and recovery at ${width}px (${initiallyEmpty ? "initially empty" : "filtered"})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const view = cards(initiallyEmpty ? 0 : 40, { autoHeight: true });
    await openCards(page, view, { script: `
      const host = document.querySelector('[data-canopyx-host]');
      host.style.maxHeight = '520px';
      CanopyX.createDataGrid(host, { view: definition });` });
    if (!initiallyEmpty) await call(page, "setQuery", { search: "no matching work item" });
    await expect(page.locator(".cx-state")).toBeVisible();
    const heights = () => page.locator("[data-canopyx-host]").evaluate(host => new Promise(resolve => {
      const values = []; let frames = 0;
      function sample() {
        if (frames++ >= 10) values.push({ height: host.getBoundingClientRect().height, maximum: parseFloat(getComputedStyle(host).maxHeight) });
        if (frames < 20) requestAnimationFrame(sample); else resolve(values);
      }
      requestAnimationFrame(sample);
    }));
    for (const nextWidth of [width, width === 1440 ? 1280 : 420]) {
      await page.setViewportSize({ width: nextWidth, height: 900 });
      const values = await heights();
      expect(Math.max(...values.map(value => value.height))).toBeLessThanOrEqual(521);
      expect(Math.max(...values.map(value => value.height - value.maximum))).toBeLessThanOrEqual(1);
      expect(Math.max(...values.map(value => value.height)) - Math.min(...values.map(value => value.height))).toBeLessThanOrEqual(1);
    }
    if (!initiallyEmpty) {
      await call(page, "setQuery", { search: "" }); await settleGrid(page);
      await expect(records(page).first()).toHaveAttribute("data-cx-id", "item-00000");
      await expect(records(page).first()).toBeInViewport();
    }
    expect(page.errors).toEqual([]);
  });
}

for (const [width, theme, lanes] of [[1440, "light", 4], [390, "dark", 1]]) {
  test(`cards form a raised responsive grid with safe status pills (${width}, ${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const view = cards();
    view.rows[1].cells.status = { value: '<img src=x onerror="window.cardUnsafe=true">', tone: "danger" };
    view.rows[1].cells.name = "<b>Literal title</b>";
    await openCards(page, view, { theme });
    const boxes = await visibleCards(page), firstBand = boxes.filter(row => Math.abs(row.top - boxes[0].top) < 1);
    expect(firstBand).toHaveLength(lanes);
    expect(boxes.map(row => row.index)).toEqual([...boxes.map(row => row.index)].sort((a, b) => a - b));
    expect(firstBand[0].width).toBeGreaterThanOrEqual(280);
    for (let i = 1; i < boxes.length; i++) {
      const previous = boxes[i - 1], current = boxes[i];
      expect(current.top >= previous.bottom + 10 || current.left >= previous.right + 10).toBe(true);
    }
    const first = records(page).first();
    await expect(first.locator('[data-cx-card="title"] .cx-card-slot')).toHaveText("Item 1");
    await expect(first.locator('.p-pill.warning')).toHaveText("Needs review");
    await expect(first.locator('.cx-cell[data-cx-label]')).toHaveCount(5);
    expect(await first.evaluate(row => {
      const css = getComputedStyle(row);
      return parseFloat(css.borderRadius) > 0 && css.borderTopStyle === "solid" && css.boxShadow !== "none" &&
        [...row.children].every(cell => cell.getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom + 1);
    })).toBe(true);
    await expect(records(page).nth(1).locator('.p-pill.danger')).toHaveText('<img src=x onerror="window.cardUnsafe=true">');
    await expect(records(page).nth(1).locator('[data-cx-card="title"] .cx-card-slot')).toHaveText("<b>Literal title</b>");
    expect(await page.evaluate(() => !!window.cardUnsafe || !!document.querySelector('.cx-canvas img,.cx-card-slot b'))).toBe(false);
    expect(await page.locator('.cx-grid').evaluate(grid => grid.scrollWidth <= grid.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`cards-${width}-${theme}.png`) });
    expect(page.errors).toEqual([]);
  });
}

test("card bands virtualize, resize, query and retain record and cell focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCards(page, cards(5000));
  expect(await records(page).count()).toBeLessThan(80);
  await call(page, "scrollToRow", 4321); await settleGrid(page);
  const target = page.locator('[data-cx-id="item-04321"]');
  await expect(target).toBeInViewport();
  await target.focus(); await page.keyboard.press("F2"); await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  const selection = await call(page, "getSelection"), query = await call(page, "getQuery");
  const column = await page.evaluate(() => document.activeElement.getAttribute("aria-colindex"));
  await page.setViewportSize({ width: 390, height: 900 }); await settleGrid(page);
  expect(await focused(page)).toBe("item-04321");
  await expect(target).toBeInViewport();
  expect(await page.evaluate(() => document.activeElement.getAttribute("aria-colindex"))).toBe(column);
  expect(await call(page, "getQuery")).toEqual(query);
  expect(await call(page, "getSelection")).toEqual(selection);
  await page.keyboard.press("ArrowDown"); await expect.poll(() => focused(page)).toBe("item-04322");
  await page.keyboard.press("PageDown"); await expect.poll(() => focused(page)).not.toBe("item-04322");
  await page.keyboard.press("Control+End"); await expect.poll(() => focused(page)).toBe("item-04999");
  await expect(page.locator('[data-cx-id="item-04999"]')).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 }); await settleGrid(page);
  await expect(page.locator('[data-cx-id="item-04999"]')).toBeInViewport();
  await call(page, "setLayout", { mode: "fit" }); await settleGrid(page);
  expect(await focused(page)).toBe("item-04999");
  expect(await call(page, "getSelection")).toEqual(selection);
  await call(page, "setLayout", { mode: "cards" }); await settleGrid(page);
  await call(page, "setQuery", { search: "Item 4999" }); await settleGrid(page);
  await expect(records(page)).toHaveCount(1);
  await expect(records(page).first()).toHaveAttribute("data-cx-id", "item-04998");
  expect(await page.locator('.cx-grid').evaluate(grid => grid.scrollHeight <= grid.clientHeight + 1)).toBe(true);
  expect(page.errors).toEqual([]);
});

test("paged cards retain all lanes and logical Page Down navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCards(page, cards(251, { presentation: "paged", pageLength: 25 }));
  await call(page, "goToPage", 3); await settleGrid(page);
  await expect(records(page).first()).toHaveAttribute("data-cx-id", "item-00075");
  await expect(records(page).first()).toHaveAttribute("aria-rowindex", "77");
  const boxes = await visibleCards(page);
  expect(boxes.filter(row => Math.abs(row.top - boxes[0].top) < 1)).toHaveLength(4);
  await records(page).first().focus(); await page.keyboard.press("PageDown");
  await expect.poll(() => focused(page)).toBe("item-00083");
  await call(page, "scrollToRow", 99); await settleGrid(page);
  await expect(page.locator('[data-cx-id="item-00099"]')).toBeInViewport();
  expect((await call(page, "getPaging")).matched).toBe(251);
  expect(page.errors).toEqual([]);
});

test("group headings and collapse retain the existing single-column projection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCards(page, cards(40, { reporting: { groupBy: [{ column: "team", direction: "asc" }] } }));
  const heading = page.locator('.cx-grid-group').first();
  await expect(heading.locator(".cx-grid-group-count")).toHaveText("20");
  await expect(heading.locator(".cx-grid-group-toggle")).toHaveAttribute("aria-expanded", "true");
  await heading.focus(); await page.keyboard.press("ArrowLeft");
  await expect(heading.locator(".cx-grid-group-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(heading.locator(".cx-grid-group-toggle")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBeTruthy();
  const boxes = await visibleCards(page);
  expect(boxes[0].width).toBeGreaterThan(1000);
  const indices = await page.locator('.cx-canvas > .cx-row').evaluateAll(rows => rows.map(row => Number(row.getAttribute('aria-rowindex'))));
  expect(indices).toEqual([...indices].sort((a, b) => a - b));
  expect(page.errors).toEqual([]);
});

test("host loading placeholders keep the responsive geometry and keyboard destination", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = cards(500), data = view.rows; delete view.rows; view.source = { kind: "host" };
  await openCards(page, view, { script: `
    const data = ${JSON.stringify(data)};
    window.cardRequests = []; window.cardReleases = [];
    CanopyX.createDataGrid(document.querySelector('[data-canopyx-host]'), { view: definition, source: {
      async query(query) {
        cardRequests.push(query.offset);
        if (query.offset >= 100) await new Promise(resolve => cardReleases.push(resolve));
        return { protocol: 'canopyx/2', type: 'gridPage', view: definition.id, items: data.slice(query.offset, query.offset + query.limit), offset: query.offset, matched: data.length, total: data.length, revision: 'cards-1' };
      }
    } });` });
  await page.evaluate(() => { window.cardNavigation = document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(200); });
  await expect(page.locator('.cx-row.cx-loading').first()).toBeVisible();
  const boxes = await page.locator('.cx-row.cx-loading').evaluateAll(rows => rows.slice(0, 4).map(row => row.getBoundingClientRect().toJSON()));
  expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
  await page.evaluate(() => window.cardReleases.splice(0).forEach(resolve => resolve())); await settleGrid(page);
  await expect(page.locator('[data-cx-id="item-00200"]')).toBeInViewport();
  expect(page.errors).toEqual([]);
});

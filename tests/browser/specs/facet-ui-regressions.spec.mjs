import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const section = page => page.locator('.cx-facet[data-cx-facet="team"]');
const choices = page => section(page).getByRole("checkbox");
const rows = [{ id: "a", cells: { team: "A", city: "Red" } }, { id: "b", cells: { team: "B", city: "Red" } },
  { id: "c", cells: { team: "C", city: "Blue" } }];

async function open(page, { toolbar = true, position = "side", hosted = false, data = rows, limit } = {}) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const view = { protocol: "canopyx/2", type: "grid", id: "facet-ui", label: "Places", rowHeight: 34, pageSize: 50,
    selection: "none", live: true, columns: [{ id: "team", title: "Team", kind: "text" }, { id: "city", title: "City", kind: "text" }],
    facets: { columns: [{ column: "team", sort: "value", ...(limit ? { limit } : {}) }, "city"], position },
    source: { kind: hosted ? "host" : "inline" }, ...(hosted ? { reporting: { facetColumns: ["team", "city"] } } : { rows: data }) };
  const source = hosted ? `source: {
    query(query) { return { protocol: 'canopyx/2', type: 'gridPage', view: 'facet-ui', revision: window.revision,
      offset: query.offset, total: window.rows.length, matched: window.rows.length, items: window.rows }; },
    facet(request) {
      const buckets = new Map(); for (const row of window.rows) buckets.set(row.cells[request.column], (buckets.get(row.cells[request.column]) || 0) + 1);
      const items = [...buckets].map(([value, count]) => ({ value, count }));
      return { protocol: 'canopyx/2', type: 'gridFacetPage', view: 'facet-ui', revision: window.revision, column: request.column,
        search: request.search, includeCurrentFilter: request.includeCurrentFilter, matched: window.rows.length, totalValues: items.length, truncated: false, items };
    }
  },` : "";
  const html = viewPage(view).replace("</head>", `<script>
    window.rows = ${JSON.stringify(data)}; window.revision = 'r1';
    CanopyX.configure('facet-ui', { ${source} toolbar: ${toolbar} });
    </script></head>`).replace('<body class="cx-page">', '<body class="cx-page"><button id="outside">Host action</button>');
  await page.route("http://127.0.0.1:8998/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1:8998/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect(choices(page)).toHaveCount(Math.min(limit || 8, new Set(data.map(row => row.cells.team)).size)); await nextFrames(page);
  return errors;
}

async function focusB(page) {
  await choices(page).first().focus(); await page.keyboard.press("ArrowDown");
  await expect(choices(page).nth(1)).toBeFocused(); await expect(choices(page).nth(1)).not.toBeChecked();
}

for (const [position, width] of [["side", 390], ["side", 700], ["top", 390]]) {
  test(`facets without a toolbar remain reachable and restore opener focus (${position}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const errors = await open(page, { toolbar: false, position });
    const panel = page.getByRole("complementary", { name: "Filter by" }), opener = page.locator(".cx-facets-open");
    await expect(panel).toBeVisible(); await expect(opener).toBeHidden(); await expect(page.locator(".cx-toolbar")).toBeHidden();
    await page.setViewportSize({ width, height: 900 }); await expect(opener).toBeVisible(); await expect(panel).toBeHidden();
    await opener.focus(); await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Filter by" }); await expect(sheet).toBeVisible();
    await sheet.getByRole("checkbox", { name: /^A,/ }).check();
    await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filters)).toEqual([{ column: "team", operator: "in", values: ["A"] }]);
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".cx-facet-sheet")).toHaveCount(0); await expect(opener).toBeFocused();
    await page.keyboard.press("Enter"); await expect(sheet).toBeVisible(); await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0); await expect(opener).toBeFocused(); await expect(page.locator(".cx-toolbar")).toBeHidden();
    await page.setViewportSize({ width: 1400, height: 900 }); await expect(panel).toBeVisible(); await expect(opener).toBeHidden();
    expect(errors).toEqual([]);
  });
}

for (const refresh of ["live removal", "cross filter", "hosted refresh"]) {
  test(`a disappearing focused facet bucket keeps a surviving Tab stop (${refresh})`, async ({ page }) => {
    const errors = await open(page, { hosted: refresh === "hosted refresh" }); await focusB(page);
    await page.evaluate(async refresh => {
      const api = document.querySelector("[data-canopyx-host]").canopyx;
      if (refresh === "live removal") await api.removeRows(["b"]);
      else if (refresh === "cross filter") await api.setQuery({ ...api.getQuery(), filters: [{ column: "city", operator: "eq", values: ["Blue"] }] });
      else {
        window.rows = window.rows.filter(row => row.id !== "b").map(row => row.id === "a" ? { ...row, cells: { ...row.cells, city: "Red2" } } : row);
        window.revision = "r2";
        await api.refreshRows();
      }
    }, refresh);
    await expect(choices(page)).toHaveCount(refresh === "cross filter" ? 1 : 2);
    const survivor = section(page).getByRole("checkbox", { name: /^C,/ });
    await expect(survivor).toBeFocused();
    expect(await choices(page).evaluateAll(boxes => boxes.map(box => box.tabIndex))).toEqual(refresh === "cross filter" ? [0] : [-1, 0]);
    await section(page).getByRole("button", { name: "Team", exact: true }).focus(); await page.keyboard.press("Tab");
    await expect(survivor).toBeFocused();
    if (refresh !== "cross filter") { await page.keyboard.press("ArrowUp"); await expect(choices(page).first()).toBeFocused(); }
    expect(errors).toEqual([]);
  });
}

test("an empty refreshed facet returns focus to its heading", async ({ page }) => {
  const errors = await open(page); await focusB(page);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.removeRows(["a", "b", "c"]));
  await expect(choices(page)).toHaveCount(0); await expect(section(page).getByRole("button", { name: "Team", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("a removed focused value in a scrolled facet keeps its nearby survivor visible", async ({ page }) => {
  const data = Array.from({ length: 80 }, (_, i) => ({ id: "r" + i, cells: { team: "Team " + String(i).padStart(2, "0"), city: "Red" } }));
  const errors = await open(page, { data, limit: 200 });
  await choices(page).first().focus(); await page.keyboard.press("End"); await expect(choices(page).last()).toBeFocused();
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.removeRows(["r79"]));
  await expect(choices(page)).toHaveCount(79); await expect(choices(page).last()).toBeFocused();
  expect(await choices(page).last().evaluate(box => {
    const bounds = box.getBoundingClientRect(), viewport = box.closest(".cx-facets-list").getBoundingClientRect();
    return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
  })).toBe(true);
  expect((await choices(page).evaluateAll(boxes => boxes.filter(box => box.tabIndex === 0).length))).toBe(1);
  expect(errors).toEqual([]);
});

test("a facet refresh preserves focus already taken by a host control", async ({ page }) => {
  const errors = await open(page); await focusB(page); await page.getByRole("button", { name: "Host action" }).focus();
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.removeRows(["b"]));
  await expect(choices(page)).toHaveCount(2); await expect(page.getByRole("button", { name: "Host action" })).toBeFocused();
  expect(await choices(page).evaluateAll(boxes => boxes.map(box => box.tabIndex))).toEqual([0, -1]); expect(errors).toEqual([]);
});

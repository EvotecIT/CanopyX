import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { viewPage, nextFrames, repo } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
function definition() {
  return { protocol: "canopyx/2", type: "grid", id: "number-format", label: "Formatted inventory", rowHeight: 28, pageSize: 20,
    source: { kind: "inline" }, presentation: "continuous", selection: "multiple", statusBar: true,
    columns: [{ id: "name", title: "Name", kind: "text", width: 220, sortable: true },
      { id: "amount", title: "Amount", kind: "number", width: 220, sortable: true, aggregatable: true,
        format: { minimumFractionDigits: 2, maximumFractionDigits: 2, prefix: "$" } }],
    rows: [2.675, -2.675, 0.125, -0.004, 9007199254740991].map((amount, i) => ({ id: "r" + i, cells: { name: "Item " + i, amount } })) };
}
async function open(page, view, setup = "", locale = "en") {
  await page.route("http://127.0.0.1:8957/format", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace('<html lang="en">', '<html lang="' + locale + '">')
      .replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://127.0.0.1:8957/format");
  await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}

test("finite number helper retains integer precision above the fixed-point spelling threshold", async ({ page }) => {
  // Grid documents retain their safe-magnitude bound. This isolates the same shared formatter's finite-number contract.
  const source = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.source/01-number-format.js"), "utf8");
  const values = await page.evaluate(source => {
    const format = new Function(source + ";return numberText;")();
    return [1e21 + 1e6, -(1e21 + 1e6), Number.MAX_VALUE].map(value => format(value, "en", { minimumFractionDigits: 2, maximumFractionDigits: 2, suffix: "%" }));
  }, source);
  expect(values[0]).toBe("1,000,000,000,000,001,048,576.00%");
  expect(values[1]).toBe("-1,000,000,000,000,001,048,576.00%");
  const maximum = BigInt(Number.MAX_VALUE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  expect(values[2]).toBe(maximum + ".00%");
});

test("explicit formats preserve binary64 rounding, signs, host text and captured raw exports", async ({ page }) => {
  const view = definition();
  view.rows.push({ id: "host", cells: { name: "Host override", amount: { value: 1.5, text: "One and a half" } } });
  await open(page, view);
  for (const [id, text] of [["r0", "$2.67"], ["r1", "-$2.67"], ["r2", "$0.13"], ["r3", "$0.00"],
    ["r4", "$9,007,199,254,740,991.00"], ["host", "One and a half"]])
    await expect(page.locator('.cx-row[data-cx-id="' + id + '"] .cx-cell').nth(1)).toHaveText(text);
  const captured = await page.evaluate(`(async()=>{const job=${api}.prepareExport({scope:'all'}),values=[];
    for await(const row of job.rows())values.push([row.id,row.cells.amount]);return {column:job.request.columns[1],values:Object.fromEntries(values)};})()`);
  expect(captured.column.format).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2, prefix: "$" });
  expect(captured.values.r0).toEqual({ value: 2.675, text: "$2.67" });
  expect(captured.values.host).toEqual({ value: 1.5, text: "One and a half" });
});

test("omitted digit maximum is three and higher minimums require an explicit maximum", async ({ page }) => {
  const view = definition(); view.columns[1].format = { minimumFractionDigits: 4 };
  await page.route("http://127.0.0.1:8957/invalid", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://127.0.0.1:8957/invalid");
  await expect(page.locator("[data-canopyx-host]")).toContainText("invalid number format");
});

test("tree documents reject flat-grid-only formats before rendering", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "view", id: "format-tree", label: "Tree", rowHeight: 28, pageSize: 20,
    selection: "single", source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 200, kind: "text" },
      { id: "amount", title: "Amount", width: 200, kind: "number", format: { maximumFractionDigits: 2 } }],
    roots: [{ id: "one", label: "One", kind: "leaf", cells: { amount: 1.25 } }] };
  await page.route("http://127.0.0.1:8957/tree", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://127.0.0.1:8957/tree");
  await expect(page.locator("[data-canopyx-host]")).toContainText("number formats apply to flat grids only");
});

test("numeric group export captions use the displayed format and retain raw group values", async ({ page }, testInfo) => {
  const view = definition();
  view.reporting = { grouping: { column: "amount", direction: "asc" }, aggregates: [] };
  view.rows = [1.25, 2.5, null].map((amount, index) => ({ id: "r" + index, cells: { name: "Item " + index, amount } }));
  await open(page, view);
  expect(await page.locator(".cx-grid-group-text").allTextContents()).toEqual(expect.arrayContaining(["$1.25", "$2.50", "Missing value"]));
  const groups = await page.evaluate(api + ".prepareExport({scope:'filtered'}).request.grouping.groups");
  if (process.env.CANOPYX_EVIDENCE) {
    fs.mkdirSync(process.env.CANOPYX_EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(process.env.CANOPYX_EVIDENCE, "number-format-group-export-" + testInfo.project.name + ".json"), JSON.stringify(groups, null, 2));
  }
  expect(groups.find(group => group.value === 1.25).value).toBe(1.25);
  expect(groups.find(group => group.value === 2.5).value).toBe(2.5);
  expect(groups.find(group => group.value === null).text).toBe("Missing value");
  expect(groups.find(group => group.value === 1.25).text).toBe("$1.25");
  expect(groups.find(group => group.value === 2.5).text).toBe("$2.50");
});

test("numeric range facet labels use the column format while bounds and counts stay raw", async ({ page }, testInfo) => {
  const view = definition(); view.facets = { columns: [{ column: "amount", kind: "range", bins: 4 }], position: "top" };
  view.rows = [1.25, 2.5, 3.75, 6.25].map((amount, index) => ({ id: "r" + index, cells: { name: "Item " + index, amount } }));
  await open(page, view);
  const facet = page.locator('.cx-facet[data-cx-facet="amount"]'), bars = facet.locator(".cx-facet-bar");
  await expect(bars).toHaveCount(4); await bars.first().click();
  await expect.poll(() => page.evaluate(api + ".getQuery().filters")).toEqual([
    { column: "amount", operator: "ge", values: [1.25] }, { column: "amount", operator: "lt", values: [2.5] }]);
  await expect(facet.getByLabel("From")).toHaveValue("1.25"); await expect(facet.getByLabel("To")).toHaveValue("2.5");
  expect((await page.evaluate(api + ".getPaging()")).matched).toBe(1);
  const selected = { filters: await page.evaluate(api + ".getQuery().filters"), from: await facet.getByLabel("From").inputValue(),
    to: await facet.getByLabel("To").inputValue(), matched: (await page.evaluate(api + ".getPaging()")).matched };
  await page.evaluate(api + ".setQuery({filters:[]})");
  await expect(facet.locator(".cx-facet-axis span")).toHaveText(["$1.25", "$6.25"]);
  await expect(bars.first()).toHaveAttribute("title", "$1.25 to $2.50: 1 rows");
  if (process.env.CANOPYX_EVIDENCE) {
    fs.mkdirSync(process.env.CANOPYX_EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(process.env.CANOPYX_EVIDENCE, "number-format-range-" + testInfo.project.name + ".json"), JSON.stringify({
      selected, axis: await facet.locator(".cx-facet-axis span").allTextContents(), firstBinTitle: await bars.first().getAttribute("title") }, null, 2));
  }
  if (process.env.CANOPYX_EVIDENCE && testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 900 }); await nextFrames(page);
    await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "number-format-facet-1440-light.png"), fullPage: true });
  }
});

test("numeric value-list facets already share formatted labels and raw selections", async ({ page }) => {
  const view = definition(); view.facets = { columns: [{ column: "amount", kind: "list" }], position: "top" };
  view.rows = [1.25, 2.5].map((amount, index) => ({ id: "r" + index, cells: { name: "Item " + index, amount } }));
  await open(page, view);
  const facet = page.locator('.cx-facet[data-cx-facet="amount"]');
  await facet.getByRole("checkbox", { name: "$1.25, 1 rows", exact: true }).check();
  await expect.poll(() => page.evaluate(api + ".getQuery().filters")).toEqual([{ column: "amount", operator: "in", values: [1.25] }]);
  await expect(facet.locator(".cx-facet-text")).toHaveText(["$1.25", "$2.50"]);
});

test("aggregate overrides and count defaults use the current shared heading and phone summary helper", async ({ page }, testInfo) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const view = definition();
  view.columns.splice(1, 0, { id: "category", title: "Category", kind: "text", width: 140, sortable: true, priority: "optional" });
  view.columns[2].format = { maximumFractionDigits: 0, suffix: "%" };
  view.reporting = { grouping: { column: "category", direction: "asc" }, aggregates: [
    { id: "sum", column: "amount", operation: "sum", label: "Total amount" },
    { id: "average", column: "amount", operation: "average", label: "Average amount", format: { minimumFractionDigits: 2, maximumFractionDigits: 2, prefix: "$" } },
    { id: "count", column: "amount", operation: "count", label: "Amounts present" },
    { id: "distinct", column: "amount", operation: "distinctCount", label: "Distinct amounts" },
    { id: "median", column: "amount", operation: "median", label: "Median amount", format: { maximumFractionDigits: 1, suffix: " ms" } }
  ] };
  view.rows = [10, 20, null, 2, 4, null].map((amount, i) => ({ id: "r" + i, cells: { name: "Item " + i, category: i < 3 ? "A" : "B", amount } }));
  await open(page, view, `CanopyX.use({name:'format-median',aggregates:{median:{label:'med {value}',compute(values){values=[...values].sort((a,b)=>a-b);const middle=values.length>>1;return !values.length?null:values.length%2?values[middle]:(values[middle-1]+values[middle])/2;}}}});`);
  const first = page.locator(".cx-grid-group").first().locator(".cx-aggregate");
  await expect(first).toContainText("Sum 30%"); await expect(first).toContainText("Avg $15.00");
  await expect(first).toContainText("Count 2"); await expect(first).toContainText("Distinct 2");
  await expect(first).toContainText("Med 15 ms");
  await expect(first).toHaveAttribute("title", /Total amount · Sum: 30%.*Average amount · Avg: \$15.00.*Amounts present · Count: 2.*Distinct amounts · Distinct: 2.*Median amount · Med: 15 ms/);
  await page.evaluate(api + ".setSelection(['r0','r1'])");
  await expect(page.locator(".cx-grid-status .agg")).toHaveText("Amount: 30%");
  await expect(page.locator(".cx-grid-status .agg span")).toHaveAttribute("title", /Average: 15%/);
  await page.evaluate(api + ".clearSelection()");
  if (process.env.CANOPYX_EVIDENCE && testInfo.project.name === "chromium") {
    fs.mkdirSync(process.env.CANOPYX_EVIDENCE, { recursive: true });
    for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.locator("[data-canopyx-host]").evaluate((element, theme) => element.dataset.cxTheme = theme, theme);
      await expect.poll(() => page.locator("[data-canopyx-host]").evaluate(element => element.classList.contains("cx-phone"))).toBe(width === 390);
      await nextFrames(page);
      await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "number-formats-" + width + "-" + theme + ".png"), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator("[data-canopyx-host]").evaluate(element => element.classList.contains("cx-phone"))).toBe(true);
  await expect(page.locator('.cx-phone-field-title', { hasText: /^Amount:$/ }).first()).toBeVisible();
  await nextFrames(page);
  const heading = page.locator(".cx-grid-group").first(), phone = heading.locator(".cx-aggregate-button,.cx-hidden-aggregates");
  await expect(phone).toContainText("Avg $15.00");
  expect(await page.locator(".cx-aggregate-button,.cx-hidden-aggregates").evaluateAll(buttons => buttons.every(button => {
    const box = button.getBoundingClientRect(), cell = button.parentElement.getBoundingClientRect();
    return box.left >= cell.left - 1 && box.right <= cell.right + 1;
  }))).toBe(true);
  const collapsed = await page.evaluate(api + ".getCollapsedGroups()");
  const held = await phone.elementHandle(); await phone.hover(); await page.mouse.down();
  await page.evaluate(api + ".setTimeZone('local')"); await nextFrames(page);
  expect(await held.evaluate(element => element.isConnected)).toBe(true);
  await page.mouse.up();
  const dialog = page.locator(".cx-reporting-text");
  await expect(dialog.getByRole("button", { name: "Apply", exact: true })).toBeInViewport();
  await expect(dialog).toContainText("Average amount · Avg: $15.00");
  await expect(dialog).toContainText("Median amount · Med: 15 ms");
  if (process.env.CANOPYX_EVIDENCE && testInfo.project.name === "chromium") for (const theme of ["light", "dark"]) {
    await page.keyboard.press("Escape");
    await page.locator("[data-canopyx-host]").evaluate((element, theme) => element.dataset.cxTheme = theme, theme);
    await phone.click(); await expect(dialog).toContainText("Median amount · Med: 15 ms");
    await nextFrames(page);
    await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "number-formats-dialog-390-" + theme + ".png"), fullPage: true });
  }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(phone).toBeFocused();
  await heading.focus(); await page.keyboard.press("F2"); await page.keyboard.press("End"); await expect(phone).toBeFocused();
  await page.keyboard.press("Enter"); await expect(dialog).toContainText("Distinct amounts · Distinct: 2");
  await page.keyboard.press("Escape"); await expect(phone).toBeFocused();
  expect(await page.evaluate(api + ".getCollapsedGroups()")).toEqual(collapsed);
  // Phone fitting can move Amount into the existing hidden-column summary after the query narrows.
  const totals = page.locator('.cx-summary-row button[aria-haspopup="dialog"]');
  await totals.click(); await expect(dialog).toContainText("Total amount · Sum: 36%"); await page.keyboard.press("Escape");
  await page.evaluate(api + ".setQuery({filters:[{column:'amount',operator:'ge',values:[10]}]})");
  await expect(totals).toHaveAttribute("aria-label", /Total amount · Sum: 30%.*Amounts present · Count: 2/);
  await page.evaluate(api + ".setColumnVisible('amount',false)"); await nextFrames(page);
  const hidden = page.locator(".cx-grid-group").first().locator(".cx-hidden-aggregates");
  await expect(hidden).toContainText("Avg $15.00"); await hidden.click();
  await expect(dialog).toContainText("Average amount · Avg: $15.00");
  await page.keyboard.press("Escape"); await expect(hidden).toBeFocused();
  expect(errors).toEqual([]);
});

test.describe("touch access to complete formatted aggregates", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true,
    isMobile: async ({ browserName }, use) => use(browserName !== "firefox") });
  test("visible group and query totals open complete formatted values without collapsing the group", async ({ page }) => {
    const view = definition(); view.columns[1].format = { maximumFractionDigits: 0, suffix: "%" };
    view.reporting = { grouping: { column: "name", direction: "asc" }, aggregates: [
      { id: "sum", column: "amount", operation: "sum", label: "Total amount" },
      { id: "average", column: "amount", operation: "average", label: "Average amount", format: { minimumFractionDigits: 2, maximumFractionDigits: 2, prefix: "$" } },
      { id: "distinct", column: "amount", operation: "distinctCount", label: "Distinct amounts" }
    ] };
    view.rows = [10, 20].map((amount, i) => ({ id: "r" + i, cells: { name: "Group A", amount } }));
    await open(page, view);
    await page.locator(".cx-grid-group :is(.cx-aggregate-button,.cx-hidden-aggregates)").tap();
    const dialog = page.locator(".cx-reporting-text");
    await expect(dialog.locator("pre")).toBeInViewport();
    await expect(dialog).toContainText("Total amount · Sum: 30%"); await expect(dialog).toContainText("Average amount · Avg: $15.00");
    await expect(dialog).toContainText("Distinct amounts · Distinct: 2");
    await dialog.getByRole("button", { name: "Close complete text", exact: true }).tap();
    expect(await page.evaluate(api + ".getCollapsedGroups()")).toEqual([]);
    await page.locator(".cx-summary-row :is(.cx-aggregate-button,.cx-hidden-aggregates)").tap();
    await expect(dialog).toContainText("Total amount · Sum: 30%");
    await dialog.getByRole("button", { name: "Close complete text", exact: true }).tap();
  });
});

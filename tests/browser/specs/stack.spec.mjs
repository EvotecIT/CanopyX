import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { exampleUrl, repo } from "./support.mjs";

async function stack(page, options = {}) {
  await page.goto(exampleUrl("stack.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  if (options.compact) await page.addScriptTag({ content: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-data.js"), "utf8") });
  await page.evaluate(async options => {
    const host = document.querySelector("[data-canopyx-host]"), previous = host.canopyx;
    await previous.ready;
    const view = JSON.parse(JSON.stringify(previous.view)); previous.destroy(); host.replaceChildren();
    view.id = "stack-test"; delete view.stateKey; delete view.rowData;
    view.columns = [{ id: "title", title: "Configuration", kind: "text", rowHeader: true }, { id: "value", title: "Value", kind: "text" }];
    view.source = { kind: "inline" }; view.pageSize = 20; view.query = { search: "", sort: [], filters: [] };
    view.rows = Array.from({ length: options.count || 3 }, (_, index) => ({ id: "r" + index,
      cells: { title: "Configuration " + index, value: "Value " + index } }));
    view.stack = { layers: options.empty ? [] : [
      { id: "baseline", record: "r0", reason: "Starting <value> from the host.", label: "Shared context", enforced: true,
        badges: [{ text: "Reviewed <today>", tone: "info", title: "Host review" }] },
      { id: "excluded", record: "r1", reason: "Outside the selected scope.", filtered: true },
      { id: "effective", record: "r" + (view.rows.length - 1), reason: "Selected explicitly by the host.", winner: true },
      { id: "review", record: "r0", reason: "A second reference with its own reason.", label: "Review context" }
    ] };
    if (options.long) {
      view.rows[0].cells.title = "Shared configuration with a long title that wraps without obscuring the processing order or record button";
      view.stack.layers[0].reason = "A detailed host explanation with a long reference " + "configuration-reference-".repeat(12);
    }
    if (options.compact) {
      const records = [...view.rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      view.rowData = { version: 1, count: records.length, columns: ["title", "value"], ordered: true,
        chunks: Array.from({ length: Math.ceil(records.length / 20) }, (_, index) =>
          records.slice(index * 20, index * 20 + 20).map(row => [row.id, row.cells.title, row.cells.value])) };
      delete view.rows;
    }
    window.stackErrors = []; host.addEventListener("canopyx:error", event => window.stackErrors.push(event.detail.error.message));
    window.stackApi = CanopyX.createDataGrid(host, { view }); await window.stackApi.ready;
  }, options);
  await expect(page.locator(".cx-stack")).toBeVisible();
}
const layer = (page, id) => page.locator('[data-cx-stack-layer="' + id + '"]');

test("stack shows the host winner, ordered reasons, context and semantic badges", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await stack(page);
  await expect(page.locator(".cx-stack-winner")).toContainText("Configuration 2");
  await expect(page.locator(".cx-stack-winner")).toContainText("Selected explicitly by the host.");
  await expect(page.locator(".cx-stack-layer")).toHaveCount(4);
  expect(await page.locator(".cx-stack-layer").evaluateAll(items => items.map(item => item.dataset.cxStackLayer)))
    .toEqual(["baseline", "excluded", "effective", "review"]);
  await expect(layer(page, "baseline").locator(".cx-stack-reason")).toHaveText("Starting <value> from the host.");
  await expect(layer(page, "baseline")).toContainText("Shared context");
  await expect(layer(page, "baseline").locator(".cx-badge")).toHaveText(["Enforced", "Reviewed <today>"]);
  await expect(layer(page, "baseline").getByText("Reviewed <today>", { exact: true })).toHaveAttribute("title", "Host review");
  await expect(layer(page, "excluded").locator(".cx-badge")).toHaveText("Filtered");
  await expect(layer(page, "effective").locator(".cx-badge")).toHaveText("Winner");
  await expect(page.locator(".cx-stack script")).toHaveCount(0);
  await expect(page.locator(".cx-grid")).toBeHidden();
  expect(await page.evaluate(() => window.stackErrors)).toEqual([]); expect(errors).toEqual([]);
});

test("stack keyboard opens the shared panel beyond the loaded cache and restores layer focus", async ({ page }) => {
  await stack(page, { count: 800 });
  expect(await page.evaluate(() => window.stackApi.getLoadedRows(["r799"]))).toEqual([]);
  const first = layer(page, "baseline").getByRole("button"), winner = layer(page, "effective").getByRole("button");
  await first.focus(); await page.keyboard.press("ArrowDown");
  await expect(layer(page, "excluded").getByRole("button")).toBeFocused();
  await page.keyboard.press("End"); await expect(layer(page, "review").getByRole("button")).toBeFocused();
  await page.keyboard.press("Home"); await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await expect(winner).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.locator('dialog.cx-drawer[data-cx-record="r799"]');
  await expect(panel).toBeVisible(); await expect(panel).toContainText("Configuration 799");
  await expect(panel).toContainText("Value 799");
  await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0); await expect(winner).toBeFocused();
  expect(await page.evaluate(() => window.stackErrors)).toEqual([]);
});

test("stack repeated-record layer buttons keep independent return focus", async ({ page }) => {
  await stack(page);
  const review = layer(page, "review").getByRole("button");
  await review.focus(); await page.keyboard.press("Space");
  await expect(page.locator('dialog.cx-drawer[data-cx-record="r0"]')).toBeVisible();
  await page.keyboard.press("Escape"); await expect(review).toBeFocused();
  await expect(layer(page, "review")).toContainText("A second reference with its own reason.");
});

test("stack waits for compact inline records and opens an uncached record through the shared panel", async ({ page }) => {
  await stack(page, { count: 1200, compact: true });
  expect(await page.evaluate(() => window.stackApi.getLoadedRows(["r1199"]))).toEqual([]);
  await layer(page, "effective").getByRole("button").click();
  await expect(page.locator('dialog.cx-drawer[data-cx-record="r1199"]')).toBeVisible();
  await expect(page.locator("dialog.cx-drawer")).toContainText("Value 1199");
});

test("stack fits phone and wide light layouts while keeping long explanations readable", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await stack(page, { long: true });
    await expect(page.locator(".cx-stack-winner")).toBeVisible();
    await expect(layer(page, "baseline").locator(".cx-stack-reason")).toBeVisible();
    expect(await page.locator(".cx-stack").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const item = await layer(page, "baseline").boundingBox(), next = await layer(page, "excluded").boundingBox();
    expect(next.y).toBeGreaterThanOrEqual(item.y + item.height);
    const button = layer(page, "baseline").getByRole("button"); await button.focus();
    expect(await button.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    if (width === 390) {
      await button.click(); await expect(page.locator("dialog.cx-drawer.cx-phone")).toBeVisible();
      await page.keyboard.press("Escape"); await expect(button).toBeFocused();
    }
  }
});

test("stack prints every ordered layer and destroy removes its frame and classes", async ({ page }) => {
  await stack(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cx-stack-layer")).toHaveCount(4);
  for (const id of ["baseline", "excluded", "effective", "review"]) await expect(layer(page, id)).toBeVisible();
  expect(await page.locator(".cx-stack").evaluate(element => getComputedStyle(element).overflow)).toBe("visible");
  await expect(page.locator(".cx-grid")).toBeHidden();
  await page.evaluate(() => window.stackApi.destroy());
  await expect(page.locator(".cx-stack")).toHaveCount(0); await expect(page.locator(".cx-stack-host")).toHaveCount(0);
  await page.evaluate(() => { window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("afterprint")); });
  await expect(page.locator(".cx-stack")).toHaveCount(0);
});

test("stack empty state and host label overrides remain explicit", async ({ page }) => {
  await stack(page, { empty: true });
  await expect(page.locator(".cx-stack-empty")).toHaveText("No layers to display.");
  await expect(page.locator(".cx-stack-winner")).toHaveCount(0); await expect(page.locator(".cx-stack-layer")).toHaveCount(0);
  await page.evaluate(async () => {
    const previous = window.stackApi, host = previous.element, view = JSON.parse(JSON.stringify(previous.view));
    previous.destroy(); host.replaceChildren();
    window.stackApi = CanopyX.createDataGrid(host, { view, labels: { stackEmpty: "No configuration layers." } });
    await window.stackApi.ready;
  });
  await expect(page.locator(".cx-stack-empty")).toHaveText("No configuration layers.");
});

test("stack browser validation enforces bounds, known keys, references and winner invariants", async ({ page }) => {
  await stack(page);
  const results = await page.evaluate(async () => {
    const original = window.stackApi, host = original.element, saved = JSON.parse(JSON.stringify(original.view)); original.destroy();
    const results = [];
    for (const invalid of ["multiple", "filtered", "missing", "duplicate", "tooMany", "noWinner", "stackKey", "layerKey", "badgeKey", "flagType", "unknownTitle", "unicodeBlank"]) {
      const view = JSON.parse(JSON.stringify(saved)); host.replaceChildren();
      if (invalid === "multiple") view.stack.layers[0].winner = true;
      if (invalid === "filtered") view.stack.layers[2].filtered = true;
      if (invalid === "missing") view.stack.layers[0].record = "absent";
      if (invalid === "duplicate") view.stack.layers[1].id = "baseline";
      if (invalid === "tooMany") view.stack.layers = Array.from({ length: 1001 }, (_, index) => ({ id: "l" + index, record: "r0", reason: "Host reason", winner: index === 0 }));
      if (invalid === "noWinner") view.stack.layers[2].winner = false;
      if (invalid === "stackKey") view.stack.extra = true;
      if (invalid === "layerKey") view.stack.layers[0].extra = true;
      if (invalid === "badgeKey") view.stack.layers[0].badges[0].extra = true;
      if (invalid === "flagType") view.stack.layers[0].enforced = "true";
      if (invalid === "unknownTitle") view.stack.titleColumn = "absent";
      if (invalid === "unicodeBlank") view.stack.layers[0].reason = "\u0085";
      let api;
      try { api = CanopyX.createDataGrid(host, { view }); await api.ready; results.push(false); }
      catch { results.push(true); } finally { api?.destroy(); }
    }
    return results;
  });
  expect(results).toEqual(Array(12).fill(true));
});

test("stack accepts the 1000-layer boundary with repeated records and one winner", async ({ page }) => {
  await stack(page);
  await page.evaluate(async () => {
    const previous = window.stackApi, host = previous.element, view = JSON.parse(JSON.stringify(previous.view));
    previous.destroy(); host.replaceChildren();
    view.stack.layers = Array.from({ length: 1000 }, (_, index) => ({ id: "l" + index, record: "r0", reason: "Host reason", winner: index === 999 }));
    window.stackApi = CanopyX.createDataGrid(host, { view }); await window.stackApi.ready;
  });
  await expect(page.locator(".cx-stack-layer")).toHaveCount(1000);
  await expect(page.locator(".cx-stack-selected")).toHaveCount(1);
  await expect(layer(page, "l999").locator(".cx-badge")).toHaveText("Winner");
});

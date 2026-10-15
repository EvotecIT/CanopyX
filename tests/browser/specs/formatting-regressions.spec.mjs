// Formatting repair regressions through the grid's state/rule APIs, drawer and rule editor.
import { expect, test } from "@playwright/test";
import { formattingPage, healthView, read } from "./formatting-support.mjs";
import { ORIGIN, servePage } from "./enhance-support.mjs";
import { nextFrames } from "./support.mjs";

const cell = (page, id, index) => page.locator('.cx-row[data-cx-id="' + id + '"] .cx-cell').nth(index);

async function open(page, rules, rows) {
  const view = healthView(2, { formatRules: rules, ...(rows ? { rows } : {}) });
  await page.route(ORIGIN + "/formatting-regressions", route => route.fulfill({ contentType: "text/html", body: formattingPage(view) }));
  await page.goto(ORIGIN + "/formatting-regressions");
  await page.evaluate(() => { window.grid = document.querySelector("[data-canopyx-host]").canopyx; return grid.ready; });
  await nextFrames(page);
}

test("setState rejects malformed formatting before changing the accepted query or presentation", async ({ page }) => {
  await open(page, [{ id: "original", column: "status", style: { tone: "info" } }]);
  const result = await page.evaluate(async () => {
    const before = grid.getState(), queries = [];
    document.querySelector("[data-canopyx-host]").addEventListener("canopyx:query", event => queries.push(event.detail.query));
    const state = { ...before, query: { ...before.query, search: "server-001" }, selection: ["srv-00001"], timeZone: "local",
      columns: before.columns.map(column => column.id === "status" ? { ...column, hidden: true } : column),
      formatRules: [{ id: "invalid", column: "unknown", style: { tone: "danger" } }] };
    const error = await grid.setState(state).then(() => "accepted", error => error.message);
    return { before, after: grid.getState(), queries, error };
  });
  expect(result.error).toContain("needs a declared column");
  expect(result.queries).toEqual([]);
  expect(result.after).toEqual(result.before);
});

test("setState stays pending until lazily loaded formatting rules have been applied", async ({ page }) => {
  await servePage(page, "<div id='health' style='height:400px'></div>");
  let requested = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(ORIGIN + "/canopyx-formatting.js", async route => {
    requested = true; await gate; return route.fulfill({ contentType: "text/javascript", body: read("canopyx-formatting.js") });
  });
  await page.evaluate(async view => {
    window.grid = CanopyX.createDataGrid(document.querySelector("#health"), { view }); await grid.ready;
    window.applied = false;
    window.applyState = grid.setState({ ...grid.getState(), query: { ...grid.getState().query, search: "server-001" },
      formatRules: [{ id: "restored", label: "Restored", column: "status", style: { tone: "danger", cue: "restored" } }] })
      .then(() => { window.applied = true; return grid.getFormatRules(); });
  }, healthView(2, { formatting: undefined, formatRules: undefined }));
  await expect.poll(() => requested).toBe(true);
  await nextFrames(page);
  expect(await page.evaluate(() => applied)).toBe(false);
  release();
  expect(await page.evaluate(() => applyState)).toEqual([{ id: "restored", label: "Restored", column: "status", style: { tone: "danger", cue: "restored" } }]);
  await expect(cell(page, "srv-00001", 1).locator(".cx-fmt-cue")).toHaveText("restored");
});

test("formatting screen reader descriptions fall back to the rule label and then identity", async ({ page }) => {
  await open(page, [{ id: "status-rule", label: "Status alert", column: "status", style: { tone: "warning" } },
    { id: "cpu-rule", column: "cpu", style: { tone: "danger" } }]);
  await expect(cell(page, "srv-00000", 1).locator(".cx-sr-only")).toHaveText(", Status alert");
  await expect(cell(page, "srv-00000", 2).locator(".cx-sr-only")).toHaveText(", cpu-rule");
});

test("drawer formatting merges only aspects from rules that allow details", async ({ page }) => {
  await open(page, [{ id: "grid-only", label: "Grid only", column: "status", details: false, style: { tone: "danger", badge: "private" } },
    { id: "details", label: "Drawer cue", column: "status", style: { cue: "public" } }]);
  await expect(cell(page, "srv-00000", 1).locator(".cx-fmt-badge")).toHaveText("private");
  await page.evaluate(() => grid.openDetails("srv-00000"));
  const value = page.locator(".cx-drawer dt", { hasText: "Status" }).locator("xpath=following-sibling::dd[1]");
  await expect(value.locator(".cx-fmt-cue")).toHaveText("public");
  await expect(value.locator(".cx-fmt-badge")).toHaveCount(0);
  await expect(value.locator(".cx-sr-only")).toHaveText(", Drawer cue");
  expect(await value.evaluate(element => element.style.getPropertyValue("--cx-fmt"))).toBe("");
});

test("stopIfTrue prevents later rules when its numeric paint has no value", async ({ page }) => {
  const rows = healthView(1).rows; rows[0].cells.cpu = null;
  await open(page, [{ id: "stop-empty", column: "cpu", style: { bar: { minimum: 0, maximum: 100 } }, stopIfTrue: true },
    { id: "after", column: "status", style: { badge: "later" } }], rows);
  await expect(cell(page, "srv-00000", 2).locator(".cx-fmt-bar")).toHaveCount(0);
  await expect(cell(page, "srv-00000", 1).locator(".cx-fmt-badge")).toHaveCount(0);
});

test("merged alert tones remain visible on cell text over bars and scales", async ({ page }) => {
  await open(page, [{ id: "cpu-alert", column: "cpu", style: { tone: "danger" } },
    { id: "cpu-bar", column: "cpu", style: { bar: { minimum: 0, maximum: 100, tone: "info" } } },
    { id: "memory-alert", column: "memory", style: { tone: "danger" } },
    { id: "memory-scale", column: "memory", style: { scale: { stops: [{ type: "number", value: 0, tone: "success" }, { type: "number", value: 100, tone: "warning" }] } } }]);
  const barCell = cell(page, "srv-00001", 2), scaleCell = cell(page, "srv-00001", 3);
  await expect(barCell.locator(".cx-fmt-bar")).toHaveCount(1);
  await expect(scaleCell).toHaveClass(/cx-fmt-scale/);
  for (const target of [barCell, scaleCell]) {
    await expect(target).toHaveClass(/cx-fmt-text/);
    expect(await target.evaluate(element => element.style.getPropertyValue("--cx-fmt"))).toContain("--cx-tone-danger");
    expect(await target.evaluate(element => getComputedStyle(element).color === getComputedStyle(element.closest("[data-canopyx-host]")).color)).toBe(false);
  }
});

test("overflowing numeric text is missing for typed formatting conditions", async ({ page }) => {
  const rows = healthView(2).rows; rows[0].cells.status = "1e999"; rows[1].cells.status = "25";
  await open(page, [{ id: "missing", column: "status", when: { operator: "and", filters: [{ column: "status", type: "number", operator: "isNull", values: [] }] }, style: { cue: "missing" } },
    { id: "number", column: "status", when: { operator: "and", filters: [{ column: "status", type: "number", operator: "gt", values: [0] }] }, style: { cue: "number" } }], rows);
  await expect(cell(page, "srv-00000", 1).locator(".cx-fmt-cue")).toHaveText("missing");
  await expect(cell(page, "srv-00001", 1).locator(".cx-fmt-cue")).toHaveText("number");
});

test("saving a highlight rule preserves its custom icon", async ({ page }) => {
  await open(page, [{ id: "custom", label: "Custom icon", column: "status", style: { tone: "warning", icon: "☀" } }]);
  await page.evaluate(() => grid.openFormatRules());
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Edit Custom icon" }).click();
  await expect(editor.getByRole("combobox", { name: "Icon", exact: true })).toHaveValue("☀");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByRole("button", { name: "Edit Custom icon" })).toBeVisible();
  expect(await page.evaluate(() => grid.getFormatRules()[0].style.icon)).toBe("☀");
});

test("saving threshold bands retains a bounded final band", async ({ page }) => {
  await open(page, [{ id: "bounded", label: "Bounded bands", column: "cpu", style: { bands: [
    { upperBound: 10, tone: "success", label: "Low" }, { upperBound: 20, tone: "warning", label: "Medium" }] } }]);
  await page.evaluate(() => grid.openFormatRules());
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Edit Bounded bands" }).click();
  await expect(editor.getByRole("spinbutton", { name: "Up to" })).toHaveCount(2);
  await expect(editor.getByRole("spinbutton", { name: "Up to" }).nth(1)).toHaveValue("20");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByRole("button", { name: "Edit Bounded bands" })).toBeVisible();
  expect(await page.evaluate(() => grid.getFormatRules()[0].style.bands)).toEqual([
    { upperBound: 10, tone: "success", label: "Low" }, { upperBound: 20, tone: "warning", label: "Medium" }]);
});

test("the bands editor disables Add at sixteen bands and re-enables it after removal", async ({ page }) => {
  const bands = Array.from({ length: 15 }, (_, index) => index === 14 ? { tone: "danger" } : { upperBound: index * 10, tone: "info" });
  await open(page, [{ id: "limit", label: "Band limit", column: "cpu", style: { bands } }]);
  await page.evaluate(() => grid.openFormatRules());
  const editor = page.locator(".cx-format-editor"), add = editor.getByRole("button", { name: "+ Band", exact: true });
  await editor.getByRole("button", { name: "Edit Band limit" }).click();
  await expect(editor.locator(".cx-format-band")).toHaveCount(15);
  await expect(add).toBeEnabled(); await add.click();
  await expect(editor.locator(".cx-format-band")).toHaveCount(16);
  await expect(add).toBeDisabled();
  await editor.getByRole("button", { name: "Remove band", exact: true }).nth(14).click();
  await expect(editor.locator(".cx-format-band")).toHaveCount(15);
  await expect(add).toBeEnabled();
});

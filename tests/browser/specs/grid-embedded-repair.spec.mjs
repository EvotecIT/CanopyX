import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const columns = [{ id: "name", title: "Name", kind: "text", width: 180 }, { id: "size", title: "Size", kind: "number", width: 100 },
  { id: "seen", title: "Seen", kind: "datetime", width: 200 }];
const grid = rows => ({ protocol: "canopyx/2", type: "grid", id: "repair", label: "Repair", source: { kind: "inline" }, rowHeight: 28, pageSize: 100,
  selection: "single", columns, rows });

async function open(page, view, host = "") {
  const warnings = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.route("http://canopyx.test/grid", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("data-canopyx-host data-cx-theme", "data-canopyx-host" + host + " data-cx-theme") }));
  await page.goto("http://canopyx.test/grid"); await page.waitForSelector("[data-cx-ready]");
  return warnings;
}

test("a mistyped cell is repaired and reported once per column instead of blanking the grid", async ({ page }) => {
  const warnings = await open(page, grid([
    { id: "a", cells: { name: 42, size: "17", seen: "2026-10-16T10:00:00Z" } },
    { id: "b", cells: { name: { value: 7, text: "Seven", tone: "success" }, size: "n/a", seen: "yesterday" } },
    { id: "c", cells: { name: ["not", "a", "cell"], size: 3, extra: "dropped" } },
    { id: "d", cells: { name: "Plain", size: 5 } }]));

  await expect(page.locator(".cx-canvas .cx-row")).toHaveCount(4);
  const rows = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.map(row => row.cells));
  expect(rows[0]).toMatchObject({ name: "42", size: 17 });
  expect(rows[1].name).toEqual({ value: "7", text: "Seven", tone: "success" });
  expect(rows[1].size).toEqual({ value: null, text: "n/a" });
  expect(rows[1].seen).toEqual({ value: null, text: "yesterday" });
  expect(rows[2].name).toBeNull();
  expect(rows[2]).not.toHaveProperty("extra");
  await expect(page.locator(".cx-canvas")).toContainText("Seven");
  await expect(page.locator(".cx-canvas")).toContainText("n/a");

  expect(warnings.filter(text => text.startsWith("CanopyX:")).sort()).toEqual([
    "CanopyX: 1 cell(s) in column extra did not fit the column and were coerced, emptied or dropped (first row c).",
    "CanopyX: 1 cell(s) in column seen did not fit the column and were coerced, emptied or dropped (first row b).",
    "CanopyX: 2 cell(s) in column size did not fit the column and were coerced, emptied or dropped (first row a).",
    "CanopyX: 3 cell(s) in column name did not fit the column and were coerced, emptied or dropped (first row a)."]);
});

test("embedded chrome draws no frame of its own and insets the toolbar by the card padding", async ({ page }) => {
  await open(page, grid([{ id: "a", cells: { name: "Plain", size: 5 } }]), " data-cx-chrome=\"embedded\" style=\"--hfx-card-padding-x:24px\"");
  const embedded = await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), style = getComputedStyle(host), toolbar = getComputedStyle(host.querySelector(".cx-toolbar"));
    const body = getComputedStyle(host.querySelector(".cx-grid")), first = host.querySelector(".cx-hrow > :first-child");
    if (getComputedStyle(first).paddingInlineStart !== "24px") return "the first column does not start at the card inset";
    return { border: style.borderTopWidth, radius: style.borderTopLeftRadius, background: style.backgroundColor, inset: toolbar.paddingLeft,
      gridSides: [body.borderLeftWidth, body.borderRightWidth, body.borderBottomWidth], gridRadius: body.borderTopLeftRadius, gridBackground: body.backgroundColor };
  });
  expect(embedded).toEqual({ border: "0px", radius: "0px", background: "rgba(0, 0, 0, 0)", inset: "24px", gridSides: ["0px", "0px", "0px"], gridRadius: "0px",
    gridBackground: "rgba(0, 0, 0, 0)" });
});

test("an empty embedded grid shows its empty state on the card surface", async ({ page }) => {
  await open(page, grid([]), " data-cx-chrome=\"embedded\"");
  // Every layer between the empty state and the card is see-through, so no panel of another colour shows behind it.
  const layers = await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), notice = host.querySelector(".cx-grid-notice:not([hidden])") ?? host.querySelector(".cx-row.cx-status");
    const colours = []; for (let element = notice; element && element !== host.parentElement; element = element.parentElement) colours.push(getComputedStyle(element).backgroundColor);
    return { found: !!notice, colours };
  });
  expect(layers.found).toBe(true);
  expect(new Set(layers.colours)).toEqual(new Set(["rgba(0, 0, 0, 0)"]));
});

test("a standalone grid keeps its own frame", async ({ page }) => {
  await open(page, grid([{ id: "a", cells: { name: "Plain", size: 5 } }]));
  const standalone = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector("[data-canopyx-host]"));
    return { border: style.borderTopWidth, radius: parseFloat(style.borderTopLeftRadius) };
  });
  expect(standalone.border).toBe("1px");
  expect(standalone.radius).toBeGreaterThan(0);
});

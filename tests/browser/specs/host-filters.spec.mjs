// A declared filter can be hidden from the toolbar: the host draws its own control, drives the filter through the
// API, and hears about every change, including the ones the grid makes itself.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "filters", label: "Filters", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }],
  filters: [{ id: "week", label: "Changed this week", flag: "changed-7d", ancestorFlag: "below-7d", hidden: true },
    { id: "month", label: "Changed this month", flag: "changed-30d", hidden: true },
    { id: "open", label: "Only open", flag: "open" }],
  source: { kind: "inline" },
  roots: [
    { id: "a", label: "A", flags: ["below-7d"], children: [{ id: "a/1", label: "A one", flags: ["changed-7d", "changed-30d"] }, { id: "a/2", label: "A two", flags: ["changed-30d", "open"] }] },
    { id: "b", label: "B", flags: ["open"] }] };

async function open(page) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => {
    window.events = [];
    document.querySelector(".cx-host").addEventListener("canopyx:filter", (event) => window.events.push(event.detail.active.join(",")));
  });
}

const ids = (page) => page.evaluate(() => document.querySelector(".cx-host").canopyx.visibleRows().map((row) => row.node.id));
const api = "document.querySelector('.cx-host').canopyx";

test("a hidden filter has no switch, and the host turns it on and off", async ({ page }) => {
  await open(page);
  await expect(page.locator(".cx-toolbar .cx-switch")).toHaveCount(1);
  await expect(page.getByLabel("Only open")).toBeVisible();
  await page.evaluate(`${api}.setFilterActive("week", true)`);
  await nextFrames(page);
  expect(await ids(page)).toEqual(["a", "a/1"]);
  expect(await page.evaluate(`${api}.getActiveFilters()`)).toEqual(["week"]);
  // The host switches its window: one hidden filter off, the other on.
  await page.evaluate(`${api}.setFilterActive("week", false); ${api}.setFilterActive("month", true)`);
  await nextFrames(page);
  expect(await ids(page)).toEqual(["a", "a/1", "a/2"]);
  // The toolbar's own switch combines with the host's filter and reports through the same event.
  await page.getByLabel("Only open").check();
  await nextFrames(page);
  expect(await ids(page)).toEqual(["a", "a/2"]);
  expect(await page.evaluate(() => window.events)).toEqual(["week", "", "month", "month,open"]);
  // Setting a filter to the state it has is not a change, and an id the view does not declare is an error.
  await page.evaluate(`${api}.setFilterActive("month", true)`);
  expect(await page.evaluate(() => window.events.length)).toBe(4);
  expect(await page.evaluate(`(() => { try { ${api}.setFilterActive("year", true); return "accepted"; } catch (e) { return e.message; } })()`)).toContain("no filter 'year'");
  // A predicate of the host's own replaces the declared filters, and the switch and the event say so.
  await page.evaluate(`${api}.setFilter((node) => node.id === "b")`);
  await nextFrames(page);
  expect(await ids(page)).toEqual(["b"]);
  await expect(page.getByLabel("Only open")).not.toBeChecked();
  expect(await page.evaluate(() => window.events[4])).toBe("");
});

test("the host hears when the grid drops the filters to reveal a row", async ({ page }) => {
  await open(page);
  await page.evaluate(`${api}.setFilterActive("week", true)`);
  await nextFrames(page);
  expect(await ids(page)).not.toContain("b");
  await page.evaluate(`${api}.expandPath(["b"])`);
  await nextFrames(page);
  expect(await ids(page)).toContain("b");
  expect(await page.evaluate(`${api}.getActiveFilters()`)).toEqual([]);
  expect(await page.evaluate(() => window.events)).toEqual(["week", ""]);
});

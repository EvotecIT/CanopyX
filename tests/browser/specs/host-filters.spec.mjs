// A declared filter can be hidden from the toolbar: the host draws its own control, drives the filter through the
// API, and hears about every change, including the ones the grid makes itself.
import { expect, test } from "@playwright/test";
import { nextFrames, openExample, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "filters", label: "Filters", rowHeight: 28, pageSize: 100, selection: "single",
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

test("the host switches from one filter to another in one step, with one event for the final set", async ({ page }) => {
  await open(page);
  await page.evaluate(`${api}.setActiveFilters(["week"])`);
  expect(await page.evaluate(() => window.events)).toEqual(["week"]);
  // Before, a filter bar that switched its choice turned one filter off and another on: two events, the first with neither.
  await page.evaluate(`${api}.setActiveFilters(["month"])`);
  await nextFrames(page);
  expect(await ids(page)).toEqual(["a", "a/1", "a/2"]);
  expect(await page.evaluate(() => window.events)).toEqual(["week", "month"]);
  // The same set again is not a change; the toolbar's switches follow the set; an undeclared id changes nothing.
  await page.evaluate(`${api}.setActiveFilters(["month", "month"])`);
  expect(await page.evaluate(() => window.events)).toEqual(["week", "month"]);
  await page.evaluate(`${api}.setActiveFilters(["month", "open"])`);
  await expect(page.getByLabel("Only open")).toBeChecked();
  expect(await page.evaluate(`(() => { try { ${api}.setActiveFilters(["week", "year"]); return "accepted"; } catch (e) { return e.message; } })()`)).toContain("no filter 'year'");
  expect(await page.evaluate(`${api}.getActiveFilters()`)).toEqual(["month", "open"]);
  await page.evaluate(`${api}.setActiveFilters([])`);
  await nextFrames(page);
  await expect(page.getByLabel("Only open")).not.toBeChecked();
  expect(await ids(page)).toEqual(["a", "b"]);
  expect(await page.evaluate(() => window.events)).toEqual(["week", "month", "month,open", ""]);
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

test("a page written with HiddenFilterIds leaves the switches out, and the host's bar switches filters in one step", async ({ page }) => {
  await openExample(page, "filter-bar.html");
  // The view declares both filters; the page, not the view, hides their switches.
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.view.filters.map((f) => f.id + ":" + !!f.hidden))).toEqual(["changed:true", "large:true"]);
  await expect(page.locator(".cx-toolbar .cx-switch")).toHaveCount(0);
  await page.evaluate(() => {
    window.events = [];
    document.querySelector(".cx-host").addEventListener("canopyx:filter", (event) => window.events.push(event.detail.active.join(",")));
  });
  const all = await ids(page);
  await page.getByRole("radio", { name: "Changed in the last 7 days" }).check();
  await nextFrames(page);
  const changed = await ids(page);
  expect(changed).not.toEqual(all);
  expect(changed.length).toBeGreaterThan(0);
  await page.getByRole("radio", { name: "Large files" }).check();
  await nextFrames(page);
  expect(await page.evaluate(() => window.events)).toEqual(["changed", "large"]);
  await expect(page.getByRole("radio", { name: "Changed in the last 7 days" })).not.toBeChecked();
  const large = await ids(page);
  expect(large).not.toEqual(changed);
  expect(large).not.toEqual(all);
  await page.getByRole("radio", { name: "All files" }).check();
  expect(await page.evaluate(() => window.events)).toEqual(["changed", "large", ""]);
  // When the declared filters are dropped from elsewhere (here a predicate of the host's own), the choice follows the event.
  await page.getByRole("radio", { name: "Large files" }).check();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setFilter(() => true));
  await expect(page.getByRole("radio", { name: "All files" })).toBeChecked();
});
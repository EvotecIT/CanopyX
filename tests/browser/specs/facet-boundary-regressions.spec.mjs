import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const section = page => page.locator('.cx-facet[data-cx-facet="value"]');
const filters = page => page.evaluate(api + ".getQuery().filters.filter(filter => filter.column === 'value')");
const ids = page => page.locator('.cx-row[data-cx-id]').evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")));
const instant = day => `2026-10-${String(day).padStart(2, "0")}T12:34:56.789Z`;

async function open(page, kind, conditions = [], extra = {}) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const values = [0, 5, 10, 15, 20].map(value => kind === "datetime" ? instant(value || 1) : value);
  const view = { protocol: "canopyx/2", type: "grid", id: "facet-boundaries", label: "Boundary records", timeZone: "utc",
    rowHeight: 34, pageSize: 50, selection: "none", columns: [{ id: "value", title: "Value", kind }, { id: "team", title: "Team", kind: "text" }],
    facets: { columns: [{ column: "value", bins: 4 }] }, source: { kind: "inline" },
    query: { filters: [{ column: "team", operator: "eq", values: ["Keep"] }, ...conditions] },
    rows: values.map((value, index) => ({ id: "r" + index, cells: { value, team: "Keep" } })), ...extra };
  await page.route("http://canopyx.test/boundaries", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/boundaries");
  await page.waitForSelector("[data-cx-ready]"); await page.evaluate(api + ".ready");
  await expect(section(page)).toBeVisible();
  await expect(kind === "text" ? section(page).getByRole("checkbox").first() : section(page).getByLabel("From")).toBeVisible();
  return errors;
}

for (const kind of ["number", "datetime"]) for (const strict of ["lower", "upper"]) {
  test(`${kind} range edits preserve the untouched strict ${strict} boundary`, async ({ page }) => {
    const lower = kind === "number" ? 5 : instant(5), upper = kind === "number" ? 15 : instant(15);
    const condition = { column: "value", operator: strict === "lower" ? "gt" : "lt", values: [strict === "lower" ? lower : upper] };
    const errors = await open(page, kind, [condition]);
    const field = section(page).getByLabel(strict === "lower" ? "To" : "From");
    await field.fill(kind === "number" ? strict === "lower" ? "15" : "5" : strict === "lower" ? "2026-10-15" : "2026-10-05");
    await field.press("Enter");
    const expected = strict === "lower" ? [condition, { column: "value", operator: "le", values: [kind === "number" ? 15 : "2026-10-15T23:59:59.999Z"] }] :
      [{ column: "value", operator: "ge", values: [kind === "number" ? 5 : "2026-10-05T00:00:00.000Z"] }, condition];
    await expect.poll(() => filters(page)).toEqual(expected);
    expect(await ids(page)).toEqual(strict === "lower" ? ["r2", "r3"] : ["r1", "r2"]);
    expect(await page.evaluate(api + ".getQuery().filters.find(filter => filter.column === 'team')")).toEqual({ column: "team", operator: "eq", values: ["Keep"] });
    expect(errors).toEqual([]);
  });
}

for (const kind of ["number", "datetime"]) test(`${kind} histogram keeps its untouched upper endpoint when From changes`, async ({ page }) => {
  const values = [0, 5, 10, 15, 20].map(value => kind === "datetime" ? instant(value || 1) : value);
  const errors = await open(page, kind, [], { rows: [...values.map((value, index) => ({ id: "r" + index, cells: { value, team: "Keep" } })),
    { id: "edge", cells: { value: kind === "number" ? 5 : "2026-10-06T06:34:56.789Z", team: "Keep" } }] });
  await section(page).locator('.cx-facet-bar[data-cx-bin="0"]').click();
  await expect.poll(async () => (await filters(page)).length).toBe(2);
  const before = await filters(page), upper = before[1];
  expect(upper.operator).toBe(kind === "number" ? "lt" : "le");
  const from = section(page).getByLabel("From"); await from.fill(kind === "number" ? "1" : "2026-10-02"); await from.press("Enter");
  await expect.poll(async () => (await filters(page))[0]?.values[0]).toBe(kind === "number" ? 1 : "2026-10-02T00:00:00.000Z");
  expect((await filters(page))[1]).toEqual(upper);
  // The first number bar ends at 5 exclusively; the date bar ends before its next start, rather than at the day's end.
  expect(await ids(page)).not.toContain("edge");
  expect(errors).toEqual([]);
});

test("two range field changes queued together keep both new inclusive bounds", async ({ page }) => {
  const errors = await open(page, "number");
  await section(page).evaluate(section => {
    for (const [index, value] of [[0, "5"], [1, "15"]]) {
      const input = section.querySelectorAll("input")[index]; input.value = value; input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect.poll(() => filters(page)).toEqual([{ column: "value", operator: "ge", values: [5] }, { column: "value", operator: "le", values: [15] }]);
  expect(await ids(page)).toEqual(["r1", "r2", "r3"]); expect(errors).toEqual([]);
});

test("choosing a histogram span replaces a strict lower edge instead of clearing the range", async ({ page }) => {
  const errors = await open(page, "number", [{ column: "value", operator: "gt", values: [0] }, { column: "value", operator: "lt", values: [5] }]);
  await section(page).locator('.cx-facet-bar[data-cx-bin="0"]').click();
  await expect.poll(() => filters(page)).toEqual([{ column: "value", operator: "ge", values: [0] }, { column: "value", operator: "lt", values: [5] }]);
  expect(await ids(page)).toEqual(["r0"]); expect(errors).toEqual([]);
});

for (const strict of ["lower", "upper"]) test(`clearing a range edge preserves the strict ${strict} condition on its other edge`, async ({ page }) => {
  const condition = { column: "value", operator: strict === "lower" ? "gt" : "lt", values: [strict === "lower" ? 5 : 15] };
  const other = { column: "value", operator: strict === "lower" ? "le" : "ge", values: [strict === "lower" ? 20 : 0] };
  const errors = await open(page, "number", [condition, other]);
  const field = section(page).getByLabel(strict === "lower" ? "To" : "From"); await field.fill(""); await field.press("Enter");
  await expect.poll(() => filters(page)).toEqual([condition]); expect(errors).toEqual([]);
});

for (const order of ["categories", "presenter"]) for (const sort of [undefined, "count", "value"]) {
  test(`facet ${order} ordering honors ${sort || "omitted automatic"} wire sort`, async ({ page }) => {
    const column = { id: "value", title: "Value", kind: "text", sortable: true, ...(order === "presenter" ? { presenter: { kind: "state", tones: { Rare: "danger", Common: "success" } } } : {}) };
    const errors = await open(page, "text", [], { columns: [column],
      facets: { columns: [sort === undefined ? "value" : { column: "value", sort }] },
      ...(order === "categories" ? { reporting: { ordering: { value: { text: "natural", categories: ["Rare", "Common"] } } } } : {}),
      query: {}, rows: ["Rare", "Common", "Common", "Common"].map((value, index) => ({ id: "r" + index, cells: { value } })) });
    await expect(section(page).locator(".cx-facet-text")).toHaveText(sort === "count" ? ["Common", "Rare"] : ["Rare", "Common"]);
    expect(errors).toEqual([]);
  });
}

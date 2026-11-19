import { expect, test } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

// Search over inline rows (docs/large-data.md): an ASCII term tests the raw cell text and finds exactly what folding finds,
// and a large row set searches in slices that yield to the page, with a newer search replacing an older one.
async function mount(page, rows) {
  await page.goto(exampleUrl("row-actions.html"));
  await page.waitForSelector("[data-cx-ready]", { state: "attached" });
  await page.evaluate(async rows => {
    const host = document.querySelector("[data-canopyx-host]");
    host.canopyx.destroy(); host.replaceChildren();
    const view = { protocol: "canopyx/2", type: "grid", id: "search", label: "Search", rowHeight: 32, pageSize: 50, selection: "none", search: true,
      columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }, { id: "count", title: "Count", kind: "number", sortable: true }],
      source: { kind: "inline" }, rows: typeof rows === "number"
        ? Array.from({ length: rows }, (_, i) => ({ id: "r" + String(i).padStart(6, "0"), cells: { name: (i % 1000 === 7 ? "Needle " : "Hay ") + i, count: i } }))
        : rows };
    window.grid = CanopyX.createDataGrid(host, { view });
    await window.grid.ready;
  }, rows);
}
const matches = (page, search) => page.evaluate(async search => {
  await window.grid.setQuery({ search });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return [...document.querySelectorAll(".cx-row[data-cx-id]")].map(row => row.getAttribute("data-cx-id"));
}, search);

test("an ASCII term finds what folding finds: case, the Kelvin sign and numbers, but not other letters", async ({ page }) => {
  await mount(page, [
    { id: "upper", cells: { name: "KELVIN", count: 1 } }, { id: "kelvin-sign", cells: { name: "\u212Aelvin scale", count: 2 } },
    { id: "accent", cells: { name: "K\u00e9lvin", count: 3 } }, { id: "number", cells: { name: "Other", count: 1234 } },
    { id: "symbols", cells: { name: "a.b[c]-(d)", count: 5 } }]);
  expect(await matches(page, "kelvin")).toEqual(["kelvin-sign", "upper"]);
  expect(await matches(page, "23")).toEqual(["number"]);
  expect(await matches(page, "b[c]-(")).toEqual(["symbols"]);
  // A term too long for a pattern still searches.
  expect(await matches(page, "a".repeat(40000))).toEqual([]);
  // A term that is not ASCII folds the cells, as before.
  expect(await matches(page, "k\u00c9l")).toEqual(["accent"]);
});

test("a large row set searches in slices, and a newer search replaces an older one still running", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await mount(page, 120000);
  const older = await page.evaluate(async () => {
    const older = window.grid.setQuery({ search: "hay 1" }).then(() => "settled", error => error.name);
    await new Promise(resolve => setTimeout(resolve));
    await window.grid.setQuery({ search: "needle" });
    return older;
  });
  expect(["settled", "AbortError"]).toContain(older);
  expect(await page.evaluate(() => window.grid.getQuery().search)).toBe("needle");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "r000007");
  await expect(page.locator(".cx-row[data-cx-id]", { hasText: "Hay" })).toHaveCount(0);
  expect(await matches(page, "needle 119007")).toEqual(["r119007"]);
  // A sliced search keeps the query's sort.
  await page.evaluate(() => window.grid.setQuery({ search: "needle", sort: [{ column: "count", direction: "desc" }] }));
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "r119007");
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl, nextFrames } from "./support.mjs";

// A grid written from typed C# records (docs/typed-grids.md): columns from member expressions, their kinds and titles,
// record fields from members, facets named through the same members, and empty cells for null values.
const api = (page, call) => page.evaluate(call => new Function("api", "return (" + call + ")(api);")(document.querySelector("[data-canopyx-host]").canopyx), call);

async function open(page, { dark = false, width = 1440 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(exampleUrl(dark ? "typed-grid-dark.html" : "typed-grid.html"));
  await page.waitForSelector("[data-cx-ready]");
  await api(page, "api => api.ready");
  await nextFrames(page);
}

test("columns come from the record's members with their titles and kinds", async ({ page }) => {
  await open(page);
  const view = await api(page, "api => api.view.columns.map(column => [column.id, column.title, column.kind])");
  expect(view).toEqual([["hostName", "Server", "text"], ["site", "Site", "text"], ["ownerTeam", "Team", "text"], ["health", "Health", "text"],
    ["cores", "Cores", "number"], ["loadAverage", "Load", "number"], ["diskBytes", "Disk", "number"], ["lastSeenUtc", "Last seen", "datetime"], ["uptime", "Last 12 hours", "text"]]);
  // The history member is a status strip: one toned segment per hour, and a summary as its raw value.
  expect(await api(page, "api => api.view.columns.find(column => column.id === 'uptime').presenter.kind")).toBe("statusStrip");
  expect(await api(page, "api => api.view.rows[0].cells.uptime.series.length")).toBe(12);
  expect(await api(page, "api => api.view.rows[0].cells.uptime.value")).toMatch(/^\d+ of 12 not up$/);
  expect(await api(page, "api => api.view.facets.columns")).toEqual(["site", "health", "loadAverage"]);
  expect(await api(page, "api => api.getPaging().matched")).toBe(120);
  // Sorting a number column orders by value.
  await api(page, "api => api.sort([{ column: 'cores', direction: 'desc' }])");
  await expect.poll(async () => {
    const id = await page.locator(".cx-row[data-cx-id]").first().getAttribute("data-cx-id");
    return api(page, `api => api.view.rows.find(row => row.id === ${JSON.stringify(id)}).cells.cores`);
  }).toBe(32);
});

test("Enter opens a record with its member fields, and a null value leaves its field empty", async ({ page }) => {
  await open(page);
  const first = page.locator(".cx-row[data-cx-id] .cx-cell").first();
  await first.click();
  await page.keyboard.press("Escape");
  await first.focus();
  await page.keyboard.press("Enter");
  const drawer = page.locator("dialog.cx-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Contact", { exact: true })).toBeVisible();
  const notes = await api(page, "api => api.view.rows.filter(row => !(row.fields && 'notes' in row.fields)).length");
  expect(notes).toBeGreaterThan(0);
});

for (const dark of [false, true]) for (const width of [1440, 390]) {
  test(`reads well and passes axe (${dark ? "dark" : "light"}, ${width})`, async ({ page }) => {
    await open(page, { dark, width });
    await expect(page.getByRole("grid", { name: "Servers" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: process.env.CANOPYX_EVIDENCE + `/typed-grid-${dark ? "dark" : "light"}-${width}.png` });
  });
}

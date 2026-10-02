// Date and time columns show UTC or the reader's own time zone, switchable at run time, with the other zone as the
// tooltip. The browser runs in Europe/Warsaw, which is two hours ahead of UTC on the dates used here.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

test.use({ timezoneId: "Europe/Warsaw" });

const view = (extra) => ({ protocol: "canopyx/2", type: "view", id: "zones", label: "Zones", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 200, kind: "text" }, { id: "changed", title: "Changed", width: 220, kind: "datetime", sortable: true }],
  source: { kind: "inline" },
  roots: [
    { id: "plain", label: "Plain", cells: { changed: "2026-09-27T10:15:00Z" } },
    { id: "late", label: "Late", cells: { changed: "2026-09-27T23:30:00.500Z" } },
    { id: "titled", label: "Titled", cells: { changed: { value: "2026-09-26T08:00:00Z", title: "Host tooltip" } } },
    { id: "text", label: "Text", cells: { changed: { value: "2026-09-25T08:00:00Z", text: "two days ago" } } },
    { id: "odd", label: "Odd", cells: { changed: "not a date" } }
  ], ...extra });

async function open(page, data) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

const cell = (page, id) => page.locator('[data-cx-id="' + id + '"] [aria-colindex="2"]');
const api = "document.querySelector('.cx-host').canopyx";

test("dates show in UTC by default, with the local time as the tooltip", async ({ page }) => {
  await open(page, view());
  await expect(cell(page, "plain")).toHaveText("2026-09-27 10:15 UTC");
  await expect(cell(page, "plain")).toHaveAttribute("title", "2026-09-27 12:15 local time");
  // Half past eleven at night in UTC is already the next day in Warsaw.
  await expect(cell(page, "late")).toHaveAttribute("title", "2026-09-28 01:30 local time");
  expect(await page.evaluate(`${api}.getTimeZone()`)).toBe("utc");
});

test("the host switches to local time and back without rebuilding the cells", async ({ page }) => {
  await open(page, view());
  await page.evaluate(`window.before = document.querySelector('[data-cx-id="plain"] [aria-colindex="2"]'); ${api}.setTimeZone("local")`);
  await nextFrames(page);
  await expect(cell(page, "plain")).toHaveText("2026-09-27 12:15");
  await expect(cell(page, "plain")).toHaveAttribute("title", "2026-09-27 10:15 UTC");
  await expect(cell(page, "late")).toHaveText("2026-09-28 01:30");
  // A host tooltip and host text stay as they are, and a value that is not a date is shown as written.
  await expect(cell(page, "titled")).toHaveText("2026-09-26 10:00");
  await expect(cell(page, "titled")).toHaveAttribute("title", "Host tooltip");
  await expect(cell(page, "text")).toHaveText("two days ago");
  expect(await cell(page, "text").getAttribute("title")).toBeNull();
  await expect(cell(page, "odd")).toHaveText("not a date");
  expect(await cell(page, "odd").getAttribute("title")).toBeNull();
  expect(await page.evaluate(`window.before === document.querySelector('[data-cx-id="plain"] [aria-colindex="2"]') && ${api}.getTimeZone()`)).toBe("local");
  // The print outline follows the grid.
  expect(await page.evaluate(`${api}.toOutline()`)).toContain("2026-09-27 12:15<");
  await page.evaluate(`${api}.setTimeZone("utc")`);
  await nextFrames(page);
  await expect(cell(page, "plain")).toHaveText("2026-09-27 10:15 UTC");
  expect(await page.evaluate(`(() => { try { ${api}.setTimeZone("Europe/Warsaw"); return "accepted"; } catch (e) { return e.message; } })()`)).toContain("'local' or 'utc'");
});

test("a view can start in local time, and sorting still follows the moment, not the text", async ({ page }) => {
  await open(page, view({ timeZone: "local" }));
  await expect(cell(page, "plain")).toHaveText("2026-09-27 12:15");
  expect(await page.evaluate(`${api}.getTimeZone()`)).toBe("local");
  await page.getByRole("button", { name: "Changed" }).click();
  // Sorting schedules a paint; observe the rendered order after that paint rather than the click's task.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")]
    .sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
    .map((row) => row.getAttribute("data-cx-id")).slice(0, 4)))
    .toEqual(["text", "titled", "plain", "late"]);
});

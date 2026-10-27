import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

test.use({ timezoneId: "America/New_York" });
for (const timeZone of ["utc", "local"]) test(`print header and date footer use the grid format in ${timeZone}`, async ({ page }) => {
  const instant = "2026-10-25T15:00:00.000Z";
  await page.clock.setFixedTime(new Date(instant));
  await page.addInitScript(() => { window.print = () => { window.parent.printedHtml = document.documentElement.outerHTML; }; });
  const view = { protocol: "canopyx/2", type: "grid", id: "print-date", label: "Work items", source: { kind: "inline" },
    rowHeight: 30, pageSize: 10, selection: "none", timeZone, layout: { mode: "cards" },
    columns: [{ id: "name", title: "Name", kind: "text", width: 180 }, { id: "due", title: "Due", kind: "datetime", width: 180 }],
    rows: [{ id: "one", cells: { name: "Item 1", due: instant } }] };
  await page.route("http://canopyx.test/print-date", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/print-date"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    const csv = await api.toCsv({ scope: "all" });
    await api.print({ scope: "all" });
    const doc = new DOMParser().parseFromString(window.printedHtml, "text/html");
    return { header: doc.querySelector("header p").textContent, date: doc.querySelector("footer span:last-child").textContent, csv };
  });
  expect(result.date).toBe(timeZone === "utc" ? "2026-10-25 15:00 UTC" : "2026-10-25 11:00");
  expect(result.header.endsWith(" · " + result.date)).toBe(true);
  expect(result.csv).toContain(result.date);
});

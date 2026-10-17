// Date values remain UTC-backed dates, while presentation and selection use the reader's calendar days. These cases mount
// the public runtime and inspect actual geometry, focus, links, notices and export bytes across the affected views.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";
import { api, capture, openBuilt } from "./calendar-support.mjs";

const day = text => Date.parse(text + "T00:00:00Z") / 86400000;
const row = (id, start, end, extra = {}) => ({ id, cells: { title: id, start, end, resource: "r1", ...extra } });
const resources = { protocol: "canopyx/2", type: "view", id: "temporal-resources", label: "Resources", rowHeight: 34,
  source: { kind: "inline" }, columns: [{ id: "name", title: "Resource" }, { id: "events", title: "Events", kind: "number" },
    { id: "busy", title: "Busy", kind: "number" }, { id: "overlap", title: "Overlap", kind: "number" }],
  roots: [{ id: "group", label: "Group", expanded: true, children: [{ id: "r1", label: "One" }, { id: "r2", label: "Two" }] }] };

function pageHtml(rows, calendar = {}) {
  const view = { protocol: "canopyx/2", type: "grid", id: "temporal", label: "Calendar", rowHeight: 34, pageSize: 200,
    selection: "single", search: true, source: { kind: "inline" }, rows,
    columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "start", title: "Start", kind: "datetime" },
      { id: "end", title: "End", kind: "datetime" }, { id: "allDay", title: "All day", kind: "text" },
      { id: "resource", title: "Resource", kind: "text" }, { id: "rule", title: "Rule", kind: "text" },
      { id: "exceptions", title: "Exceptions", kind: "text" }, { id: "display", title: "Display", kind: "text" },
      { id: "series", title: "Series", kind: "text" }, { id: "rid", title: "Recurrence id", kind: "datetime" }],
    calendar: { start: "start", end: "end", title: "title", allDay: "allDay", resource: "resource", recurrence: "rule",
      exceptions: "exceptions", display: "display", series: "series", recurrenceId: "rid", date: "2026-10-16", firstDay: 1,
      view: "day", views: ["day", "week", "month", "year", "timeline"], resources: { view: resources }, ...calendar } };
  // This fixture opts into linked-selection events; preload its actual lazy part, just as an emitted linked page does.
  const assets = new URL("../../../CanopyX.Html/Assets/", import.meta.url), linked = "<style>" + fs.readFileSync(new URL("canopyx-link.css", assets), "utf8") +
    "</style><script>" + fs.readFileSync(new URL("canopyx-link.js", assets), "utf8") + "</script>";
  return viewPage(view).replace("</head>", linked + '<script>window.calendarErrors = []; CanopyX.configure("temporal", { linkEvents: true, onError: d => window.calendarErrors.push(d.error.message) });</script></head>');
}
async function links(page) {
  await page.evaluate(() => { window.links = []; document.querySelector("[data-canopyx-host]").addEventListener("canopyx:linkchange", event => window.links.push(event.detail)); });
}

for (const item of [
  { zone: "America/New_York", date: "2026-11-01", end: "2026-11-02", previous: "2026-10-31", from: "2026-11-01T04:00:00Z", hours: 25 },
  { zone: "Pacific/Auckland", date: "2026-09-27", end: "2026-09-28", previous: "2026-09-26", from: "2026-09-26T12:00:00Z", hours: 23 }
]) test("all-day timeline dates align with zone-day bars, capacity, totals and linked selection - " + item.zone, async ({ page, browserName }) => {
  const from = Date.parse(item.from), rows = [row("whole-day", item.date + "T00:00:00Z", item.end + "T00:00:00Z", { allDay: true }),
    row("previous-day", item.previous + "T00:00:00Z", item.date + "T00:00:00Z", { allDay: true }),
    row("timed", new Date(from + 1800000).toISOString(), new Date(from + 5400000).toISOString()),
    row("background", item.date + "T00:00:00Z", item.end + "T00:00:00Z", { allDay: true, display: "background" })];
  await openBuilt(page, "date-axis.html", pageHtml(rows, { view: "timeline", date: item.date, timeZone: item.zone,
    span: { count: 1, unit: "day" }, zoom: "day", resources: { view: resources, width: 520, aggregates: { events: "count", busy: "busy", overlap: "overlap" } } }));
  await links(page);
  const leaf = page.locator('.cx-tl-lane[data-cx-resource="r1"]');
  const shape = await leaf.evaluate(lane => {
    const cell = lane.querySelector(".cx-tl-cell").getBoundingClientRect(), bar = lane.querySelector('.cx-cal-allday').getBoundingClientRect();
    const shade = lane.querySelector(".cx-tl-bg").getBoundingClientRect();
    return { barLeft: Math.round((bar.left - cell.left) * 100) / 100, barWidth: Math.round(bar.width * 100) / 100,
      shadeLeft: Math.round((shade.left - cell.left) * 100) / 100, shadeWidth: Math.round(shade.width * 100) / 100, cellWidth: cell.width };
  });
  await leaf.locator(".cx-tl-cell").focus(); await page.keyboard.press("Space");
  const actual = await page.evaluate(() => ({ keys: window.links.at(-1)?.keys.sort(), raw: document.querySelector("[data-canopyx-host]").canopyx.getCalendarEvents().find(event => event.record === "whole-day") }));
  const exported = await api(page, "async api => (await api.exportCalendar()).text");
  await capture(page, "calendar-temporal-date-" + item.zone.replaceAll("/", "-") + "-" + browserName);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await nextFrames(page);
  const print = await page.locator('.cx-tl-print-row').filter({ has: page.locator('.cx-tl-print-name', { hasText: /^One$/ }) }).evaluate(line => {
    const lane = line.querySelector('.cx-tl-print-lane').getBoundingClientRect(), bar = [...line.querySelectorAll('.cx-tl-print-bar')].find(node => node.title.startsWith("whole-day"));
    const bounds = bar?.getBoundingClientRect();
    return bounds ? { left: Math.round(bounds.left - lane.left), percent: Math.round(bounds.width / lane.width * 100) } : null;
  });
  await capture(page, "calendar-temporal-date-" + item.zone.replaceAll("/", "-") + "-print-" + browserName);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await test.info().attach("date-geometry", { body: JSON.stringify({ shape, print, actual }), contentType: "application/json" });
  expect(shape).toEqual({ barLeft: 0, barWidth: 44, shadeLeft: 0, shadeWidth: 44, cellWidth: 44 });
  expect(print).toEqual({ left: 0, percent: 100 });
  await expect(page.locator('.cx-tl-tree .cx-row[data-cx-id="group"]')).toContainText(item.hours + " h");
  await expect(page.locator('.cx-tl-lane[data-cx-resource="group"] .cx-tl-heat')).toHaveText("2");
  expect(actual.keys).toEqual(["timed", "whole-day"]);
  expect(actual.raw).toMatchObject({ start: item.date + "T00:00:00Z", end: item.end + "T00:00:00Z", allDay: true });
  expect(exported).toContain("DTSTART;VALUE=DATE:" + item.date.replaceAll("-", ""));
  expect(await page.evaluate(() => window.calendarErrors)).toEqual([]);
});

for (const allDay of [false, true]) test("repainting resource columns restores the focused " + (allDay ? "all-day cell" : "timed slot"), async ({ page, browserName }) => {
  await openBuilt(page, "resource-focus.html", pageHtml([row("one", "2026-10-16T09:00:00Z", "2026-10-16T10:00:00Z")], { minTime: "08:00", maxTime: "12:00" }));
  const selector = allDay ? '.cx-cal-allcell[data-cx-resource="r2"]' : '.cx-cal-slot[data-cx-resource="r2"][data-cx-minutes="540"]';
  await page.locator(selector).focus();
  await api(page, "api => api.setCalendarDate('2026-10-16')");
  await expect(page.locator(selector)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator(selector)).toHaveAttribute("aria-selected", "true");
  await capture(page, "calendar-temporal-resource-focus-" + (allDay ? "all-day" : "timed") + "-" + browserName);
});

test("pointer and keyboard all-day resource selection emit the same bounded keys", async ({ page, browserName }) => {
  await openBuilt(page, "resource-selection.html", pageHtml([row("one", "2026-10-16T09:00:00Z", "2026-10-16T10:00:00Z"),
    row("two", "2026-10-16T09:00:00Z", "2026-10-16T10:00:00Z", { resource: "r2" })], { minTime: "08:00", maxTime: "12:00" }));
  await links(page);
  const cell = page.locator('.cx-cal-allcell[data-cx-resource="r2"]');
  await cell.click();
  const pointer = await page.evaluate(() => window.links.at(-1));
  await api(page, "api => api.clearCalendarSelection()");
  await cell.focus(); await page.keyboard.press("Space");
  const keyboard = await page.evaluate(() => window.links.at(-1));
  expect(pointer).toMatchObject({ keys: ["two"], values: { resource: ["r2"] } });
  expect(pointer).toEqual(keyboard);
  await capture(page, "calendar-temporal-resource-selection-" + browserName);
});

for (const view of ["week", "year", "timeline"]) test("validRange disables outside dates in " + view + " selection", async ({ page, browserName }) => {
  await openBuilt(page, "bounded-" + view + ".html", pageHtml([], { view, validRange: { start: "2026-10-15", end: "2026-10-18" }, minTime: "08:00", maxTime: "12:00" }));
  await links(page);
  const invalid = view === "week" ? '.cx-cal-slot[data-cx-day="' + day("2026-10-13") + '"][data-cx-minutes="540"][data-cx-resource="r1"]' :
    view === "year" ? '.cx-cal-yday[data-cx-day="' + day("2026-10-13") + '"]' : '.cx-tl-lane[data-cx-resource="r1"] .cx-tl-cell[data-cx-day="' + day("2026-10-13") + '"]';
  const cell = page.locator(invalid);
  // A disabled date still receives a physical pointer hit. Locator.click intentionally refuses aria-disabled elements.
  await cell.scrollIntoViewIfNeeded();
  const box = await cell.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await api(page, "api => api.getCalendar().view")).toBe(view);
  await cell.focus(); await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.links)).toEqual([]);
  await expect(cell).toHaveAttribute("aria-disabled", "true");
  if (view !== "year") {
    const valid = invalid.replace(String(day("2026-10-13")), String(day("2026-10-16")));
    await page.locator(valid).focus(); await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.links.filter(item => item.action === "select").length)).toBe(1);
  }
  await capture(page, "calendar-temporal-valid-range-" + view + "-" + browserName);
});

for (const zoom of ["week", "month", "quarter"]) test("a coarse timeline keeps keyboard access without selecting outside validRange - " + zoom, async ({ page, browserName }) => {
  await openBuilt(page, "bounded-coarse-" + zoom + ".html", pageHtml([row("inside", "2026-10-16T09:00:00Z", "2026-10-16T10:00:00Z")],
    { view: "timeline", zoom, details: "popover", validRange: { start: "2026-10-15", end: "2026-10-18" } }));
  await links(page);
  const canvas = page.locator(".cx-tl-canvas"), entry = canvas.locator('[tabindex="0"]');
  await expect(entry).toHaveCount(1);
  await entry.focus(); await page.keyboard.press("ArrowDown");
  const focused = canvas.locator('.cx-tl-cell[data-cx-resource="r1"][tabindex="0"]');
  await expect(focused).toBeFocused();
  await expect(focused).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.links)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page.locator('.cx-cal-ev[data-cx-event="inside"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "inside", exact: true })).toBeVisible();
  await capture(page, "calendar-temporal-coarse-keyboard-" + zoom + "-" + browserName);
  await expect(canvas.locator('.cx-tl-cell[aria-disabled="true"][tabindex="0"]')).toHaveCount(0);
});

for (const item of [{ name: "overflow", count: 9, exceptions: "", expected: 5, truncated: true },
  { name: "exact", count: 5, exceptions: "", expected: 5, truncated: false },
  { name: "excluded-exact", count: 7, exceptions: "2026-10-01,2026-10-02", expected: 5, truncated: false },
  { name: "excluded-overflow", count: 8, exceptions: "2026-10-01,2026-10-02", expected: 5, truncated: true },
  { name: "override-exact", count: 8, exceptions: "2026-10-01,2026-10-02", expected: 5, truncated: false, override: true },
  { name: "all-day-overflow", count: 9, exceptions: "", expected: 5, truncated: true, allDay: true }]) {
  test("one series reports occurrence completeness after exclusions - " + item.name, async ({ page, browserName }) => {
    const rows = [row("series", "2026-10-01T" + (item.allDay ? "00:00:00Z" : "09:00:00Z"), "2026-10-" + (item.allDay ? "02T00:00:00Z" : "01T10:00:00Z"),
      { rule: "FREQ=DAILY;COUNT=" + item.count, exceptions: item.exceptions, ...(item.allDay ? { allDay: true } : {}) })];
    if (item.override) rows.push(row("moved", "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", { series: "series", rid: "2026-10-03T09:00:00Z" }));
    await openBuilt(page, "occurrence-limit.html", pageHtml(rows, { view: "month", limit: 5, timeZone: "America/New_York" }));
    expect((await api(page, "api => api.getCalendarEvents()")).length).toBe(item.expected);
    const notice = page.locator(".cx-cal-notice");
    if (item.truncated) await expect(notice).toHaveText(/narrow|limit|first|showing/i); else await expect(notice).toHaveText("");
    await capture(page, "calendar-temporal-completeness-" + item.name + "-" + browserName);
  });
}

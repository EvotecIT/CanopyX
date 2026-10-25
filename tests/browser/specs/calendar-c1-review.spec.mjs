import { test, expect } from "@playwright/test";
import { calendarC1Page } from "./calendar-c1-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";
import { openBuilt } from "./calendar-support.mjs";

test("timeline resource selection includes secondary assignments in linked keys", async ({ page }) => {
  await openBuilt(page, "timeline-secondary.html", calendarC1Page({ count: 3, links: true, view: "timeline", events: [
    { id: "shared", title: "Shared", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resourceIds: ["room-0", "room-2"] }
  ] }));
  await page.evaluate(() => { window.selections = []; document.getElementById("cal").addEventListener("canopyx:linkchange", event => window.selections.push(event.detail)); });
  await page.locator('.cx-tl-tree .cx-row[data-cx-id="room-2"] .cx-text').click();
  await expect.poll(() => page.evaluate(() => window.selections.at(-1)?.keys)).toEqual(["shared"]);
});

test("resourceIds-only calendars move and create assignments through the writer", async ({ page }) => {
  await openBuilt(page, "ids-only.html", calendarEditPage({ inline: true, resources: true, resourceIdsOnly: true, create: true }));
  const event = page.locator('.cx-cal-ev[data-cx-record="event"]');
  await event.focus(); await page.keyboard.press("F2"); await page.keyboard.press("Alt+ArrowDown"); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.commits[0]?.rows[0]?.values.assignments)).toBe('["Room B"]');
  const slot = page.locator('.cx-cal-slot[data-cx-resource="Room B"][data-cx-minutes="660"]').last();
  await slot.focus(); await page.keyboard.press("n");
  await page.locator('.cx-cal-create-input').fill("New assignment");
  await page.locator('.cx-cal-create-add').click();
  await expect.poll(() => page.evaluate(() => window.commits.find(batch => batch.rows.some(row => row.op === "insert"))?.rows.find(row => row.op === "insert")?.values.assignments)).toBe('["Room B"]');
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("date-only overrides retain the original timed recurrence identity", async ({ page }) => {
  await openBuilt(page, "timed-original.html", calendarC1Page({ count: 2, view: "month", events: [
    { id: "series", title: "Master", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", recurrence: "FREQ=DAILY;COUNT=3" },
    { id: "override", title: "All-day exception", start: "2026-10-17", end: "2026-10-18", series: "series", recurrenceId: "2026-10-17T09:00:00Z" }
  ] }));
  const events = await page.evaluate(() => window.api.getCalendarEvents());
  expect(events.filter(event => event.record === "series").map(event => event.start)).toEqual(["2026-10-16T09:00:00Z", "2026-10-18T09:00:00Z"]);
  expect(events.filter(event => event.record === "override")).toHaveLength(1);
  const text = await page.evaluate(async () => (await window.api.exportCalendar()).text);
  expect(text).toContain("RECURRENCE-ID:20261017T090000Z\r\n");
  await page.route("http://canopyx.test/roundtrip.ics", route => route.fulfill({ contentType: "text/calendar", body: text }));
  await openBuilt(page, "timed-roundtrip.html", calendarC1Page({ count: 2, view: "month", events: [], sources: [{ id: "roundtrip", label: "Round trip", ics: "roundtrip.ics" }] }));
  const roundtrip = await page.evaluate(() => window.api.getCalendarEvents());
  expect(roundtrip.filter(event => event.title === "Master").map(event => event.start)).toEqual(["2026-10-16T09:00:00Z", "2026-10-18T09:00:00Z"]);
  expect(roundtrip.filter(event => event.title === "All-day exception")).toHaveLength(1);
});

test("week resource picker names the dates and resources across a day boundary", async ({ page }) => {
  await openBuilt(page, "week-picker-label.html", calendarC1Page({ count: 100, view: "week" }));
  await page.locator('.cx-cal-rpick-select').selectOption("96");
  await expect(page.locator('.cx-cal-rpick-select')).toHaveAccessibleName(/Mon.*12.*Room 97.*Tue.*13.*Room 04/);
});

test("timed replacements of all-day series retain a date recurrence identity on export and import", async ({ page }) => {
  await openBuilt(page, "date-original.html", calendarC1Page({ count: 2, view: "month", events: [
    { id: "series", title: "Master", start: "2026-10-16", end: "2026-10-17", recurrence: "FREQ=DAILY;COUNT=3" },
    { id: "override", title: "Timed exception", start: "2026-10-17T11:00:00Z", end: "2026-10-17T12:00:00Z", series: "series", recurrenceId: "2026-10-17T00:00:00Z" }
  ] }));
  const text = await page.evaluate(async () => (await window.api.exportCalendar()).text);
  expect(text).toContain("RECURRENCE-ID;VALUE=DATE:20261017\r\n");
  await page.route("http://canopyx.test/date-roundtrip.ics", route => route.fulfill({ contentType: "text/calendar", body: text }));
  await openBuilt(page, "date-roundtrip.html", calendarC1Page({ count: 2, view: "month", events: [], sources: [{ id: "roundtrip", label: "Round trip", ics: "date-roundtrip.ics" }] }));
  const events = await page.evaluate(() => window.api.getCalendarEvents());
  expect(events.filter(event => event.title === "Master")).toHaveLength(2);
  expect(events.filter(event => event.title === "Timed exception")).toHaveLength(1);
});

test("visible JSON feeds limit concurrent requests while loading every small source", async ({ page }) => {
  let started = 0, active = 0, peak = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("http://canopyx.test/bounded-feed/**", async route => {
    started++; active++; peak = Math.max(peak, active);
    try { await gate; await route.fulfill({ json: [{ id: "one", title: "Booking", start: "2026-10-16T09:00:00Z" }] }); }
    finally { active--; }
  });
  const loaded = openBuilt(page, "bounded-feeds.html", calendarC1Page({ count: 2, events: [], sources: Array.from({ length: 8 }, (_, i) => ({ id: "s" + i, label: "Feed " + i, url: "/bounded-feed/" + i })) }));
  try { await expect.poll(() => started).toBeGreaterThanOrEqual(4); expect(peak).toBeLessThanOrEqual(4); }
  finally { release(); await loaded; }
  await expect.poll(() => page.evaluate(() => window.api.getCalendarEvents().length)).toBe(8);
});

test("JSON feeds enforce the combined row budget including cached answers", async ({ page }) => {
  await page.route("http://canopyx.test/row-budget/**", route => route.fulfill({ json: Array.from({ length: 3 }, (_, i) => ({ id: "e" + i, title: "Booking", start: "2026-10-16T09:00:00Z" })) }));
  await openBuilt(page, "feed-row-budget.html", calendarC1Page({ count: 2, events: [], calendar: { limit: 5 }, sources: [
    { id: "a", label: "A", url: "/row-budget/a" }, { id: "b", label: "B", url: "/row-budget/b" }
  ] }));
  expect(await page.evaluate(() => window.errors.join(" "))).toContain("combined event limit");
  expect(await page.evaluate(() => window.api.getCalendarEvents().length)).toBeLessThanOrEqual(5);
  await page.evaluate(async () => { await window.api.setCalendarSource("b", false); await window.api.setCalendarSource("b", true); });
  expect(await page.evaluate(() => window.api.getCalendarEvents().length)).toBeLessThanOrEqual(5);
});

test("JSON feeds bound total streamed bytes across individually valid sources", async ({ page }) => {
  const items = Array.from({ length: 400 }, (_, i) => ({ id: "e" + i, title: "Booking", description: "界".repeat(4000), start: "2026-10-16T09:00:00Z" }));
  await page.route("http://canopyx.test/byte-budget/**", route => route.fulfill({ json: items }));
  await openBuilt(page, "feed-byte-budget.html", calendarC1Page({ count: 2, events: [], sources: Array.from({ length: 4 }, (_, i) => ({ id: "s" + i, label: "Feed " + i, url: "/byte-budget/" + i })) }));
  expect(await page.evaluate(() => window.errors.join(" "))).toContain("combined 16 MB limit");
  expect(await page.evaluate(() => window.api.getCalendarEvents().length)).toBeLessThan(1600);
});

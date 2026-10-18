// The public same-origin source importer must preserve globally scoped zones and skip malformed present date properties.
import { test, expect } from "@playwright/test";
import { calendarRangePage } from "./calendar-range-support.mjs";
import { openBuilt, api, capture } from "./calendar-support.mjs";

const event = (...lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const calendar = (...events) => ["BEGIN:VCALENDAR", ...events, "END:VCALENDAR"].join("\r\n");
const malformed = ["DTSTART:", "DTSTART:20260230T090000Z", "DTSTART;VALUE=DATE:20261030T090000Z",
  "DTEND:", "DTEND:20260230T090000Z", "DTEND;VALUE=DATE:20261030T090000Z",
  "RECURRENCE-ID:", "RECURRENCE-ID:20260230T090000Z", "RECURRENCE-ID;VALUE=DATE:20261030T090000Z",
  "EXDATE:20260230T090000Z", "EXDATE;VALUE=DATE:20261030T090000Z"];

async function loadImport(page, text, date = "2026-11-01") {
  await page.addInitScript(() => {
    window.imported = []; window.importErrors = [];
    document.addEventListener("canopyx:calendarImport", event => window.imported.push(event.detail), true);
    document.addEventListener("canopyx:error", event => window.importErrors.push(event.detail.error.message), true);
  });
  await page.route("http://canopyx.test/regressions.ics", route => route.fulfill({ contentType: "text/calendar", body: text }));
  await openBuilt(page, "import-regressions.html", calendarRangePage([], { inline: true, calendar: {
    date, view: "month", views: ["month"], timeZone: "utc",
    sources: [{ id: "import", label: "Imported", ics: "regressions.ics" }]
  } }));
}

for (const prefix of ["", "/"]) {
  test("same-origin imports normalize globally scoped TZIDs across timestamps and DST - " + (prefix || "ordinary"), async ({ page }, testInfo) => {
    const zone = prefix + "America/New_York", property = (name, value) => name + ";TZID=" + zone + ":" + value;
    const text = calendar(
      event("UID:series", "SUMMARY:Series", property("DTSTART", "20261030T090000"), property("DTEND", "20261030T100000"),
        "RRULE:FREQ=DAILY;COUNT=4", property("EXDATE", "20261101T090000")),
      event("UID:series", "SUMMARY:Moved", property("RECURRENCE-ID", "20261031T090000"), property("DTSTART", "20261031T110000"), property("DTEND", "20261031T120000")),
      event("UID:utc", "SUMMARY:UTC control", "DTSTART:20261030T150000Z"),
      event("UID:date", "SUMMARY:All day", "DTSTART;VALUE=DATE:20261102"));
    await testInfo.attach("source.ics", { body: text, contentType: "text/calendar" });
    await loadImport(page, text);
    await capture(page, "calendar-import-global-zone-" + (prefix ? "prefixed" : "ordinary") + "-" + testInfo.project.name);
    const values = await api(page, "api => api.getCalendarEvents().map(({ title, start, end, allDay }) => ({ title, start, end, allDay })).sort((a,b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))");
    expect(values).toEqual([
      { title: "Series", start: "2026-10-30T13:00:00Z", end: "2026-10-30T14:00:00Z", allDay: false },
      { title: "UTC control", start: "2026-10-30T15:00:00Z", end: "2026-10-30T15:00:00Z", allDay: false },
      { title: "Moved", start: "2026-10-31T15:00:00Z", end: "2026-10-31T16:00:00Z", allDay: false },
      { title: "All day", start: "2026-11-02T00:00:00Z", end: "2026-11-03T00:00:00Z", allDay: true },
      { title: "Series", start: "2026-11-02T14:00:00Z", end: "2026-11-02T15:00:00Z", allDay: false }
    ]);
    expect(await page.evaluate(() => window.imported.map(({ events, skipped, notes }) => ({ events, skipped, notes })))).toEqual([{ events: 4, skipped: 0, notes: [] }]);
    expect(await page.evaluate(() => window.importErrors)).toEqual([]);
  });
}

test("same-origin imports skip malformed present date properties and retain valid missing or empty controls", async ({ page }, testInfo) => {
  const bad = malformed.map((property, index) => event("UID:bad-" + index, "SUMMARY:Bad " + index,
    ...(property.startsWith("DTSTART") ? [] : ["DTSTART:20261030T090000Z"]), property));
  const text = calendar(...bad,
    event("UID:good", "SUMMARY:Good", "DTSTART:20261030T090000Z", "DTEND:20261030T090000Z", "EXDATE:, ,"),
    event("UID:day", "SUMMARY:All day", "DTSTART;VALUE=DATE:20261102", "RECURRENCE-ID;VALUE=DATE:20261102"));
  await testInfo.attach("source.ics", { body: text, contentType: "text/calendar" });
  await loadImport(page, text);
  const values = await api(page, "api => api.getCalendarEvents().map(({ title, start, allDay }) => ({ title, start, allDay })).sort((a,b) => a.start.localeCompare(b.start))");
  expect(values).toEqual([{ title: "Good", start: "2026-10-30T09:00:00Z", allDay: false }, { title: "All day", start: "2026-11-02T00:00:00Z", allDay: true }]);
  expect(await page.evaluate(() => window.imported.map(({ events, skipped }) => ({ events, skipped })))).toEqual([{ events: 2, skipped: malformed.length }]);
  expect(await page.evaluate(() => window.importErrors)).toEqual([]);
});

test("same-origin imports retain zero instants and all-day dates while unknown scoped zones keep the UTC fallback", async ({ page }) => {
  await loadImport(page, calendar(
    event("UID:epoch", "SUMMARY:Epoch", "DTSTART;VALUE=DATE-TIME:19700101T000000Z", "RECURRENCE-ID:19700101T000000Z", "EXDATE:, ,"),
    event("UID:day", "SUMMARY:All day", "DTSTART;VALUE=DATE:19700101", "RECURRENCE-ID;VALUE=DATE:19700101"),
    event("UID:unknown", "SUMMARY:Unknown", "DTSTART;TZID=/Mars/Olympus:19700101T090000")), "1970-01-01");
  const values = await api(page, "api => api.getCalendarEvents().map(({ title, start, end, allDay }) => ({ title, start, end, allDay })).sort((a,b) => a.title.localeCompare(b.title))");
  expect(values).toEqual([
    { title: "All day", start: "1970-01-01T00:00:00Z", end: "1970-01-02T00:00:00Z", allDay: true },
    { title: "Epoch", start: "1970-01-01T00:00:00Z", end: "1970-01-01T00:00:00Z", allDay: false },
    { title: "Unknown", start: "1970-01-01T09:00:00Z", end: "1970-01-01T09:00:00Z", allDay: false }
  ]);
  const imported = await page.evaluate(() => window.imported[0]);
  expect({ events: imported.events, skipped: imported.skipped }).toEqual({ events: 3, skipped: 0 });
  expect(imported.notes).toEqual([expect.stringContaining("time zone is unknown")]);
  expect(await page.evaluate(() => window.importErrors)).toEqual([]);
});

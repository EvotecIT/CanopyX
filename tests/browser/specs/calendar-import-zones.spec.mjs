// Imported files may mix recurrence zones while a native calendar retains one configured series zone. The actual browser
// importer, expansion, public event snapshots and iCalendar re-export must keep those clocks separate across DST.
import { test, expect } from "@playwright/test";
import { calendarRangePage, calendarRow } from "./calendar-range-support.mjs";
import { openBuilt, api, capture } from "./calendar-support.mjs";

const event = (uid, title, start, rule, extra = []) => ["BEGIN:VEVENT", "UID:" + uid, "SUMMARY:" + title,
  "DTSTART" + start, "DURATION:PT1H", "RRULE:" + rule, ...extra, "END:VEVENT"];
const text = ["BEGIN:VCALENDAR", ...event("ny-count", "New York count", ";TZID=America/New_York:20261030T090000", "FREQ=DAILY;COUNT=5"),
  ...event("utc-until", "UTC until", ":20261030T130000Z", "FREQ=DAILY;UNTIL=20261103T130000Z"),
  ...event("ny-exceptions", "New York exceptions", ";TZID=America/New_York:20261030T090000", "FREQ=DAILY;COUNT=5",
    ["EXDATE;VALUE=DATE:20261101", "EXDATE;TZID=America/New_York:20261102T090000"]),
  "BEGIN:VEVENT", "UID:all-day", "SUMMARY:All day", "DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261031",
  "RRULE:FREQ=DAILY;COUNT=5", "EXDATE;VALUE=DATE:20261101", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

const ny = ["2026-10-30T13:00:00Z", "2026-10-31T13:00:00Z", "2026-11-01T14:00:00Z", "2026-11-02T14:00:00Z", "2026-11-03T14:00:00Z"];
const utc = ny.map(at => at.slice(0, 11) + "13:00:00Z"), days = ["2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03"];
const snapshot = page => api(page, `api => api.getCalendarEvents().map(({ title, start, end, allDay }) => ({ title, start, end, allDay }))
  .sort((a, b) => a.title.localeCompare(b.title) || a.start.localeCompare(b.start))`);

for (const timeZone of ["utc", "America/New_York"]) {
  test("imported mixed-zone series retain COUNT, UNTIL and exceptions through re-export - " + timeZone, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://canopyx.test/mixed-zones.ics", route => route.fulfill({ contentType: "text/calendar", body: text }));
    const native = calendarRow("native", "2026-10-30T13:00:00Z", "2026-10-30T14:00:00Z", { title: "Native series", rule: "FREQ=DAILY;COUNT=5" });
    const calendar = { date: "2026-11-02", view: "month", views: ["month"], timeZone,
      sources: [{ id: "import", label: "Imported", ics: "mixed-zones.ics" }] };
    await openBuilt(page, "zones.html", calendarRangePage([native], { inline: true, calendar }));
    const timed = (title, times) => times.map(start => ({ title, start, end: new Date(Date.parse(start) + 3600000).toISOString().replace(".000Z", "Z"), allDay: false }));
    const expected = [...timed("New York count", ny), ...timed("UTC until", utc), ...timed("New York exceptions", [ny[0], ny[1], ny[4]]),
      ...timed("Native series", timeZone === "utc" ? utc : ny), ...days.map(day => ({ title: "All day", start: day + "T00:00:00Z",
        end: new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().replace(".000Z", "Z"), allDay: true }))]
      .sort((a, b) => a.title.localeCompare(b.title) || a.start.localeCompare(b.start));
    await expect.poll(() => snapshot(page)).toEqual(expected);
    const exported = await api(page, "async api => (await api.exportCalendar()).text");
    expect(exported).toContain("TZID:America/New_York");
    expect(exported).toContain("UNTIL=20261103T140000Z");
    expect(exported).not.toContain("seriesZone");
    expect(await api(page, "api => api.getCalendarEvents().some(event => Object.hasOwn(event, 'seriesZone'))")).toBe(false);
    await capture(page, "calendar-import-zones-" + timeZone.replaceAll("/", "-"));
    await page.route("http://canopyx.test/round-trip.ics", route => route.fulfill({ contentType: "text/calendar", body: exported }));
    const opposite = timeZone === "utc" ? "America/New_York" : "utc";
    await openBuilt(page, "zone-round-trip.html", calendarRangePage([], { inline: true, calendar: { ...calendar, timeZone: opposite,
      sources: [{ id: "round-trip", label: "Round trip", ics: "round-trip.ics" }] } }));
    await expect.poll(() => snapshot(page)).toEqual(expected);
    expect(errors).toEqual([]);
    await expect(page.locator(".cx-cal-notice")).toHaveText("");
  });
}

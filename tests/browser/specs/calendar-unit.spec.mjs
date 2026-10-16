// The calendar's pure helpers (docs/calendar.md): time zones and DST, the RRULE subset against the shared RFC 5545 cases
// (tests/fixtures/recurrence-cases.json, which the C# CanopyRecurrence checks too), lane and column layout, and the iCalendar
// writer's escaping and folding. They run on the calendar part installed into a stand-in grid class.
import { test, expect } from "@playwright/test";
import { loadKit, recurrenceCases } from "./calendar-support.mjs";

test.describe("calendar helpers", () => {
  test.beforeEach(async ({ page }) => { await loadKit(page); });

  test("recurrence rules expand as the RFC 5545 cases say, in their zones", async ({ page }) => {
    const failures = await page.evaluate(cases => {
      const kit = window.kit, out = [];
      const wall = (zone, text) => { const [date, time = "00:00:00"] = text.split("T"); const [h, m, s] = time.split(":").map(Number); return zone.instant(kit.calParseDay(date), h * 60 + m + (s || 0) / 60); };
      const show = (zone, time) => { const p = zone.parts(time), pad = n => String(n).padStart(2, "0"); return kit.calDayText(p.day) + "T" + pad(p.h) + ":" + pad(p.mi) + ":" + pad(Math.floor(time % 60000 / 1000)); };
      for (const item of cases) {
        try {
          // Exceptions go through the parser the calendar uses, joined as the C# test joins them.
          const zone = kit.calZone(item.zone), rule = kit.calRule(item.rule), { excluded, excludedDays: days } = kit.calExceptions((item.exceptions || []).join(","), zone);
          const starts = kit.calExpand(rule, wall(zone, item.start), 0, zone, item.from ? wall(zone, item.from) : -Infinity, item.to ? wall(zone, item.to) : Infinity, excluded, days, 100000);
          const actual = starts.map(time => show(zone, time));
          if (JSON.stringify(actual) !== JSON.stringify(item.expected)) out.push({ name: item.name, expected: item.expected.slice(0, 6), actual: actual.slice(0, 6), lengths: [item.expected.length, actual.length] });
        } catch (error) { out.push({ name: item.name, error: error.message }); }
      }
      return out;
    }, recurrenceCases());
    expect(failures).toEqual([]);
  });

  test("rules outside the subset are refused", async ({ page }) => {
    const errors = await page.evaluate(() => ["FREQ=HOURLY", "FREQ=DAILY;COUNT=2;UNTIL=20260101", "FREQ=WEEKLY;BYDAY=2MO", "FREQ=DAILY;BYHOUR=9", "FREQ=DAILY;;", "INTERVAL=2",
      "FREQ=WEEKLY;BYMONTHDAY=3", "FREQ=DAILY;FREQ=WEEKLY", "FREQ=MONTHLY;BYMONTHDAY=0"].map(text => { try { window.kit.calRule(text); return null; } catch (error) { return text; } }));
    expect(errors.every(Boolean)).toBe(true);
    expect(await page.evaluate(() => window.kit.calRule(" rrule:freq = weekly ; byday = mo,we ").byDay.map(item => item.dow))).toEqual([1, 3]);
  });

  test("wall times read DST as RFC 5545 does: the offset before a gap, the first of a repeat", async ({ page }) => {
    const result = await page.evaluate(() => {
      const kit = window.kit, warsaw = kit.calZone("Europe/Warsaw"), spring = kit.calParseDay("2026-03-29"), autumn = kit.calParseDay("2026-10-25");
      return {
        gap: kit.calIso(warsaw.instant(spring, 150)), repeat: kit.calIso(warsaw.instant(autumn, 150)),
        springHours: (warsaw.start(spring + 1) - warsaw.start(spring)) / 3600000, autumnHours: (warsaw.start(autumn + 1) - warsaw.start(autumn)) / 3600000,
        noon: kit.calIso(warsaw.instant(autumn, 720)), day: warsaw.day(Date.parse("2026-10-24T22:30:00Z")), expectedDay: autumn,
        unknown: kit.calZone("Mars/Olympus"), local: kit.calZone("local").name, utcParts: kit.calZone("utc").parts(Date.parse("2026-10-16T23:59:00Z")).minutes
      };
    });
    expect(result).toEqual({ gap: "2026-03-29T01:30:00Z", repeat: "2026-10-25T00:30:00Z", springHours: 23, autumnHours: 25, noon: "2026-10-25T11:00:00Z",
      day: result.expectedDay, expectedDay: result.expectedDay, unknown: null, local: "local", utcParts: 1439 });
  });

  test("a daily series keeps its wall-clock time across a DST change", async ({ page }) => {
    const times = await page.evaluate(() => {
      const kit = window.kit, zone = kit.calZone("America/New_York"), start = zone.instant(kit.calParseDay("2026-10-30"), 9 * 60);
      return kit.calExpand(kit.calRule("FREQ=DAILY;COUNT=4"), start, 3600000, zone, -Infinity, Infinity, new Set(), new Set(), 10).map(kit.calIso);
    });
    expect(times).toEqual(["2026-10-30T13:00:00Z", "2026-10-31T13:00:00Z", "2026-11-01T14:00:00Z", "2026-11-02T14:00:00Z"]);
  });

  test("days lay out in lanes that keep multi-day bars whole, and overlapping times share columns", async ({ page }) => {
    const layout = await page.evaluate(() => {
      const kit = window.kit, event = (id, sd, ed) => ({ id, sd, ed, allDay: true, start: sd, end: ed });
      const lanes = kit.calLanes([event("a", 1, 3), event("b", 2, 2), event("c", 3, 5), event("d", 4, 4)], 1, 7, day => day - 1)
        .map(item => [item.event.id, item.lane, item.from, item.to]);
      const segment = (id, top, bottom) => ({ event: { id }, top, bottom, min: 15 });
      const columns = kit.calColumns([segment("x", 540, 660), segment("y", 570, 630), segment("z", 600, 780), segment("w", 690, 720), segment("v", 900, 960)])
        .map(item => [item.event.id, item.col, item.cols, item.span]);
      return { lanes, columns };
    });
    expect(layout.lanes).toEqual([["a", 0, 0, 2], ["b", 1, 1, 1], ["c", 1, 2, 4], ["d", 0, 3, 3]]);
    expect(layout.columns).toEqual([["x", 0, 3, 1], ["y", 1, 3, 1], ["z", 2, 3, 1], ["w", 0, 3, 2], ["v", 0, 1, 1]]);
  });

  test("iCalendar text is escaped and folded at 75 octets without splitting a character", async ({ page }) => {
    const result = await page.evaluate(() => {
      const kit = window.kit, line = "SUMMARY:" + kit.calIcsText("Zażółć gęślą jaźń; a, b\\c\nnext line — " + "ł".repeat(60));
      const folded = kit.calIcsFold(line), parts = folded.split("\r\n"), encoder = new TextEncoder();
      return { escaped: kit.calIcsText("a;b,c\\d\r\ne\u0007"), sizes: parts.map(part => encoder.encode(part).length), continued: parts.slice(1).every(part => part.startsWith(" ")),
        roundTrip: parts.map((part, index) => index ? part.slice(1) : part).join("") === line };
    });
    expect(result.escaped).toBe("a\\;b\\,c\\\\d\\ne");
    expect(Math.max(...result.sizes)).toBeLessThanOrEqual(75);
    expect(result.continued).toBe(true);
    expect(result.roundTrip).toBe(true);
  });
});

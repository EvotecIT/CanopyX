import { test, expect } from "@playwright/test";
import { api, openBuilt, capture } from "./calendar-support.mjs";
import { calendarRangePage, calendarRow } from "./calendar-range-support.mjs";
import { nextFrames } from "./support.mjs";

const at = (day, time = "09:00:00") => "2026-10-" + String(day).padStart(2, "0") + "T" + time + "Z";
const names = page => api(page, "api => api.getCalendarEvents().map(event => event.title)");
const tree = { protocol: "canopyx/2", type: "view", id: "resources", label: "Resources", rowHeight: 34,
  columns: [{ id: "name", title: "Resource" }], source: { kind: "inline" }, roots: [{ id: "visible", label: "Visible" }] };

test.describe("calendar range contracts", () => {
  for (const mode of ["empty-rule", "offscreen-resource"]) test("fallback selects relevant records before its cap - " + mode, async ({ page }) => {
    const old = Array.from({ length: 15 }, (_, i) => calendarRow("old-" + i, mode === "empty-rule" ? "2026-09-01T09:00:00Z" : at(12),
      mode === "empty-rule" ? "2026-09-01T10:00:00Z" : at(12, "10:00:00"), { rule: "", resource: "offscreen" }));
    const options = { range: false, calendar: { limit: 5, ...(mode === "offscreen-resource" ? { view: "timeline", views: ["timeline"], resources: { view: tree } } : {}) } };
    await openBuilt(page, "fallback-" + mode + ".html", calendarRangePage([...old, calendarRow("Visible event", at(14), at(14, "10:00:00"))], options));
    expect(await names(page)).toEqual(["Visible event"]);
  });

  for (const mode of ["range", "fallback", "cursor", "inline", "grouped-fallback"]) test("moved overrides suppress filtered masters without becoming displayed records - " + mode, async ({ page }) => {
    const rows = [calendarRow("master", at(3), at(6), { title: "Selected series", rule: "FREQ=WEEKLY;COUNT=5" }),
      calendarRow("moved", "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", { title: "Different title", resource: "offscreen", series: "master", rid: at(10) }),
      calendarRow("moved-visible", at(17), at(17, "10:00:00"), { title: "Different title", resource: "offscreen", series: "master", rid: at(17) }),
      calendarRow("ordinary", at(16), at(16, "10:00:00"), { title: "Selected ordinary" })];
    await openBuilt(page, "overrides-" + mode + ".html", calendarRangePage(rows, { inline: mode === "inline", cursor: mode === "cursor",
      range: mode === "range" || mode === "cursor", advertiseRange: mode === "cursor", grouped: mode === "grouped-fallback",
      query: { search: "Selected", filters: [{ column: "resource", operator: "eq", values: ["visible"] }] } }));
    const events = await api(page, "api => api.getCalendarEvents().map(event => ({ title: event.title, start: event.start }))");
    expect(events).toEqual([{ title: "Selected ordinary", start: at(16) }]);
    await expect(page.locator(".cx-cal-ev")).toHaveCount(1);
    if (mode !== "inline") {
      const support = await page.evaluate(() => window.calendarQueries.filter(query => query.filters.some(filter => filter.column === "series" && filter.operator === "in")));
      expect(support.length).toBeGreaterThan(0);
      expect(support[0]).toMatchObject({ search: "", revision: "r1" });
      expect(support[0].filters.some(filter => filter.column === "resource")).toBe(false);
      if (mode === "cursor") expect(await page.evaluate(() => window.calendarRanges)).toEqual([]);
      if (mode === "grouped-fallback") {
        expect(support[0].groupBy).toEqual([]);
        expect(support[0].sort).toEqual([]);
        const displayed = await api(page, "api => api.getQuery()");
        expect(displayed).toMatchObject({ search: "Selected", groupBy: [{ column: "resource", direction: "asc" }] });
        expect(displayed.filters).toEqual([{ column: "resource", operator: "eq", values: ["visible"] }]);
      }
    }
  });

  test("uncertified master batches are withheld while ordinary rows survive with a notice", async ({ page }) => {
    const rows = [calendarRow("master", at(1), at(1, "10:00:00"), { rule: "FREQ=DAILY;COUNT=31" }), calendarRow("ordinary", at(16), at(16, "11:00:00"))];
    for (let i = 0; i < 10; i++) rows.push(calendarRow("moved-" + i, "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", { series: "master", rid: at(12 + i) }));
    await openBuilt(page, "bounded-overrides.html", calendarRangePage(rows, { calendar: { limit: 5 } }));
    expect(await names(page)).toEqual(["ordinary"]);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    await expect(page.locator(".cx-cal-notice")).toContainText(/limit|narrow|first|shown/i);
  });

  for (const cursor of [false, true]) test("replacement pages retain one snapshot - " + (cursor ? "cursor" : "offset"), async ({ page }) => {
    const rows = [calendarRow("master", at(1), at(1, "10:00:00"), { rule: "FREQ=DAILY;COUNT=31" }), calendarRow("ordinary", at(16), at(16, "11:00:00"))];
    for (let i = 12; i < 19; i++) rows.push(calendarRow("moved-" + i, "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", { series: "master", rid: at(i) }));
    await openBuilt(page, "paged-overrides-" + cursor + ".html", calendarRangePage(rows, { cursor, pageSize: 3, calendar: { limit: 20 } }));
    expect(await names(page)).toEqual(["ordinary"]);
    const support = await page.evaluate(() => window.calendarQueries.filter(query => query.filters.some(filter => filter.column === "series" && filter.operator === "in")));
    expect(support).toHaveLength(3);
    expect(support.map(query => query.revision)).toEqual(["r1", "r1", "r1"]);
    expect(support.map(query => cursor ? query.cursor ?? null : query.offset)).toEqual(cursor ? [null, "c:3", "c:6"] : [0, 3, 6]);
  });

  test("suppression metadata obeys the source authorization scope", async ({ page }) => {
    const rows = [calendarRow("master", at(16), at(16, "10:00:00"), { rule: "FREQ=DAILY;COUNT=1" }),
      calendarRow("private", "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", { title: "Private override", series: "master", rid: at(16) })];
    await openBuilt(page, "scoped-overrides.html", calendarRangePage(rows));
    expect(await names(page)).toEqual(["master"]);
    expect(await page.evaluate(() => window.calendarErrors)).toEqual([]);
  });

  test("a metadata revision change fails the load instead of accepting a mixed snapshot", async ({ page }) => {
    const rows = [calendarRow("master", at(16), at(16, "10:00:00"), { rule: "FREQ=DAILY;COUNT=1" })];
    await openBuilt(page, "stale-overrides.html", calendarRangePage(rows, { staleMetadata: true }), null);
    await expect(page.locator(".cx-cal-notice")).toContainText(/snapshot changed/);
    expect(await names(page)).toEqual([]);
  });

  test("a superseded metadata read cannot repaint the new accepted query", async ({ page, browserName }) => {
    const rows = [calendarRow("master", at(16), at(16, "10:00:00"), { rule: "FREQ=DAILY;COUNT=1" }),
      calendarRow("ordinary", at(17), at(17, "10:00:00"))];
    await openBuilt(page, "cancelled-overrides.html", calendarRangePage(rows, { holdMetadata: true }), null);
    await page.waitForFunction(() => typeof window.releaseCalendarMetadata === "function");
    await api(page, "api => api.setQuery({ search: 'ordinary' })");
    await expect.poll(() => names(page)).toEqual(["ordinary"]);
    await page.evaluate(() => window.releaseCalendarMetadata());
    await expect.poll(() => names(page)).toEqual(["ordinary"]);
    expect(await page.evaluate(() => window.calendarErrors)).toEqual([]);
    await capture(page, "calendar-range-accepted-query-" + browserName);
  });

  for (const layout of ["wide-light", "phone-dark"]) test("collapsed hosted groups include descendants and directly assigned events - " + layout, async ({ page, browserName }) => {
    const resources = { ...tree, columns: [{ id: "name", title: "Resource" }, { id: "events", title: "Events", kind: "number" },
      { id: "busy", title: "Busy", kind: "number" }, { id: "overlap", title: "Overlap", kind: "number" }],
      roots: [{ id: "visible", label: "Parent", children: [{ id: "middle", label: "Middle", children: [{ id: "leaf", label: "Leaf" }] }] }] };
    const rows = [calendarRow("parent-one", at(16), at(16, "11:00:00")), calendarRow("parent-two", at(16, "10:00:00"), at(16, "12:00:00")),
      calendarRow("leaf-event", at(16), at(16, "10:00:00"), { resource: "leaf" })];
    await page.setViewportSize(layout === "phone-dark" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await openBuilt(page, "collapsed-resources.html", calendarRangePage(rows, { dark: layout === "phone-dark", calendar: { view: "timeline", views: ["timeline"],
      resources: { view: resources, width: 520, aggregates: { events: "count", busy: "busy", overlap: "overlap" } } } }));
    const first = await page.evaluate(() => window.calendarRanges[0]);
    expect(first.resources).toEqual(expect.arrayContaining(["visible", "middle", "leaf"]));
    await api(page, "api => { const state = api.getState(); return api.setState({ ...state, calendar: { ...state.calendar, collapsed: ['visible', 'middle'] } }); }");
    await expect(page.locator('.cx-tl-tree .cx-row[data-cx-id="middle"]')).toHaveCount(0);
    const lane = page.locator('.cx-tl-lane[data-cx-resource="visible"]');
    await expect(lane).toHaveAttribute("aria-label", /3 events/);
    if (layout === "wide-light") {
      await expect(page.locator('.cx-tl-tree .cx-row[data-cx-id="visible"] .cx-tl-agg')).toHaveText(["3", "4 h", "2"]);
      const clipped = await page.evaluate(() => {
        const pane = document.querySelector(".cx-tl-side").getBoundingClientRect();
        return [...document.querySelectorAll('.cx-tl-tree .cx-row[data-cx-id="visible"] .cx-tl-agg')].filter(cell => {
          const range = document.createRange(); range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          return text.left < pane.left || text.right > pane.right;
        }).map(cell => cell.textContent);
      });
      expect(clipped).toEqual([]);
    }
    await page.locator('.cx-tl-tree .cx-row[data-cx-id="visible"] .cx-exp').click();
    await page.locator('.cx-tl-tree .cx-row[data-cx-id="middle"] .cx-exp').click();
    await expect(page.locator('.cx-tl-lane[data-cx-resource="leaf"] .cx-cal-ev')).toHaveCount(1);
    await nextFrames(page);
    if (layout === "wide-light") await expect(page.locator('.cx-tl-tree .cx-row[data-cx-id="visible"] .cx-tl-agg')).toHaveText(["3", "4 h", "2"]);
    const alignment = () => page.evaluate(() => ["visible", "middle", "leaf"].map(id => {
      const row = document.querySelector('.cx-tl-tree .cx-row[data-cx-id="' + id + '"]'), lane = document.querySelector('.cx-tl-lane[data-cx-resource="' + id + '"]');
      return row && lane ? Math.round(row.getBoundingClientRect().top - lane.getBoundingClientRect().top) : null;
    }));
    await expect.poll(alignment).toEqual([0, 0, 0]);
    await page.setViewportSize(layout === "phone-dark" ? { width: 430, height: 844 } : { width: 1200, height: 900 });
    await expect.poll(alignment).toEqual([0, 0, 0]);
    await page.setViewportSize(layout === "phone-dark" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await expect.poll(alignment).toEqual([0, 0, 0]);
    expect(await page.evaluate(() => window.calendarErrors)).toEqual([]);
    await capture(page, "calendar-range-three-level-timeline-" + layout + "-" + browserName);
  });

  for (const zone of ["utc", "Europe/Warsaw"]) test("date exceptions export the master's nonzero seconds - " + zone, async ({ page }) => {
    const rows = [calendarRow("seconds", at(16, "09:30:45"), at(16, "10:30:45"), { rule: "FREQ=DAILY;COUNT=3", exceptions: "2026-10-17" })];
    await openBuilt(page, "seconds-" + zone.replace("/", "-") + ".html", calendarRangePage(rows, { inline: true, calendar: { timeZone: zone } }));
    const text = await api(page, "api => api.exportCalendar().then(result => result.text)");
    expect(text).toContain(zone === "utc" ? "EXDATE:20261017T093045Z\r\n" : "EXDATE;TZID=Europe/Warsaw:20261017T113045\r\n");
    expect(await names(page)).toEqual(["seconds", "seconds"]);
  });
});

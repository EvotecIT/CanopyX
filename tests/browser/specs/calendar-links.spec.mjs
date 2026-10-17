// The calendar's grid features (docs/calendar.md): linked views both ways, external filters and highlights, the facet panel,
// live data, the record drawer and record deep links, print, iCalendar export, and hosted range loading with and without a
// range capability.
import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";
import { api, capture, openCalendar, NOW } from "./calendar-support.mjs";

const day = text => Math.floor(Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) / 86400000);

test.describe("calendar links and data", () => {
  test("a calendar and a grid follow each other both ways", async ({ page }) => {
    await openCalendar(page, "calendar-linked.html");
    await page.waitForFunction(() => [...document.querySelectorAll("[data-canopyx-host]")].every(host => host.canopyx));
    // A day in the calendar filters the grid to the records starting that day, with a chip naming the calendar.
    await page.locator('.cx-cal-dayhead[data-cx-day="' + day("2026-10-14") + '"]').waitFor();
    const slot = page.locator('.cx-cal-allcell[data-cx-day="' + day("2026-10-16") + '"]');
    await slot.focus();
    await page.keyboard.press(" ");
    const grid = page.locator("[data-canopyx-host]").nth(1);
    await expect(grid.locator(".cx-grid-chip", { hasText: "Filtered by Calendar" })).toBeVisible();
    const filters = await api(page, "api => api.getExternalFilters()", null, "linked-records");
    expect(filters).toEqual([{ source: "calendar", field: "starts", range: ["2026-10-16T00:00:00Z", "2026-10-16T23:59:59Z"], label: "Oct 16, 2026", sourceLabel: "Calendar", persist: false }]);
    const matched = await api(page, "api => api.getPaging().matched", null, "linked-records");
    expect(matched).toBeGreaterThan(3);
    await expect(page.locator("#link-status")).toHaveText(/^Calendar: Oct 16, 2026 \(\d+ events\)$/);
    // Slots selected with Shift and the arrows report their range.
    await page.locator('.cx-cal-slot[data-cx-day="' + day("2026-10-16") + '"][data-cx-minutes="540"]').focus();
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(() => api(page, "api => api.getExternalFilters()[0].range", null, "linked-records")).toEqual(["2026-10-16T09:00:00Z", "2026-10-16T09:59:59Z"]);
    // Rows selected in the grid mark their events in the calendar.
    await api(page, "api => api.setSelection(['op-010', 'op-011'])", null, "linked-records");
    await expect(page.locator('.cx-cal-ev[data-cx-linked="true"]')).toHaveCount(2);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("2 events highlighted");
    await capture(page, "linked-light-1440", { fullPage: true });
    await api(page, "api => api.setSelection([])", null, "linked-records");
    await expect(page.locator('.cx-cal-ev[data-cx-linked="true"]')).toHaveCount(0);
  });

  test("the calendar takes external filters, date ranges included, with the grid's chips", async ({ page }) => {
    await openCalendar(page, "calendar-linked.html");
    await page.waitForFunction(() => [...document.querySelectorAll("[data-canopyx-host]")].every(host => host.canopyx));
    const before = await api(page, "api => api.getCalendarEvents().length", null, "linked-calendar");
    await api(page, "api => api.setExternalFilter('chart', { field: 'kind', values: ['Incident'], sourceLabel: 'Kinds chart' })", null, "linked-calendar");
    await expect(page.locator("[data-canopyx-host]").first().locator(".cx-grid-chip", { hasText: "Filtered by Kinds chart: Incident" })).toBeVisible();
    await expect.poll(() => api(page, "api => api.getCalendarEvents().map(event => event.title)", null, "linked-calendar")).toEqual([expect.stringMatching(/^Disk latency/)]);
    await api(page, "api => api.setExternalFilter('chart', { field: 'starts', range: ['2026-10-14T00:00:00Z', '2026-10-15T23:59:59Z'], label: 'Wed–Thu' })", null, "linked-calendar");
    await expect.poll(() => api(page, "api => api.getCalendarEvents().every(event => event.start >= '2026-10-14' && event.start < '2026-10-16')", null, "linked-calendar")).toBe(true);
    await api(page, "api => api.clearExternalFilters()", null, "linked-calendar");
    await expect.poll(() => api(page, "api => api.getCalendarEvents().length", null, "linked-calendar")).toBe(before);
  });

  test("the facet panel filters the calendar's events", async ({ page }) => {
    await openCalendar(page, "calendar-certificates.html");
    const before = await api(page, "api => api.getCalendarEvents().length");
    await page.locator('.cx-facet[data-cx-facet="status"]').getByRole("checkbox", { name: /^Expiring, \d+ rows$/ }).check();
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([{ column: "status", operator: "in", values: ["Expiring"] }]);
    await expect.poll(() => api(page, "api => api.getCalendarEvents().length")).toBeLessThan(before);
    expect(await api(page, "api => api.getCalendarEvents().length")).toBeGreaterThan(0);
    await capture(page, "facets-light-1440");
    expect((await api(page, "api => api.getState()")).calendar.view).toBe("month");
  });

  test("live changes update events in place and keep focus and an open drawer", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    const event = page.locator('.cx-cal-ev[data-cx-record="op-010"]');
    await event.click();
    const drawer = page.locator("dialog.cx-drawer");
    await expect(drawer.locator("h4")).toHaveText("Database failover test");
    await api(page, "api => api.updateRows([{ id: 'op-010', cells: { title: 'Database failover rehearsal', ends: '2026-10-16T12:00:00Z' } }])");
    await expect(page.locator('.cx-cal-ev[data-cx-record="op-010"]')).toHaveAttribute("aria-label", /^Database failover rehearsal, 9:00 AM – 12:00 PM/);
    await expect(drawer.locator("h4")).toHaveText("Database failover rehearsal");
    await page.keyboard.press("Escape");
    await page.locator('.cx-cal-ev[data-cx-record="op-010"]').focus();
    await api(page, "api => api.addRows([{ id: 'op-new', cells: { title: 'Added window', kind: 'Change', status: 'Planned', starts: '2026-10-15T09:00:00Z', ends: '2026-10-15T10:00:00Z', owner: 'Ops', team: 'Ops' } }])");
    await expect(page.locator('.cx-cal-ev[data-cx-record="op-new"]')).toHaveCount(1);
    await expect(page.locator('.cx-cal-ev[data-cx-record="op-010"]')).toBeFocused();
    await api(page, "api => api.removeRows(['op-new'])");
    await expect(page.locator('.cx-cal-ev[data-cx-record="op-new"]')).toHaveCount(0);
  });

  test("events open their record in the drawer, also from a record deep link", async ({ page }) => {
    await openCalendar(page, "calendar.html", { hash: "#record=operations:op-009" });
    const drawer = page.locator("dialog.cx-drawer");
    await expect(drawer.locator("h4")).toHaveText("Core switch firmware upgrade");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await api(page, "api => api.setCalendarView('week')");
    const event = page.locator('.cx-cal-ev[data-cx-record="op-011"]');
    await event.focus();
    await page.keyboard.press("Enter");
    await expect(drawer.locator("h4")).toHaveText(/^Disk latency on the file server cluster/);
    await expect(drawer).toContainText("Ticket");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#record=operations:op-011");
    await capture(page, "drawer-light-1440");
    await page.keyboard.press("Escape");
    await expect(event).toBeFocused();
    // A host can take the activation itself.
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:rowActivate", event => { window.activated = event.detail.id; event.preventDefault(); }));
    await event.click();
    expect(await page.evaluate(() => window.activated)).toBe("op-011");
    await expect(drawer).toHaveCount(0);
  });

  test("print shows every event of the month and the agenda as a list", async ({ page, browserName }) => {
    await openCalendar(page, "calendar.html");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.locator(".cx-cal-more-btn")).toHaveCount(0);
    await expect(page.locator(".cx-calendar > .cx-toolbar")).toBeHidden();
    const hidden = await page.evaluate(() => [...document.querySelectorAll(".cx-cal-week")].some(row => row.scrollHeight > row.clientHeight + 1));
    expect(hidden).toBe(false);
    if (browserName === "chromium" && process.env.CANOPYX_EVIDENCE) await page.pdf({ path: process.env.CANOPYX_EVIDENCE + "/print-month.pdf", landscape: true, printBackground: true });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expect(page.locator(".cx-cal-more-btn").first()).toBeVisible();
  });

  test("iCalendar keeps series, exceptions, moved occurrences and dates, escaped and folded", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    const { text, fileName } = await api(page, "api => api.exportCalendar().then(result => ({ text: result.text, fileName: result.fileName }))");
    expect(fileName).toBe("operations.ics");
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CanopyX//Calendar//EN\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    // The excluded day of a timed series is written as the occurrence at the series' time, the type of its DTSTART.
    expect(text).toMatch(/\r\nEXDATE(?:;TZID=[^:]+)?:20261027T2000(?:00Z|00)\r\n/);
    expect(text).toContain("RECURRENCE-ID:20261013T200000Z");
    expect(text).toContain("DTSTART;VALUE=DATE:20261012");
    expect(text).toContain("DTEND;VALUE=DATE:20261017");
    expect(text).toContain("TRANSP:TRANSPARENT");
    expect(text.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(text).toMatch(/SUMMARY:Disk latency on the file server cluster: storage controller rep\S*\r\n /);
    expect(text.replace(/\r\n /g, "")).toContain("SUMMARY:Disk latency on the file server cluster: storage controller reports retries on two shelves\r\n");
    // The Export menu offers it too.
    await page.locator(".cx-grid-export > summary").click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "iCalendar (.ics)" }).click();
    expect((await download).suggestedFilename()).toBe("operations.ics");
  });

  test("a hosted calendar reads each range through its source's range capability, once", async ({ page }) => {
    const rows = Array.from({ length: 400 }, (_, index) => ({ id: "r" + index, cells: { title: "Event " + index,
      starts: new Date(Date.UTC(2026, 8, 1) + index * 7 * 3600000).toISOString().replace(".000Z", "Z"), host: "h" + index % 5 } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "remote", label: "Remote", rowHeight: 34, pageSize: 100, selection: "single", search: true,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true, sortable: true }, { id: "starts", title: "Starts", kind: "datetime", sortable: true }, { id: "host", title: "Host", kind: "text" }],
      source: { kind: "host" }, calendar: { start: "starts", title: "title", resource: "host", date: "2026-10-16", firstDay: 1 } };
    const setup = "<script>window.rows = " + JSON.stringify(rows) + "; window.ranges = []; window.queries = [];" +
      "CanopyX.configure('remote', { source: { query(query) { window.queries.push(query); return { protocol: 'canopyx/2', type: 'gridPage', view: 'remote', revision: 'r1', offset: query.offset, total: rows.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }; }," +
      " range(request) { window.ranges.push(request); const from = Date.parse(request.from), to = Date.parse(request.to); const items = rows.filter(row => { const t = Date.parse(row.cells.starts); return t >= from && t < to; });" +
      " return { protocol: 'canopyx/2', type: 'gridRangePage', view: 'remote', revision: 'r1', from: request.from, to: request.to, matched: items.length, truncated: false, items }; } } });</script>";
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/remote.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
    await page.goto("http://canopyx.test/remote.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    const first = await page.evaluate(() => window.ranges[0]);
    expect(first).toMatchObject({ protocol: "canopyx/2", type: "gridRangeQuery", view: "remote", from: "2026-09-28T00:00:00Z", to: "2026-11-02T00:00:00Z", start: "starts", resource: "host", calendarView: "month" });
    expect(first.query).toMatchObject({ type: "gridQuery", search: "", filters: [] });
    const shown = await api(page, "api => api.getCalendarEvents().length");
    expect(shown).toBe(rows.filter(row => row.cells.starts >= "2026-09-28" && row.cells.starts < "2026-11-02").length);
    await api(page, "api => api.calendarStep(1)");
    expect(await page.evaluate(() => window.ranges.at(-1).from)).toBe("2026-10-26T00:00:00Z");
    await api(page, "api => api.calendarStep(-1)");
    expect(await page.evaluate(() => window.ranges.length)).toBe(2);
    // A new query asks again.
    await api(page, "api => api.setQuery({ search: 'Event 1' })");
    await expect.poll(() => page.evaluate(() => window.ranges.at(-1).query.search)).toBe("Event 1");
  });

  test("a hosted source without range capability gets queries that ask for the overlapping records", async ({ page }) => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ id: "q" + index, cells: { title: "Item " + index, starts: new Date(Date.UTC(2026, 9, 1) + index * 12 * 3600000).toISOString().replace(".000Z", "Z") } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "plain-remote", label: "Remote", rowHeight: 34, pageSize: 100, selection: "single", search: true,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime" }], source: { kind: "host" },
      calendar: { start: "starts", title: "title", date: "2026-10-16", view: "week", views: ["week"], firstDay: 1 } };
    const setup = "<script>window.rows = " + JSON.stringify(rows) + "; window.queries = [];" +
      "CanopyX.configure('plain-remote', { source: { query(query) { window.queries.push(query); const group = query.filterGroup; const lt = group && group.filters.find(f => f.operator === 'lt');" +
      " const ge = group && group.groups[0].filters.find(f => f.operator === 'ge'); const items = rows.filter(row => !group || row.cells.starts < lt.values[0] && row.cells.starts >= ge.values[0]);" +
      " return { protocol: 'canopyx/2', type: 'gridPage', view: 'plain-remote', revision: 'r1', offset: query.offset, total: rows.length, matched: items.length, items: items.slice(query.offset, query.offset + query.limit) }; } } });</script>";
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/plain.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
    await page.goto("http://canopyx.test/plain.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    const ranged = await page.evaluate(() => window.queries.find(query => query.filterGroup));
    expect(ranged.filterGroup.filters).toEqual([{ column: "starts", operator: "lt", values: ["2026-10-19T00:00:00Z"] }]);
    expect(ranged.filterGroup.groups[0]).toEqual({ operator: "or", filters: [{ column: "starts", operator: "ge", values: ["2026-10-12T00:00:00Z"] }], groups: [] });
    expect(await api(page, "api => api.getCalendarEvents().length")).toBe(14);
  });

  test("a calendar over compact row data shows its range once every chunk is decoded", async ({ page }) => {
    // Pages write grids of more than 5,000 rows as compact row data; the calendar waits for the last chunk, not the first.
    const rows = Array.from({ length: 12 }, (_, index) => [String(index).padStart(3, "0"), "Window " + index, "2026-10-" + String(1 + index * 2).padStart(2, "0") + "T09:00:00Z"]);
    const view = { protocol: "canopyx/2", type: "grid", id: "compact", label: "Compact", rowHeight: 34, pageSize: 100, selection: "single", search: false,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime" }],
      source: { kind: "inline" }, rowData: { version: 1, columns: ["title", "starts"], count: 12, ordered: true, chunks: [rows.slice(0, 4), rows.slice(4, 8), rows.slice(8)] },
      calendar: { start: "starts", title: "title", date: "2026-10-16", view: "month", views: ["month"] } };
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/compact.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/compact.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    expect(await api(page, "api => api.getCalendarEvents().length")).toBe(12);
    await expect(page.locator(".cx-cal-ev")).toHaveCount(12);
  });
});

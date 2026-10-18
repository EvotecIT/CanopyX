import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "./calendar-support.mjs";
import { calendarRangePage, calendarRow } from "./calendar-range-support.mjs";
import { nextFrames, openGridControl } from "./support.mjs";

let server, origin, pages = new Map(), sequence = 0;
test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/favicon.ico") { response.writeHead(204).end(); return; }
    const content = pages.get(request.url);
    response.writeHead(content ? 200 : 404, { "Content-Type": request.url.endsWith(".ics") ? "text/calendar" : "text/html" }).end(content || "Missing fixture");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.afterEach(async ({ page }) => { await page.evaluate(() => document.querySelector("[data-canopyx-host]")?.canopyx?.destroy()); pages.clear(); });

async function open(page, rows, options = {}, holdRange = false, decorate = html => html) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  let html = decorate(calendarRangePage(rows, options));
  if (holdRange) {
    const decorated = html.replace(/CanopyX.configure\("calendar-contract",\s*\{\s*source,/, call => "(" + interceptRange.toString() + ")(source); " + call);
    if (decorated === html) throw new Error("Calendar export fixture could not decorate its public source boundary.");
    html = decorated;
  }
  const url = "/calendar-export-" + sequence++;
  pages.set(url, html); await page.goto(origin + url);
  await page.waitForSelector("[data-cx-calendar-ready]");
  return errors;
}

function interceptRange(source) {
  const range = source.range;
  source.range = async (request, context) => {
    if (window.holdExportRange) await new Promise(resolve => { window.releaseExportRange = resolve; context.signal.addEventListener("abort", resolve, { once: true }); });
    return range(request, context);
  };
}

const rows = () => [
  calendarRow("master", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", { title: "Master", rule: "FREQ=WEEKLY;COUNT=2" }),
  calendarRow("moved", "2026-10-16T11:00:00Z", "2026-10-16T12:00:00Z", { title: "Moved", series: "master", rid: "2026-09-08T09:00:00Z" })
];
const morocco = rule => calendarRow("morocco", "2020-01-15T08:00:00Z", "2020-01-15T09:00:00Z", { rule });
const moroccoCalendar = { timeZone: "Africa/Casablanca", date: "2021-04-15", view: "month" };
const exportText = (page, scope = "visible") => api(page, "async (api, host, scope) => (await api.exportCalendar({ scope })).text", scope);
const eventCount = text => (text.match(/BEGIN:VEVENT\r\n/g) || []).length;
const zones = text => text.match(/BEGIN:VTIMEZONE\r\n[\s\S]*?END:VTIMEZONE\r\n/g) || [];
function evidence(testInfo, name, text) {
  if (process.env.CANOPYX_EVIDENCE) fs.writeFileSync(path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-" + name + ".ics"), text);
}

for (const [name, options] of [["range", {}], ["ordinary query fallback", { range: false }], ["inline", { inline: true }]]) {
  test("visible export retains a moved override master from the current answer - " + name, async ({ page }, testInfo) => {
    const errors = await open(page, rows(), options);
    expect(await api(page, "api => api.getCalendarEvents().map(event => event.record)")).toEqual(["moved"]);
    const text = await exportText(page); evidence(testInfo, "moved-" + name.replaceAll(" ", "-"), text);
    expect(eventCount(text)).toBe(2);
    expect((text.match(/UID:calendar-contract-master@canopyx\r\n/g) || []).length).toBe(2);
    expect(text).toContain("RRULE:FREQ=WEEKLY;COUNT=2\r\n");
    expect(text).toContain("RECURRENCE-ID:20260908T090000Z\r\n");
    expect(eventCount(await exportText(page, "all"))).toBe(2);
    expect(errors).toEqual([]);
  });
}

test("visible export refuses a pending range and never reuses a previous query master", async ({ page }, testInfo) => {
  const errors = await open(page, rows(), {}, true);
  await api(page, "api => { window.holdExportRange = true; window.pendingExportRange = api.setCalendarDate('2026-10-23'); }");
  await expect.poll(() => page.evaluate(() => typeof window.releaseExportRange)).toBe("function");
  const loading = [];
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(width => {
      const host = document.querySelector('[data-canopyx-host]');
      return host && host.clientWidth > 0 && host.classList.contains('cx-phone') === (width <= 640);
    }, width);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    const message = await exportText(page).then(() => null, error => error.message);
    expect(message).toContain("current calendar answer");
    loading.push({ width, message, notice: await page.locator(".cx-cal-notice").innerText() });
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-loading-export-" + width + ".png") });
  }
  await testInfo.attach("loading-export-guard", { body: JSON.stringify(loading), contentType: "application/json" });
  await page.evaluate(async () => { window.holdExportRange = false; window.releaseExportRange(); await window.pendingExportRange; });
  expect(eventCount(await exportText(page))).toBe(0);
  await api(page, "api => api.setCalendarDate('2026-10-16')");
  expect(eventCount(await exportText(page))).toBe(2);
  await api(page, "async (api, host) => { const loaded = new Promise(resolve => host.addEventListener('canopyx:calendar', resolve, { once: true })); await api.setQuery({ search: 'Moved' }); await loaded; }");
  await expect.poll(() => page.locator('.cx-cal-ev[data-cx-record="moved"]').count()).toBe(1);
  await expect(exportText(page)).rejects.toThrow("recurring master in the current calendar answer");
  expect(errors).toEqual([]);
});

test("visible export cannot reuse rows after a rejected replacement metadata revision", async ({ page }) => {
  const errors = await open(page, rows());
  expect(eventCount(await exportText(page))).toBe(2);
  await api(page, "api => { window.calendarFixture.options.staleMetadata = true; return api.setQuery(api.getQuery()); }");
  await expect.poll(() => page.evaluate(() => window.calendarErrors.some(error => error.includes('snapshot changed')))).toBe(true);
  await expect(exportText(page)).rejects.toThrow("current calendar answer");
  expect(errors).toEqual([]);
});

for (const [name, rule] of [["COUNT", "FREQ=MONTHLY;COUNT=16"], ["UNTIL", "FREQ=MONTHLY;UNTIL=20210415T090000Z"]]) {
  test("finite zoned export retains actual historical transition years and the initial offset - " + name, async ({ page }, testInfo) => {
    const errors = await open(page, [morocco(rule)], { inline: true, calendar: moroccoCalendar });
    const text = await exportText(page); evidence(testInfo, "finite-morocco-" + name.toLowerCase(), text);
    const zone = zones(text)[0]; expect(zones(text)).toHaveLength(1);
    expect(zone).toContain("DTSTART:20200101T010000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0100");
    expect(zone).toContain("DTSTART:20200419T030000\r\n");
    expect(zone).toContain("DTSTART:20210411T030000\r\n");
    expect(zone).not.toContain("RRULE:");
    expect(await api(page, "api => api.getCalendarEvents().map(event => event.start)")).toEqual(["2021-04-15T09:00:00Z"]);
    expect(text).toContain("RRULE:" + rule + "\r\n");
    expect(errors).toEqual([]);
  });
}

test("one zone definition covers different finite master horizons in the same export", async ({ page }, testInfo) => {
  const early = calendarRow("early", "2019-01-15T08:00:00Z", "2019-01-15T09:00:00Z", { rule: "FREQ=MONTHLY;COUNT=2" });
  await open(page, [early, morocco("FREQ=MONTHLY;COUNT=16")], { inline: true, calendar: moroccoCalendar });
  const text = await exportText(page, "all"); evidence(testInfo, "same-zone-horizons", text);
  expect(zones(text)).toHaveLength(1); expect(eventCount(text)).toBe(2);
  expect(zones(text)[0]).toContain("DTSTART:20190101T010000\r\n");
  expect(zones(text)[0]).toContain("DTSTART:20210411T030000\r\n");
});

test("different imported zones retain their own finite transition horizons", async ({ page }, testInfo) => {
  pages.set("/export-mixed.ics", ["BEGIN:VCALENDAR", ...["Africa/Casablanca", "America/New_York"].flatMap((zone, index) => ["BEGIN:VEVENT",
    "UID:zone-" + index, "DTSTART;TZID=" + zone + ":20200115T090000", "DURATION:PT1H", "SUMMARY:" + zone, "RRULE:FREQ=MONTHLY;COUNT=16", "END:VEVENT"]), "END:VCALENDAR"].join("\r\n"));
  await open(page, [], { inline: true, calendar: { ...moroccoCalendar, timeZone: "utc", sources: [{ id: "mixed", label: "Mixed", ics: "/export-mixed.ics" }] } });
  const text = await exportText(page); evidence(testInfo, "mixed-zones", text);
  expect(zones(text)).toHaveLength(2);
  expect(zones(text).find(zone => zone.includes("TZID:Africa/Casablanca"))).toContain("DTSTART:20210411T030000");
  expect(zones(text).find(zone => zone.includes("TZID:America/New_York"))).toContain("DTSTART:20210314T020000");
  expect(await api(page, "api => api.getCalendarEvents().map(event => event.start).sort()")).toEqual(["2021-04-15T09:00:00Z", "2021-04-15T13:00:00Z"]);
});

test("export preserves a historical transition at a non-quarter-hour minute", async ({ page }, testInfo) => {
  const row = calendarRow("stjohns", "1987-03-15T12:30:00Z", "1987-03-15T13:30:00Z", { rule: "FREQ=MONTHLY;COUNT=3" });
  await open(page, [row], { inline: true, calendar: { timeZone: "America/St_Johns", date: "1987-04-15", view: "month" } });
  const text = await exportText(page); evidence(testInfo, "minute-stjohns", text);
  expect(zones(text)[0]).toContain("DTSTART:19870405T000100\r\nTZOFFSETFROM:-0330\r\nTZOFFSETTO:-0230");
});

for (const [name, rule] of [["COUNT", "FREQ=YEARLY;INTERVAL=101;COUNT=2"], ["UNTIL", "FREQ=YEARLY;UNTIL=21210115T090000Z"], ["unreachable COUNT", "FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30;COUNT=2"]]) {
  test("finite zoned export refuses an uncertified or excessive horizon - " + name, async ({ page }) => {
    await open(page, [morocco(rule)], { inline: true, calendar: moroccoCalendar });
    await expect(exportText(page, "all")).rejects.toThrow("within 100 calendar years");
  });
}

test("unbounded named-zone series need an actionable finite limit in both export paths", async ({ page }) => {
  for (const timeZone of ["Africa/Casablanca", "Europe/Warsaw"]) {
    const errors = await open(page, [morocco("FREQ=MONTHLY")], { inline: true, calendar: { ...moroccoCalendar, timeZone } });
    expect(await api(page, "api => api.getCalendarEvents().length")).toBe(1);
    for (const scope of ["visible", "all"])
      await expect(exportText(page, scope)).rejects.toThrow("needs COUNT or UNTIL ending within 100 calendar years. Add either limit to its recurrence rule.");
    expect(errors).toEqual([]);
    await api(page, "api => api.destroy()");
  }
});

test("an imported unbounded named-zone series cannot be exported through a UTC display zone", async ({ page }) => {
  pages.set("/export-unbounded.ics", ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:unbounded", "DTSTART;TZID=Africa/Casablanca:20200115T090000",
    "DURATION:PT1H", "SUMMARY:Unbounded imported series", "RRULE:FREQ=MONTHLY", "END:VEVENT", "END:VCALENDAR"].join("\r\n"));
  const errors = await open(page, [], { inline: true, calendar: { ...moroccoCalendar, timeZone: "utc", sources: [{ id: "imported", label: "Imported", ics: "/export-unbounded.ics" }] } });
  expect(await api(page, "api => api.getCalendarEvents().map(event => event.start)")).toEqual(["2021-04-15T09:00:00Z"]);
  await expect(exportText(page)).rejects.toThrow("needs COUNT or UNTIL ending within 100 calendar years");
  expect(errors).toEqual([]);
});

test("the iCalendar Export menu shows the finite-limit error without downloading a file", async ({ page }, testInfo) => {
  const downloads = [];
  page.on("download", download => downloads.push(download.suggestedFilename()));
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const errors = await open(page, [morocco("FREQ=MONTHLY")], { inline: true, calendar: moroccoCalendar });
    await nextFrames(page);
    await openGridControl(page, "export");
    const panel = page.locator(".cx-grid-export > .cx-grid-panel");
    await expect(panel).toBeVisible();
    await page.locator(".cx-grid-export select").selectOption("all");
    const button = page.getByRole("button", { name: "iCalendar (.ics)", exact: true });
    await button.click();
    try {
      await expect(page.locator(".cx-grid-export .cx-grid-delivery-status")).toContainText("needs COUNT or UNTIL ending within 100 calendar years. Add either limit to its recurrence rule.");
    } finally {
      await testInfo.attach("export-menu-state-" + width, { body: JSON.stringify({ width, downloads, status: await page.locator(".cx-grid-export .cx-grid-delivery-status").innerText(), events: await api(page, "api => api.getCalendarEvents()") }), contentType: "application/json" });
    }
    await expect(button).toBeEnabled();
    expect(downloads).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-bounded-export-menu-" + width + ".png") });
    await button.press("Escape");
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: "Next period", exact: true }).click();
    await expect(page.getByRole("heading", { name: "May 2021", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  }
});

test("one export bounds the combined finite horizons of the same time zone", async ({ page }) => {
  const early = calendarRow("early", "1914-01-15T08:00:00Z", "1914-01-15T09:00:00Z", { rule: "FREQ=MONTHLY;COUNT=1" });
  const errors = await open(page, [early, morocco("FREQ=MONTHLY;COUNT=16")], { inline: true, calendar: moroccoCalendar });
  // Keep this horizon fixture in a whole-minute era; historical second offsets have their own refusal contract below.
  expect(await page.evaluate(() => {
    const instant = Date.parse("1914-01-15T08:00:00Z"), parts = {};
    for (const part of new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Casablanca", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(instant))) parts[part.type] = part.value;
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - instant;
  })).toBe(0);
  expect(eventCount(await exportText(page))).toBe(1);
  await expect(exportText(page, "all")).rejects.toThrow("limited to 100 calendar years per time zone");
  expect(errors).toEqual([]);
});

test("phone iCalendar captures preserve finite, UTC and all-day recurrence fields", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  for (const [name, row, calendar, expected] of [
    ["finite", morocco("FREQ=MONTHLY;COUNT=16"), moroccoCalendar, "RRULE:FREQ=MONTHLY;COUNT=16\r\n"],
    ["UTC", morocco("FREQ=MONTHLY"), { ...moroccoCalendar, timeZone: "utc" }, "DTSTART:20200115T080000Z\r\n"],
    ["all-day", { ...morocco("FREQ=MONTHLY"), cells: { ...morocco("FREQ=MONTHLY").cells, resource: "true" } }, { ...moroccoCalendar, allDay: "resource" }, "DTSTART;VALUE=DATE:20200115\r\n"]
  ]) {
    const errors = await open(page, [row], { inline: true, calendar });
    await nextFrames(page);
    const text = await exportText(page, "all"); evidence(testInfo, "phone-" + name, text);
    expect(text).toContain(expected);
    expect(text).toContain("RRULE:FREQ=MONTHLY");
    expect(eventCount(text)).toBe(1);
    if (name === "finite") expect(zones(text)[0]).toContain("DTSTART:20210411T030000");
    else expect(zones(text)).toHaveLength(0);
    expect(errors).toEqual([]);
  }
});

test("iCalendar rejects missing or unauthorized mapped fields for captured and visible records", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, [morocco("FREQ=MONTHLY;COUNT=16")], { inline: true, calendar: moroccoCalendar });
  await expect(api(page, "api => api.exportAs('ics', { scope: 'all', columns: ['title', 'starts', 'ends'], download: false })")).rejects.toThrow("needs all mapped calendar columns");
  expect(eventCount(await exportText(page, "all"))).toBe(1);
  await open(page, [morocco("FREQ=MONTHLY;COUNT=16")], { inline: true, calendar: moroccoCalendar }, false, html => {
    const original = '"id":"rule","title":"Rule","kind":"text"', replaced = html.replace(original, original + ',"exportable":false');
    if (replaced === html) throw new Error("Calendar export fixture did not find its recurrence column.");
    return replaced;
  });
  for (const scope of ["visible", "all"])
    await expect(exportText(page, scope)).rejects.toThrow("needs every mapped calendar column to allow export");
});

test("a custom ICS writer keeps its phone projection, captured query and invocation-time provider", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const other = calendarRow("other", "2021-04-15T10:00:00Z", "2021-04-15T11:00:00Z");
  const errors = await open(page, [morocco("FREQ=MONTHLY;COUNT=16"), other], { inline: true, calendar: moroccoCalendar }, false, html => html.replace("</head>", "<script>window.customIcsFormat = { id: 'ics', label: 'Custom ICS', extension: 'ics', async write(capture) { await new Promise(resolve => { window.releaseCustomIcs = resolve; }); const ids = []; for await (const row of capture.rows()) ids.push(row.id); return new Blob([JSON.stringify({ columns: capture.request.columns.map(column => column.id), query: capture.request.query.search, ids })]); } }; CanopyX.configure('calendar-contract', { exportFormats: [window.customIcsFormat] });</script></head>"));
  await nextFrames(page);
  await api(page, "api => api.setQuery({ search: 'morocco' })");
  await api(page, "api => { window.pendingCustomIcs = api.exportAs('ics', { scope: 'filtered', download: false }); window.customIcsFormat.write = () => new Blob(['replacement writer']); }");
  await expect.poll(() => page.evaluate(() => typeof window.releaseCustomIcs)).toBe("function");
  await api(page, "api => api.setQuery({ search: 'other' })");
  const result = await page.evaluate(async () => { window.releaseCustomIcs(); return JSON.parse(await (await window.pendingCustomIcs).blob.text()); });
  expect(result).toEqual({ columns: ["title", "starts", "ends"], query: "morocco", ids: ["morocco"] });
  expect(errors).toEqual([]);
});

test("UTC and all-day unbounded recurrence exports retain their rules", async ({ page }, testInfo) => {
  const row = morocco("FREQ=MONTHLY");
  for (const [timeZone, label] of [["utc", "literal-utc"], ["UTC", "iana-UTC"], ["Etc/UTC", "iana-Etc-UTC"], ["local", "native-local"]]) {
    await open(page, [row], { inline: true, calendar: { ...moroccoCalendar, timeZone } });
    const utc = await exportText(page); expect(utc).toContain("RRULE:FREQ=MONTHLY\r\n");
    expect(zones(utc)).toHaveLength(0);
    expect(utc).toContain("DTSTART:20200115T080000Z\r\n");
    evidence(testInfo, "unbounded-" + label, utc);
    await api(page, "api => api.destroy()");
  }
  await open(page, [{ ...row, cells: { ...row.cells, resource: "true" } }], { inline: true, calendar: { ...moroccoCalendar, allDay: "resource" } });
  const date = await exportText(page); expect(date).toContain("DTSTART;VALUE=DATE:20200115\r\n");
  expect(date).toContain("RRULE:FREQ=MONTHLY\r\n"); expect(zones(date)).toHaveLength(0);
  evidence(testInfo, "unbounded-all-day", date);
});

test("zoned export refuses later-fold starts, ends and exact exclusions instead of changing their instants", async ({ page }) => {
  for (const [id, start, end, extra] of [
    ["fold-start", "2026-11-01T06:30:00Z", "2026-11-01T07:00:00Z", {}],
    ["fold-end", "2026-11-01T04:30:00Z", "2026-11-01T06:30:00Z", {}],
    ["fold-exdate", "2026-10-31T05:30:00Z", "2026-10-31T06:00:00Z", { rule: "FREQ=DAILY;COUNT=3", exceptions: "2026-11-01T06:30:00Z" }]
  ]) {
    const errors = await open(page, [calendarRow(id, start, end, { rule: "FREQ=DAILY;COUNT=2", ...extra })], { inline: true, calendar: { timeZone: "America/New_York", date: "2026-11-01", view: "month" } });
    expect(await api(page, "api => api.getCalendarEvents().length")).toBeGreaterThan(0);
    for (const scope of ["visible", "all"])
      await expect(exportText(page, scope)).rejects.toThrow("second occurrence of a repeated wall time");
    expect(errors).toEqual([]);
  }
});

test("zoned export refuses historical second offsets including the initial calendar-year horizon", async ({ page }) => {
  for (const [id, timeZone, start, end, date] of [
    ["paris-seconds", "Europe/Paris", "1900-01-15T08:50:39Z", "1900-01-15T09:20:39Z", "1900-01-15"],
    ["new-york-seconds", "America/New_York", "1880-01-15T13:56:02Z", "1880-01-15T14:26:02Z", "1880-01-15"],
    ["paris-horizon", "Europe/Paris", "1911-04-15T09:00:00Z", "1911-04-15T09:30:00Z", "1911-04-15"]
  ]) {
    const errors = await open(page, [calendarRow(id, start, end, { rule: "FREQ=DAILY;COUNT=2" })], { inline: true, calendar: { timeZone, date, view: "month" } });
    expect(await api(page, "api => api.getCalendarEvents().length")).toBe(2);
    for (const scope of ["visible", "all"])
      await expect(exportText(page, scope)).rejects.toThrow("whole-minute time zone offsets throughout its calendar-year span");
    expect(errors).toEqual([]);
  }
});

test("representable fold times, milliseconds and UTC single events retain serialized instants", async ({ page }, testInfo) => {
  for (const [id, timeZone, start, end, rule, expected] of [
    ["first-fold", "America/New_York", "2026-11-01T05:30:00Z", "2026-11-01T07:00:00Z", "FREQ=DAILY;COUNT=2", "DTSTART;TZID=America/New_York:20261101T013000"],
    ["milliseconds", "America/New_York", "2026-11-02T06:30:15.123Z", "2026-11-02T07:00:16.987Z", "FREQ=DAILY;COUNT=2", "DTSTART;TZID=America/New_York:20261102T013015\r\nDTEND;TZID=America/New_York:20261102T020016"],
    ["pre-epoch-milliseconds", "Europe/Paris", "1920-01-15T09:00:15.125Z", "1920-01-15T09:30:16.987Z", "FREQ=DAILY;COUNT=2", "DTSTART;TZID=Europe/Paris:19200115T090015\r\nDTEND;TZID=Europe/Paris:19200115T093016"],
    ["single-fold", "America/New_York", "2026-11-01T06:30:00Z", "2026-11-01T07:00:00Z", "", "DTSTART:20261101T063000Z"],
    ["single-historical", "Europe/Paris", "1900-01-15T08:50:39Z", "1900-01-15T09:20:39Z", "", "DTSTART:19000115T085039Z"]
  ]) {
    const errors = await open(page, [calendarRow(id, start, end, { rule })], { inline: true, calendar: { timeZone, date: start.slice(0, 10), view: "month" } });
    for (const scope of ["visible", "all"]) {
      const text = await exportText(page, scope); evidence(testInfo, id + "-" + scope, text);
      expect(eventCount(text)).toBe(1); expect(text).toContain(expected + "\r\n");
      if (!rule) expect(zones(text)).toHaveLength(0);
    }
    expect(errors).toEqual([]);
  }
});

function detailColumns(html) {
  return html.replace(/(<script type="application\/json" class="cx-config">)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
    const view = JSON.parse(json); view.columns.push(...["notes", "sub", "status"].map(id => ({ id, title: id, kind: "text" })));
    Object.assign(view.calendar, { description: "notes", subtitle: "sub", status: "status" });
    return start + JSON.stringify(view) + end;
  });
}

test("mapped description, subtitle, status and resource label survive phone export captures", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const row = calendarRow("details", "2026-10-16T09:00:00Z", "2026-10-16T10:00:00Z", { notes: "Agenda, details; slash\\ and\nsecond line", sub: "Subtitle", status: "Planned", resource: "Room Native" });
  const errors = await open(page, [row], { inline: true }, false, detailColumns);
  await page.waitForFunction(() => document.querySelector('[data-canopyx-host]').classList.contains('cx-phone')); await nextFrames(page);
  for (const scope of ["visible", "all"]) {
    const text = await exportText(page, scope); evidence(testInfo, "description-native-" + scope, text);
    expect(text.replace(/\r\n[ \t]/g, "")).toContain("DESCRIPTION:Agenda\\, details\\; slash\\\\ and\\nsecond line\\nSubtitle\\nPlanned\r\n");
    expect(text).toContain("LOCATION:Room Native\r\n");
  }
  expect(errors).toEqual([]);
});

test("imported descriptions and locations survive actual ICS export and public reimport", async ({ page }, testInfo) => {
  pages.set("/description-input.ics", ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:description", "DTSTART:20261016T090000Z", "DTEND:20261016T100000Z", "SUMMARY:Imported description",
    "DESCRIPTION:Agenda\\, details\\; slash\\\\ and\\nsecond line", "LOCATION:Room 4", "END:VEVENT", "END:VCALENDAR"].join("\r\n"));
  const calendar = { timeZone: "utc", date: "2026-10-16", details: "popover", sources: [{ id: "imported", label: "Imported", ics: "/description-input.ics" }] };
  const errors = await open(page, [], { inline: true, calendar });
  const text = await exportText(page); evidence(testInfo, "description-imported", text);
  expect(text).toContain("DESCRIPTION:Agenda\\, details\\; slash\\\\ and\\nsecond line\r\n");
  expect(text).toContain("LOCATION:Room 4\r\n");
  pages.set("/description-roundtrip.ics", text);
  const roundtripErrors = await open(page, [], { inline: true, calendar: { ...calendar, sources: [{ id: "roundtrip", label: "Roundtrip", ics: "/description-roundtrip.ics" }] } });
  await page.locator(".cx-cal-ev").first().click();
  await expect(page.locator(".cx-cal-det-desc")).toHaveText("Agenda, details; slash\\ and\nsecond line");
  await expect(page.locator(".cx-cal-det-facts")).toContainText("Room 4");
  expect(errors).toEqual([]); expect(roundtripErrors).toEqual([]);
});

test("the Export menu reports unrepresentable zoned data and remains dismissible without a download", async ({ page }, testInfo) => {
  const downloads = []; page.on("download", download => downloads.push(download.suggestedFilename()));
  for (const [width, id, timeZone, start, end, expected] of [
    [1400, "fold", "America/New_York", "2026-11-01T06:30:00Z", "2026-11-01T07:00:00Z", "second occurrence of a repeated wall time"],
    [390, "historical", "Europe/Paris", "1900-01-15T08:50:39Z", "1900-01-15T09:20:39Z", "whole-minute time zone offsets throughout its calendar-year span"]
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const errors = await open(page, [calendarRow(id, start, end, { rule: "FREQ=DAILY;COUNT=2" })], { inline: true, calendar: { timeZone, date: start.slice(0, 10), view: "month" } });
    await page.waitForFunction(width => document.querySelector('[data-canopyx-host]').classList.contains('cx-phone') === (width <= 640), width);
    await nextFrames(page); await openGridControl(page, "export");
    const panel = page.locator(".cx-grid-export > .cx-grid-panel"), button = page.getByRole("button", { name: "iCalendar (.ics)", exact: true });
    await expect(panel).toBeVisible(); await page.locator(".cx-grid-export select").selectOption("all"); await button.click();
    await expect(page.locator(".cx-grid-export .cx-grid-delivery-status")).toContainText(expected);
    await expect(button).toBeEnabled(); expect(downloads).toEqual([]);
    await testInfo.attach("representability-menu-" + id, { body: JSON.stringify({ width, downloads, errors, status: await page.locator(".cx-grid-export .cx-grid-delivery-status").innerText() }), contentType: "application/json" });
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-representability-menu-" + id + "-" + width + ".png") });
    await button.press("Escape"); await expect(panel).toBeHidden();
    const heading = page.getByRole("heading").first(), previous = await heading.innerText();
    await page.getByRole("button", { name: "Next period", exact: true }).click(); await expect(heading).not.toHaveText(previous);
    expect(errors).toEqual([]);
  }
});

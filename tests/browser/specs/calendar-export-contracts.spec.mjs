import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "./calendar-support.mjs";
import { calendarRangePage, calendarRow } from "./calendar-range-support.mjs";

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

async function open(page, rows, options = {}, holdRange = false) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  let html = calendarRangePage(rows, options);
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

test("UTC and all-day unbounded recurrence exports retain their rules", async ({ page }, testInfo) => {
  const row = morocco("FREQ=MONTHLY");
  for (const [timeZone, label] of [["utc", "literal-utc"], ["UTC", "iana-UTC"], ["Etc/UTC", "iana-Etc-UTC"], ["local", "native-local"]]) {
    await open(page, [row], { inline: true, calendar: { ...moroccoCalendar, timeZone } });
    const utc = await exportText(page); expect(utc).toContain("RRULE:FREQ=MONTHLY\r\n");
    if (timeZone === "utc" || timeZone === "local") expect(zones(utc)).toHaveLength(0);
    evidence(testInfo, "unbounded-" + label, utc);
    await api(page, "api => api.destroy()");
  }
  await open(page, [{ ...row, cells: { ...row.cells, resource: "true" } }], { inline: true, calendar: { ...moroccoCalendar, allDay: "resource" } });
  const date = await exportText(page); expect(date).toContain("DTSTART;VALUE=DATE:20200115\r\n");
  expect(date).toContain("RRULE:FREQ=MONTHLY\r\n"); expect(zones(date)).toHaveLength(0);
});

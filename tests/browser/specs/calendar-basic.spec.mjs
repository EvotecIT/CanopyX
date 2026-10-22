// Basic calendars and the opt-in options (docs/calendar.md#quick-start, #levels-and-options): a calendar from a list of events
// with calendar controls only and a details popover, the presets, the parts a basic page leaves out, the simple layouts (mini
// month, week and day lists, stacked months, the year with its events), week numbers, day links, the valid range, six fixed
// weeks, right to left and the timeline without resources.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { examples, runtimeAssets, nextFrames } from "./support.mjs";
import { api, capture, openBuilt, openCalendar } from "./calendar-support.mjs";

/** A page that mounts CanopyX.createCalendar(host, options) with the options as JSON (functions are not needed here). */
function calendarPage(options, { dir = "ltr", lang = "en", height = 680 } = {}) {
  const { script, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"" + lang + "\" dir=\"" + dir + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Calendar</title><style>" +
    style + " body{margin:0;padding:16px} #cal{height:" + height + "px}</style><script>" + script + "</script></head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div><script>" +
    "window.api = CanopyX.createCalendar(document.getElementById('cal'), " + JSON.stringify(options).replace(/</g, "\\u003c") + ");</script></body></html>";
}
const EVENTS = [
  { id: "a", title: "Planning", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:30:00Z", description: "Pick the next work.", tone: "info" },
  { id: "b", title: "Lunch", start: "2026-10-16T12:00:00Z", end: "2026-10-16T13:00:00Z", tone: "success" },
  { id: "c", title: "Trip", start: "2026-10-20", end: "2026-10-23" },
  { id: "d", title: "Review", start: "2026-10-08T14:00:00Z", end: "2026-10-08T15:00:00Z" }
];
const calApi = (page, call) => page.evaluate(call => new Function("api", "return (" + call + ")(api);")(window.api), call);

test.describe("basic calendars", () => {
  test("a list of events makes a read-only month with calendar controls only and a details popover", async ({ page }) => {
    await openBuilt(page, "basic.html", calendarPage({ events: EVENTS, date: "2026-10-16", firstDay: 1 }));
    await expect(page.locator("#cal")).toHaveClass(/cx-cal-bare/);
    await expect(page.locator(".cx-grid-toolbar, .cx-toolbar").filter({ visible: true })).toHaveCount(0);
    await expect(page.locator(".cx-cal-views button")).toHaveText(["Month", "Week", "Day", "Agenda"]);
    const all = await calApi(page, "api => api.getCalendarEvents()");
    expect(all.map(event => event.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(all.find(event => event.id === "c")).toMatchObject({ allDay: true, start: "2026-10-20T00:00:00Z", end: "2026-10-23T00:00:00Z" });
    // Read-only: no drag handles, no creating.
    await expect(page.locator("#cal")).not.toHaveAttribute("data-cx-calendar-editable", "true");
    await capture(page, "calendar-basic-default");
    await page.locator('.cx-cal-ev[data-cx-record="a"]').click();
    const details = page.getByRole("dialog", { name: "Planning" });
    await expect(details).toBeVisible();
    await expect(details).toContainText("Pick the next work.");
    await capture(page, "calendar-basic-popover");
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(page.locator('.cx-cal-ev[data-cx-record="a"]')).toBeFocused();
    expect(await new AxeBuilder({ page }).include("#cal").analyze().then(result => result.violations.map(item => item.id))).toEqual([]);
  });

  test("presets set defaults that each option overrides", async ({ page }) => {
    await openBuilt(page, "standard.html", calendarPage({ events: EVENTS, preset: "standard", date: "2026-10-16" }));
    await expect(page.locator("#cal")).toHaveClass(/cx-cal-no-columns/);
    await expect(page.locator(".cx-cal-views button")).toHaveText(["Month", "Week", "Day", "3 days", "Agenda", "Year"]);
    await openBuilt(page, "scheduler.html", calendarPage({ events: EVENTS, preset: "scheduler", date: "2026-10-16", views: ["week", "day"] }));
    await expect(page.locator("#cal")).toHaveAttribute("data-cx-calendar-editable", "true");
    await expect(page.locator(".cx-cal-views button")).toHaveText(["Week", "Day"]);
    const error = await page.evaluate(() => { try { CanopyX.createCalendar(document.createElement("div"), { preset: "huge" }); return null; } catch (error) { return error.message; } });
    expect(error).toContain("presets are basic, standard and scheduler");
  });

  test("a basic page carries only the core calendar part; the scheduler page carries editing and iCalendar too", () => {
    const basic = fs.readFileSync(path.join(examples, "calendar-basic.html"), "utf8"), scheduler = fs.readFileSync(path.join(examples, "calendar-scheduler.html"), "utf8");
    expect(basic).toContain("calPaintMonth");
    expect(basic).not.toContain("calCreateForm(proposal");
    expect(basic).not.toContain("function calIcsParse");
    expect(scheduler).toContain("calCreateForm(proposal");
    expect(scheduler).toContain("function calIcsParse");
  });
});

test.describe("simple layouts", () => {
  test("the mini month marks days with events and selecting a day reports it", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1200, height: 760 });
    const mini = page.locator(".cx-cal-mini");
    await expect(mini).toBeVisible();
    expect((await mini.boundingBox()).width).toBeLessThanOrEqual(361);
    await expect(mini.locator(".cx-cal-day")).toHaveCount(42);
    await expect(mini.locator('.cx-cal-day[data-cx-day] .cx-cal-dots > i').first()).toBeVisible();
    await capture(page, "calendar-mini-month");
    const day = mini.locator(".cx-cal-day.cx-cal-today");
    await day.click();
    await expect(day).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cx-cal-mini .cx-cal-day:focus")).toHaveAttribute("aria-label", /October 17/);
  });

  test("the week and day lists show each day's events without a time axis", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1440, height: 760 });
    await api(page, "api => api.setCalendarView('weekList')");
    await expect(page.locator(".cx-cal-lday")).toHaveCount(7);
    await expect(page.locator(".cx-cal-lday.cx-cal-today .cx-cal-ev")).toHaveCount(5);
    await expect(page.locator(".cx-cal-slot")).toHaveCount(0);
    await capture(page, "calendar-day-grid-week");
    await page.locator(".cx-cal-lday.cx-cal-today").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".cx-cal-lday:focus")).toHaveAttribute("data-cx-day", String(Date.UTC(2026, 9, 15) / 86400000));
    // On a phone the days stack, their events aligned under the day's name.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator(".cx-cal-lday").first().evaluate(day => getComputedStyle(day).alignItems)).toBe("stretch");
    const [head, item] = await Promise.all([page.locator(".cx-cal-lday .cx-cal-lhead").first().boundingBox(), page.locator(".cx-cal-lday .cx-cal-ev").first().boundingBox()]);
    expect(Math.abs(head.x - item.x)).toBeLessThan(2);
    await page.setViewportSize({ width: 1440, height: 760 });
    await api(page, "api => api.setCalendarView('dayList')");
    await expect(page.locator(".cx-cal-lday")).toHaveCount(1);
    // The list follows the focused day.
    await expect(page.locator(".cx-cal-title")).toHaveText(/October 15/);
  });

  test("stacked months show several months that scroll, each day once", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1440, height: 900 });
    await api(page, "api => api.setCalendarView('months')");
    await expect(page.locator(".cx-cal-mblock")).toHaveCount(3);
    await expect(page.locator(".cx-cal-mtitle")).toHaveText(["October 2026", "November 2026", "December 2026"]);
    const days = await page.locator(".cx-cal-months .cx-cal-day[data-cx-day]").evaluateAll(cells => cells.map(cell => cell.dataset.cxDay));
    expect(new Set(days).size).toBe(days.length);
    await capture(page, "calendar-stacked-months");
    expect(await api(page, "api => api.getCalendar().to")).toBe("2026-12-31");
  });

  test("the year view lists each month's events when yearEvents is on", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1440, height: 1000 });
    await api(page, "api => api.setCalendarView('year')");
    await expect(page.locator(".cx-cal-ylist .cx-cal-ev").first()).toBeVisible();
    await capture(page, "calendar-year-events");
  });

  test("week numbers, day links and fixed six weeks", async ({ page }) => {
    await openBuilt(page, "small.html", calendarPage({ events: EVENTS, date: "2026-02-10", firstDay: 1, calendar: { weekNumbers: "iso", fixedWeeks: true, outsideDays: false } }));
    // February 2026 fits four weeks; fixedWeeks keeps six rows. Outside days are empty pads.
    await expect(page.locator(".cx-cal-week")).toHaveCount(6);
    await expect(page.locator(".cx-cal-wknum").first()).toHaveText("W5");
    await expect(page.locator(".cx-cal-pad").first()).toBeVisible();
    // The day number opens that day.
    await page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 1, 12) / 86400000 + '"] .cx-cal-num').click();
    await expect.poll(() => calApi(page, "api => api.getCalendar()").then(state => [state.view, state.date])).toEqual(["day", "2026-02-12"]);
  });

  test("a resize during a held day link preserves its click target and navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openBuilt(page, "held-day.html", calendarPage({ events: EVENTS, date: "2026-02-10", firstDay: 1,
      calendar: { weekNumbers: "iso", fixedWeeks: true, outsideDays: false } }));
    const number = page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 1, 12) / 86400000 + '"] .cx-cal-num');
    const held = await number.elementHandle();
    await number.hover(); await page.mouse.down();
    try {
      await page.setViewportSize({ width: 1407, height: 900 });
      await nextFrames(page);
      expect(await held.evaluate(element => element.isConnected)).toBe(true);
      expect((await calApi(page, "api => api.getCalendar()")).view).toBe("month");
    } finally { await page.mouse.up(); }
    await expect.poll(() => calApi(page, "api => api.getCalendar()").then(state => [state.view, state.date])).toEqual(["day", "2026-02-12"]);
  });

  test("the valid range keeps navigation, selection and focus inside it", async ({ page }) => {
    await openBuilt(page, "valid.html", calendarPage({ events: EVENTS, date: "2026-10-16", firstDay: 1, calendar: { validRange: { start: "2026-10-05", end: "2026-10-26" } } }));
    await expect(page.locator(".cx-cal-invalid").first()).toBeVisible();
    await expect(page.locator(".cx-cal-prev")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".cx-cal-next")).toHaveAttribute("aria-disabled", "true");
    const first = page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 5) / 86400000 + '"]');
    await first.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(first).toBeFocused();
  });
});

test.describe("right to left", () => {
  test("the month mirrors, arrow keys follow the reading direction and the timeline runs from the right", async ({ page }) => {
    await openCalendar(page, "calendar-rtl.html", { width: 1200, height: 800 });
    await expect(page.locator(".cx-calendar")).toHaveClass(/cx-cal-rtl/);
    const monday = await page.locator(".cx-cal-day").nth(0).boundingBox(), tuesday = await page.locator(".cx-cal-day").nth(1).boundingBox();
    expect(tuesday.x).toBeLessThan(monday.x);
    await capture(page, "calendar-rtl");
    const today = page.locator(".cx-cal-day.cx-cal-today");
    await today.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".cx-cal-day:focus")).toHaveAttribute("data-cx-day", String(Date.UTC(2026, 9, 17) / 86400000));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cx-cal-day:focus")).toHaveAttribute("data-cx-day", String(Date.UTC(2026, 9, 15) / 86400000));
    await openBuilt(page, "rtl-timeline.html", calendarPage({ events: EVENTS, date: "2026-10-12", firstDay: 1, view: "timeline", views: ["timeline", "month"] }, { dir: "rtl" }));
    const lane = await page.locator(".cx-tl-canvas").boundingBox(), early = await page.locator('.cx-cal-ev[data-cx-record="a"]').boundingBox(), late = await page.locator('.cx-cal-ev[data-cx-record="c"]').boundingBox();
    expect(early.x).toBeGreaterThan(late.x);
    expect(early.x + early.width).toBeLessThanOrEqual(lane.x + lane.width + 1);
  });
});

test.describe("timeline without resources", () => {
  test("events pack into rows by overlap over a custom span", async ({ page }) => {
    await openCalendar(page, "calendar-solo.html", { width: 1440, height: 700 });
    await expect(page.locator(".cx-tl-solo")).toBeVisible();
    expect(await api(page, "api => api.getCalendar()")).toMatchObject({ view: "timeline", from: "2026-10-05", to: "2026-11-15" });
    const tops = await page.locator(".cx-tl-lanes .cx-cal-ev, .cx-tl-canvas .cx-cal-ev").evaluateAll(bars => bars.map(bar => Math.round(bar.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeGreaterThan(1);
    expect(new Set(tops).size).toBeLessThanOrEqual(4);
    await capture(page, "calendar-timeline-solo");
    await page.locator(".cx-cal-next").click();
    expect(await api(page, "api => api.getCalendar().from")).toBe("2026-11-16");
  });
});

test.describe("builder options", () => {
  test("export, views and calendar keys override the preset; an all-day Date keeps its own day", async ({ page }) => {
    await openBuilt(page, "options.html", calendarPage({ events: EVENTS, preset: "standard", export: false, date: "2026-10-16" }));
    await expect(page.locator(".cx-grid-export")).toBeHidden();
    const definition = await page.evaluate(() => {
      const host = document.createElement("div"); document.body.appendChild(host);
      const api = CanopyX.createCalendar(host, { preset: "scheduler", views: ["week", "month"], resources: [{ id: "r1", label: "Room" }], calendar: { create: { minutes: 30 } },
        events: [{ title: "Holiday", start: new Date(2026, 9, 16), allDay: true }] });
      return { views: api.view.calendar.views, create: api.view.calendar.create, start: api.view.rows[0].cells.start, allDay: api.view.columns.some(column => column.id === "allDay" && column.editable) };
    });
    // The host's views stay as given (no timeline added); create inside calendar makes the columns editable; the date is the local one.
    expect(definition).toEqual({ views: ["week", "month"], create: { minutes: 30 }, start: "2026-10-16T00:00:00Z", allDay: true });
  });

  test("on a phone, toolbar controls the calendar chose stay reachable without the More menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuilt(page, "phone-toolbar.html", calendarPage({ events: EVENTS, preset: "standard", date: "2026-10-16" }));
    await expect(page.locator(".cx-grid-export")).toBeVisible();
    await expect(page.locator(".cx-grid-overflow")).toHaveCount(0);
  });
});

test.describe("review guards", () => {
  test("a timeline without resources never names a lane as a resource", async ({ page }) => {
    await openBuilt(page, "solo-guard.html", calendarPage({ events: [...EVENTS, { id: "r", title: "Room booking", start: "2026-10-13T09:00:00Z", end: "2026-10-13T10:00:00Z", resource: "room-1" }],
      date: "2026-10-12", firstDay: 1, view: "timeline", views: ["timeline", "month"], links: true }));
    const links = [];
    await page.exposeFunction("onLink", detail => links.push(detail));
    await page.evaluate(() => document.getElementById("cal").addEventListener("canopyx:linkchange", event => window.onLink(event.detail)));
    await page.locator(".cx-tl-cell").first().focus();
    await page.keyboard.press("Space");
    await expect.poll(() => page.evaluate(() => window.api.getCalendar().view)).toBe("timeline");
    for (const detail of links) expect(JSON.stringify(detail)).not.toContain("lane-");
  });

  test("the year's event lists keep their tab stops", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1440, height: 1000 });
    await api(page, "api => api.setCalendarView('year')");
    // The event chips under each month are tab stops of their own, after the days' single one, and stay so across repaints.
    await page.locator(".cx-cal-yday.cx-cal-today").focus();
    await api(page, "api => api.setCalendarDate('2026-10-17')");
    const chip = page.locator(".cx-cal-ylist .cx-cal-ev").first();
    await expect(chip).toHaveAttribute("tabindex", "0");
    await chip.focus();
    await expect(chip).toBeFocused();
    await expect(chip).toHaveAttribute("tabindex", "0");
  });
});

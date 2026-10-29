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
  for (const dark of [false, true]) {
    test(`the year fits a narrow host in ${dark ? "dark" : "light"}`, async ({ page }) => {
      await page.setViewportSize({ width: 300, height: 760 });
      await openBuilt(page, "narrow-year.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "year", views: ["year"], calendar: { phone: "year" } }));
      await page.locator("#cal").evaluate((host, dark) => host.dataset.cxTheme = dark ? "dark" : "light", dark);
      await expect(page.locator(".cx-cal-year")).toBeVisible();
      const bounds = await page.locator(".cx-cal-body").evaluate(body => ({ width: body.clientWidth, scroll: body.scrollWidth,
        right: body.getBoundingClientRect().right, lastDay: body.querySelector(".cx-cal-yweek").lastElementChild.getBoundingClientRect().right }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.lastDay).toBeLessThanOrEqual(bounds.right);
      await capture(page, `year-narrow-${dark ? "dark" : "light"}`);
    });

    test(`the busiest year days keep a contrasting event dot in ${dark ? "dark" : "light"}`, async ({ page }) => {
      await openBuilt(page, "year-dot.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "year", views: ["year"] }));
      await page.locator("#cal").evaluate((host, dark) => host.dataset.cxTheme = dark ? "dark" : "light", dark);
      const colors = await page.locator('.cx-cal-yday[data-cx-heat="4"]').first().evaluate(day => ({
        dot: getComputedStyle(day, "::after").backgroundColor, fill: getComputedStyle(day).backgroundColor
      }));
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const levels = [luminance(colors.dot), luminance(colors.fill)].sort((a, b) => a - b);
      expect((levels[1] + 0.05) / (levels[0] + 0.05)).toBeGreaterThanOrEqual(3);
      await capture(page, `year-dot-${dark ? "dark" : "light"}`);
    });
  }

  test("stacked months never move a multi-day bar's start to a later column", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html");
    await api(page, "api => api.setCalendarView('months')");
    const monday = Date.UTC(2026, 9, 19) / 86400000;
    const cell = page.locator(`.cx-cal-months .cx-cal-day[data-cx-day="${monday}"]`);
    const week = cell.locator("..");
    const bars = week.locator('.cx-cal-ev-bar').filter({ hasText: "On call: Tom" });
    const columns = await bars.evaluateAll(elements => elements.map(element => Number(element.style.getPropertyValue("--c"))));
    // A crowded week may fold the whole segment into More, but it must never invent a later start.
    expect(columns.every(column => column === 0)).toBe(true);
    const friday = week.locator(`.cx-cal-day[data-cx-day="${monday + 4}"] .cx-cal-ev-chip`).first();
    if (columns.length && await friday.count()) {
      const bar = await bars.first().boundingBox(), timed = await friday.boundingBox();
      expect(bar.y + bar.height).toBeLessThanOrEqual(timed.y);
    }
    if (!columns.length) {
      await cell.locator(".cx-cal-more-btn").click();
      await expect(page.locator(".cx-cal-more .cx-cal-ev").filter({ hasText: "On call: Tom" })).toBeVisible();
    }
  });

  test("stacked months fill a free event line before showing more", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html");
    await api(page, "api => api.setCalendarView('months')");
    const tuesday = page.locator(`.cx-cal-months .cx-cal-day[data-cx-day="${Date.UTC(2026, 9, 13) / 86400000}"]`);
    await expect(tuesday.locator(".cx-cal-ev-chip")).toHaveCount(2);
    await expect(tuesday.locator(".cx-cal-more-btn")).toHaveCount(0);
    const cell = page.locator(`.cx-cal-months .cx-cal-day[data-cx-day="${Date.UTC(2026, 9, 16) / 86400000}"]`);
    await expect(cell.locator(".cx-cal-more-btn")).toBeVisible();
    const events = cell.locator(".cx-cal-ev");
    expect(await events.count()).toBeGreaterThan(0);
    const event = await events.first().boundingBox(), more = await cell.locator(".cx-cal-more-btn").boundingBox();
    expect(event.y + event.height).toBeLessThanOrEqual(more.y + 1);
  });

  test("mini month marks its displayed date separately from today", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html");
    await api(page, "api => api.setCalendarDate('2026-10-20')");
    const selected = page.locator('.cx-cal-mini .cx-cal-day[data-cx-listed]');
    await expect(selected).toHaveAttribute("data-cx-day", String(Date.UTC(2026, 9, 20) / 86400000));
    expect(await selected.locator(".cx-cal-num").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
    await expect(page.locator(".cx-cal-mini .cx-cal-today")).toHaveAttribute("data-cx-day", String(Date.UTC(2026, 9, 16) / 86400000));
  });

  for (const view of ["month", "months"]) {
    test(`${view} fills free lanes around overlapping bars and prints its final lanes in full`, async ({ page }) => {
      const bars = [
        { id: "a", title: "Monday to Tuesday", start: "2026-10-12", end: "2026-10-14", allDay: true },
        { id: "b", title: "Tuesday to Wednesday", start: "2026-10-13", end: "2026-10-15", allDay: true }
      ];
      const timed = Array.from({ length: 3 }, (_, index) => ({ id: "t" + index, title: "Timed " + index,
        start: `2026-10-14T${10 + index}:00:00Z`, end: `2026-10-14T${10 + index}:30:00Z` }));
      const options = { events: [...bars, ...timed.slice(0, 2)], date: "2026-10-16", view, views: [view], firstDay: 1,
        calendar: { eventLimit: 3, hiddenDays: [0, 6] } };
      await openBuilt(page, "free-lanes.html", calendarPage(options));
      const day = `.cx-cal-day[data-cx-day="${Date.UTC(2026, 9, 14) / 86400000}"]`;
      await expect(page.locator(day + " .cx-cal-ev-chip")).toHaveCount(2);
      await expect(page.locator(day + " .cx-cal-more-btn")).toHaveCount(0);
      await openBuilt(page, "print-lanes.html", calendarPage({ ...options, events: [...bars, ...timed] }));
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      await expect(page.locator(day + " .cx-cal-ev-chip")).toHaveCount(3);
      await expect(page.locator(".cx-cal-more-btn")).toHaveCount(0);
      expect(await page.locator(".cx-cal-week").evaluateAll(rows => rows.some(row => row.scrollHeight > row.clientHeight + 1))).toBe(false);
    });
  }

  test("the mini month marks days with events and selecting a day reports it", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1200, height: 760 });
    const mini = page.locator(".cx-cal-mini");
    await expect(mini).toBeVisible();
    expect((await mini.boundingBox()).width).toBeGreaterThan(700);
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
    await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
    await openCalendar(page, "calendar-layouts.html", { width: 1440, height: 1000 });
    await api(page, "api => api.setCalendarView('year')");
    await expect(page.locator(".cx-cal-ylist .cx-cal-ev").first()).toBeVisible();
    await expect(page.locator('.cx-cal-yday[data-cx-heat]').first()).toBeVisible();
    await expect(page.locator('.cx-cal-yday[aria-current="date"]')).toHaveCount(1);
    await capture(page, "calendar-year-events");
  });

  for (const width of [1100, 1440]) for (const dark of [false, true]) {
    test(`the toolbar stays in place across layouts at ${width} ${dark ? "dark" : "light"}`, async ({ page }) => {
      await openCalendar(page, "calendar-layouts.html", { width, dark });
      const positions = [];
      for (const view of ["mini", "weekList", "dayList", "months", "year", "month"]) {
        await api(page, "api => api.setCalendarView(arg)", view);
        await nextFrames(page);
        positions.push(await page.evaluate(() => Object.fromEntries([".cx-cal-nav", ".cx-cal-title", ".cx-cal-jumpbox", ".cx-cal-views"].map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [selector, { x: Math.round(rect.x), y: Math.round(rect.y) }];
        }))));
      }
      expect(positions.every(position => JSON.stringify(position) === JSON.stringify(positions[0]))).toBe(true);
    });
  }

  test("week list shows a multi-day event without repeating its range and keeps short times together", async ({ page }) => {
    await openCalendar(page, "calendar-layouts.html", { width: 1100 });
    await api(page, "api => api.setCalendarView('weekList')");
    const onCall = page.locator('.cx-cal-lday .cx-cal-ev[aria-label^="On call: Ana"]');
    await expect(onCall).toHaveCount(7);
    await expect(onCall.first().locator('.cx-cal-ev-time')).toHaveText('8:00 AM');
    for (let index = 1; index < 7; index++) await expect(onCall.nth(index).locator('.cx-cal-ev-time')).toHaveText('All day');
    await expect(onCall.first()).toHaveAttribute('aria-label', /Oct 12.*Oct 19/);
    const standup = page.locator('.cx-cal-lday .cx-cal-ev[aria-label^="Stand-up"]').first();
    const geometry = await standup.evaluate(element => {
      const time = element.querySelector('.cx-cal-ev-time').getBoundingClientRect();
      const icon = element.querySelector('.cx-cal-ico').getBoundingClientRect();
      return { timeHeight: time.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight), gap: icon.left - time.right, sameRow: Math.abs(icon.top - time.top) < 5 };
    });
    expect(geometry.timeHeight).toBeLessThan(geometry.lineHeight + 2);
    expect(geometry.gap).toBeLessThan(12);
    expect(geometry.sameRow).toBe(true);
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
    // Initial sizing may replace a pre-hover handle; observe the node that actually receives the press.
    await page.evaluate(() => document.addEventListener("pointerdown", event => {
      window.__heldCalendarDay = event.target.closest(".cx-cal-num");
    }, { once: true, capture: true }));
    await number.hover(); await page.mouse.down();
    const held = await page.evaluateHandle(() => window.__heldCalendarDay);
    try {
      expect(await held.evaluate(element => element?.textContent)).toBe("12");
      await page.setViewportSize({ width: 1407, height: 900 });
      await nextFrames(page);
      expect(await held.evaluate(element => element.isConnected)).toBe(true);
      expect((await calApi(page, "api => api.getCalendar()")).view).toBe("month");
    } finally { await page.mouse.up(); await held.dispose(); }
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
    expect(await api(page, "api => api.getCalendar()")).toMatchObject({ view: "timeline", from: "2026-09-28", to: "2026-11-15" });
    const bounds = await page.evaluate(() => ({ left: document.querySelector('.cx-tl-main').getBoundingClientRect().left,
      bar: document.querySelector('.cx-tl-lane .cx-cal-ev-lane[aria-label^="Design"]').getBoundingClientRect().left }));
    expect(bounds.bar).toBeGreaterThan(bounds.left + 2);
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

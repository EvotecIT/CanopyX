// Calendar views (docs/calendar.md): month with "+N more", week and day with overlapping columns and the all-day row, N days,
// agenda and year, at desktop and phone widths in both palettes, their keyboard models, navigation, saved state, the page
// language, time zones and DST, and event text that is never markup.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";
import { api, capture, openCalendar, NOW } from "./calendar-support.mjs";

const day = text => Math.floor(Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) / 86400000);
const live = page => page.locator(".cx-cal .cx-live");
async function axe(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter(item => ["serious", "critical"].includes(item.impact)).map(item => item.id + ": " + item.nodes.slice(0, 3).map(node => node.target.join(" ")).join(", "));
}

/** Enters the composite through Tab, then reaches and scrolls its timed rowgroup using the grid's own keys. */
async function enterTimeScroller(page) {
  const body = page.locator(".cx-cal-body"), scroller = body.locator(".cx-cal-scroll");
  await expect(body.locator('[tabindex="0"]')).toHaveCount(1);
  await page.locator(".cx-cal-bar button:visible,.cx-cal-bar select:visible").last().focus();
  // A phone's resource picker precedes the grid. It is an ordinary control, separate from the grid's roving cell.
  for (let at = 0; at < 3; at++) {
    await page.keyboard.press("Tab");
    if (await page.locator(".cx-cal-time :focus").count()) break;
  }
  await expect(page.locator(".cx-cal-time :focus")).toHaveCount(1);
  if (await page.locator(".cx-cal-allcell:focus").count()) await page.keyboard.press("ArrowDown");
  if (await page.locator(".cx-cal-ev:focus").count()) await page.keyboard.press("Escape");
  const first = page.locator(".cx-cal-slot:focus");
  await expect(first).toHaveCount(1);
  const column = await first.evaluate(cell => ({ day: cell.dataset.cxDay, resource: cell.dataset.cxResource }));
  const start = await scroller.evaluate(element => element.scrollTop);
  await page.keyboard.press("End");
  const last = body.locator('.cx-cal-slot[data-cx-day="' + column.day + '"]' +
    (column.resource === undefined ? "" : '[data-cx-resource="' + column.resource + '"]')).last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: 0.9 });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(start);
  await expect(body.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(scroller.locator('[tabindex="0"]')).toHaveCount(1);
}

test.describe("calendar views", () => {
  for (const view of ["month", "week", "day", "days", "agenda", "year"]) {
    for (const width of [1440, 390]) {
      test(view + " view at " + width + " paints in both palettes and passes axe", async ({ page }) => {
        for (const dark of [false, true]) {
          await openCalendar(page, "calendar.html", { dark, width });
          await api(page, "(api, element, view) => api.setCalendarView(view)", view);
          await nextFrames(page);
          expect(await api(page, "api => api.getCalendar().view")).toBe(view);
          await expect(page.locator(".cx-cal-body [role=grid], .cx-cal-year [role=grid]").first()).toBeVisible();
          // The all-day row and timed scroller form one composite grid. Exercise its actual keyboard entry before the
          // static scroll-region rule: it cannot infer ArrowDown from the all-day roving cell into the timed rowgroup.
          if (["week", "day", "days"].includes(view)) await enterTimeScroller(page);
          expect(await axe(page)).toEqual([]);
          // Nothing overflows the page sideways at phone width.
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
          await capture(page, "views/" + view + "-" + (dark ? "dark" : "light") + "-" + width);
        }
      });
    }
  }

  for (const width of [1440, 390]) {
    test("an empty time grid remains keyboard-scrollable and passes axe at " + width, async ({ page }) => {
      await openCalendar(page, "calendar.html", { width });
      await api(page, "api => api.setQuery({ search: '__NO_CALENDAR_EVENTS__' })");
      await api(page, "api => api.setCalendarView('day')");
      await expect.poll(() => api(page, "api => api.getCalendarEvents().length")).toBe(0);
      await enterTimeScroller(page);
      expect(await axe(page)).toEqual([]);
    });

    test("resource columns keep keyboard scroll in their own column and pass axe at " + width, async ({ page }) => {
      await openCalendar(page, "calendar-resources.html", { width });
      await api(page, "api => api.setCalendarView('day')");
      await enterTimeScroller(page);
      await expect(page.locator(".cx-cal-slot:focus")).toHaveAttribute("data-cx-resource", /.+/);
      expect(await axe(page)).toEqual([]);
    });
  }

  test("the month folds a busy day into +N more, whose list takes focus and gives it back", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    const cell = page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-20") + '"]');
    const more = cell.locator(".cx-cal-more-btn");
    await expect(more).toHaveText(/^\+\d+ more$/);
    // The day's accessible name counts every event on it, including bars that start on an earlier day.
    const total = Number((await cell.getAttribute("aria-label")).match(/(\d+) events$/)[1]);
    await more.click();
    const list = page.getByRole("dialog", { name: /^Events on Tuesday, October 20, 2026$/ });
    await expect(list).toBeVisible();
    await expect(list.locator(".cx-cal-ev")).toHaveCount(total);
    await expect(list.locator(".cx-cal-ev").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(list.locator(".cx-cal-ev").nth(1)).toBeFocused();
    await capture(page, "month-more-light-1440");
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(more).toBeFocused();
    // A multi-day bar continues across the week boundary, cut where it continues.
    const bar = page.locator('.cx-cal-ev-bar[aria-label^="Storage array migration"]');
    await expect(bar).toHaveCount(1);
    expect(await bar.getAttribute("style")).toContain("--s: 4");
  });

  test("the month's keyboard walks days, periods and into a day's events", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    const focusDay = page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-16") + '"]');
    await focusDay.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-17") + '"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-24") + '"]')).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-19") + '"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-25") + '"]')).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect.poll(() => api(page, "api => api.getCalendar().date")).toBe("2026-11-01");
    await expect(page.locator(".cx-cal-title")).toHaveText("November 2026");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-11-25") + '"]')).toBeFocused();
    await expect(live(page)).toHaveText("Month, November 2026");
    await page.keyboard.press("PageUp");
    await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-25") + '"]')).toBeFocused();
    // Enter goes into the day; Enter on an event opens its record; Escape returns to the event.
    await page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-16") + '"]').focus();
    await page.keyboard.press("Enter");
    const first = page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-16") + '"] .cx-cal-ev').first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-label", /, (Planned|Done|Running|Incident|Warning|Expired)/);
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.cx-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
    await expect(first).toBeFocused();
  });

  test("week and day views place overlapping events side by side and keep the all-day row", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    const friday = await page.evaluate(() => [...document.querySelectorAll(".cx-cal-slots .cx-cal-ev-block")].filter(element => element._calEvent.sd === Math.floor(Date.UTC(2026, 9, 16) / 86400000))
      .map(element => ({ title: element._calEvent.title, col: element.style.getPropertyValue("--c"), cols: element.style.getPropertyValue("--k") })));
    const failover = friday.find(item => item.title === "Database failover test"), latency = friday.find(item => item.title.startsWith("Disk latency"));
    expect(failover.cols).toBe(latency.cols);
    expect(failover.col).not.toBe(latency.col);
    await expect(page.locator(".cx-cal-allrow .cx-cal-ev-bar", { hasText: "Quarterly certificate renewal window" })).toBeVisible();
    // The now line sits in today's column at 10:30.
    expect(await page.locator(".cx-cal-now").evaluate(element => [element.style.getPropertyValue("--t"), element.hidden])).toEqual(["630", false]);
    // An event over midnight shows in both days.
    await expect(page.locator('.cx-cal-ev-block[aria-label^="Core switch firmware upgrade"]')).toHaveCount(2);
    await capture(page, "week-overlaps-light-1440");
    // The keyboard walks slots and extends a selection with Shift (calendar-links.spec.mjs checks what it reports).
    const slot = page.locator('.cx-cal-slot[data-cx-day="' + day("2026-10-14") + '"][data-cx-minutes="540"]');
    await slot.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('.cx-cal-slot[data-cx-day="' + day("2026-10-14") + '"][data-cx-minutes="570"]')).toBeFocused();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(live(page)).toHaveText(/^Selected Wednesday, October 14, 2026 9:30 AM – 11:00 AM$/);
    await expect(page.locator('.cx-cal-slot[aria-selected="true"]')).toHaveCount(3);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('.cx-cal-slot[data-cx-day="' + day("2026-10-15") + '"][data-cx-minutes="630"]')).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    await expect(page.locator('.cx-cal-slot[data-cx-day="' + day("2026-10-15") + '"][data-cx-minutes="0"]')).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('.cx-cal-allcell[data-cx-day="' + day("2026-10-15") + '"]')).toBeFocused();
    // Day view with three days and the N-day view.
    await api(page, "api => api.setCalendarView('days')");
    await expect(page.locator(".cx-cal-dayhead")).toHaveCount(3);
    await api(page, "api => api.setCalendarView('day')");
    await expect(page.locator(".cx-cal-dayhead")).toHaveCount(1);
    await expect(page.locator(".cx-cal-title")).toHaveText("Thursday, October 15, 2026");
  });

  test("the agenda lists the period by day and its rows take the keys", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('agenda')");
    await expect(page.locator(".cx-cal-agroup").first()).toBeVisible();
    const today = page.locator('.cx-cal-agroup.cx-cal-today .cx-cal-ahead-c');
    await expect(today).toContainText("Today");
    const rows = page.locator(".cx-cal-arow");
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.cx-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await capture(page, "agenda-light-1440");
  });

  test("the year shades each day by its number of events", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('year')");
    await expect(page.locator(".cx-cal-ymonth")).toHaveCount(12);
    const busy = page.locator('.cx-cal-yday[data-cx-day="' + day("2026-10-20") + '"]');
    await expect(busy).toHaveAttribute("data-cx-heat", "4");
    await expect(busy).toHaveAttribute("aria-label", /events$/);
    await busy.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('.cx-cal-yday[data-cx-day="' + day("2026-10-27") + '"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => api(page, "api => [api.getCalendar().view, api.getCalendar().date]")).toEqual(["day", "2026-10-27"]);
  });

  test("navigation keeps the title, the announcements and the saved state in step", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await expect(page.locator(".cx-cal-title")).toHaveText("October 2026");
    await expect(page.locator(".cx-cal-gotoday")).toHaveAttribute("aria-disabled", "true");
    await page.locator(".cx-cal-next").click();
    await expect(page.locator(".cx-cal-title")).toHaveText("November 2026");
    await expect(page.locator(".cx-cal-gotoday")).toBeEnabled();
    await page.locator(".cx-cal-view[data-cx-cal-view=week]").click();
    await expect(page.locator(".cx-cal-view[data-cx-cal-view=week]")).toHaveAttribute("aria-pressed", "true");
    await expect(live(page)).toHaveText(/^Week, /);
    // The native picker sits behind a button that writes the date in the page language where the browser can open it.
    await page.locator(".cx-cal-jump").evaluate(input => { input.value = "2027-02-10"; input.dispatchEvent(new Event("change")); });
    await expect(page.locator(".cx-cal-title")).toHaveText("Feb 8 – 14, 2027");
    if (await page.locator(".cx-cal-jumpbtn").count()) await expect(page.locator(".cx-cal-jumpbtn")).toHaveText("Feb 10, 2027");
    const state = await api(page, "api => api.getState()");
    expect(state.calendar).toEqual({ view: "week", date: "2027-02-10", zoom: "day" });
    await page.locator(".cx-cal-gotoday").click();
    await expect(page.locator(".cx-cal-title")).toHaveText("Oct 12 – 18, 2026");
    await api(page, "(api, element, state) => api.setState(state)", state);
    await expect.poll(() => api(page, "api => api.getCalendar().date")).toBe("2027-02-10");
    await api(page, "api => api.resetView()");
    await expect.poll(() => api(page, "api => [api.getCalendar().view, api.getCalendar().date]")).toEqual(["month", "2026-10-16"]);
  });

  test("phones start in the agenda and get three days and a month of dots", async ({ page }) => {
    await openCalendar(page, "calendar.html", { width: 390, height: 780 });
    await expect.poll(() => api(page, "api => api.getCalendar().view")).toBe("agenda");
    await expect(page.locator(".cx-cal-view-select")).toBeVisible();
    await expect(page.locator(".cx-cal-views")).toBeHidden();
    await api(page, "api => api.setCalendarView('days')");
    await expect(page.locator(".cx-cal-dayhead")).toHaveCount(3);
    await api(page, "api => api.setCalendarView('month')");
    await expect(page.locator(".cx-cal-dots").first()).toBeVisible();
    // Today's list follows the short weeks of dots, in view without scrolling.
    await expect(page.locator(".cx-cal-daylist-h")).toHaveText("Friday, October 16, 2026");
    await expect(page.locator(".cx-cal-daylist-h")).toBeInViewport();
    await expect(page.locator('.cx-cal-day[data-cx-listed]')).toHaveAttribute("data-cx-day", String(day("2026-10-16")));
    await page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-19") + '"]').click();
    await expect(page.locator(".cx-cal-daylist-h")).toHaveText("Monday, October 19, 2026");
    await expect(page.locator(".cx-cal-daylist .cx-cal-ev")).not.toHaveCount(0);
    await expect(page.locator('.cx-cal-day[data-cx-listed]')).toHaveAttribute("data-cx-day", String(day("2026-10-19")));
    await capture(page, "month-phone-light-390");
  });

  test("Polish and German pages write every date and label in their language", async ({ page }) => {
    for (const [name, month, today, english] of [["calendar-pl.html", "październik 2026", "Dzisiaj", /October|Monday|Today/], ["calendar-de.html", "Oktober 2026", "Heute", /October|Monday|Today/]]) {
      await openCalendar(page, name);
      await api(page, "api => api.resetView()");
      await expect(page.locator(".cx-cal-title")).toHaveText(month);
      await expect(page.locator(".cx-cal-gotoday")).toHaveText(today);
      expect(await page.locator(".cx-cal").innerText()).not.toMatch(english);
      await capture(page, "locale-" + name.slice(9, 11) + "-light-1440");
      await api(page, "api => api.setCalendarView('week')");
      expect(await page.locator(".cx-cal").innerText()).not.toMatch(english);
    }
  });

  test("record text is text, never markup, in every view", async ({ page }) => {
    const view = { protocol: "canopyx/2", type: "grid", id: "xss", label: "Calendar", rowHeight: 34, pageSize: 50, selection: "single", search: true,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime" }, { id: "owner", title: "Owner", kind: "text" }],
      source: { kind: "inline" }, rows: [{ id: "a", cells: { title: "<img src=x onerror=window.pwned=1>", starts: "2026-10-16T09:00:00Z", owner: "<b>bold</b>" } }],
      calendar: { start: "starts", title: "title", subtitle: "owner", date: "2026-10-16", views: ["month", "week", "agenda"] } };
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/xss.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/xss.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    for (const name of ["month", "week", "agenda"]) {
      await api(page, "(api, element, name) => api.setCalendarView(name)", name);
      await expect(page.locator(".cx-cal-ev").first()).toContainText("<img src=x");
      expect(await page.locator(".cx-cal img, .cx-cal b").count()).toBe(0);
    }
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  });

  test.describe("time zones", () => {
    test.use({ timezoneId: "America/New_York" });
    test("local time shows events in the reader's zone and keeps all-day dates", async ({ page }) => {
      await openCalendar(page, "calendar.html");
      await api(page, "api => api.setTimeZone('local')");
      await api(page, "api => api.setCalendarView('day')");
      const failover = page.locator('.cx-cal-ev-block[aria-label^="Database failover test"]');
      await expect(failover).toHaveAttribute("aria-label", /5:00 AM – 7:00 AM/);
      // All-day events keep their dates in every zone.
      await api(page, "api => api.setCalendarView('month')");
      await expect(page.locator('.cx-cal-day[data-cx-day="' + day("2026-10-19") + '"] .cx-cal-ev', { hasText: "Password expires: j.smith" })).toHaveCount(1);
      expect(await api(page, "api => api.getCalendar().timeZone")).toBe("local");
    });
  });

  test("a DST night in the calendar's own zone keeps wall-clock times", async ({ page }) => {
    const view = { protocol: "canopyx/2", type: "grid", id: "dst", label: "Night shifts", rowHeight: 34, pageSize: 50, selection: "single", search: false,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime" }, { id: "ends", title: "Ends", kind: "datetime" }, { id: "rule", title: "Rule", kind: "text" }],
      source: { kind: "inline" }, rows: [{ id: "n", cells: { title: "Night check", starts: "2026-10-23T07:00:00Z", ends: "2026-10-23T08:00:00Z", rule: "FREQ=DAILY;COUNT=5" } }],
      calendar: { start: "starts", end: "ends", title: "title", recurrence: "rule", timeZone: "Europe/Warsaw", date: "2026-10-23", view: "week", views: ["week"], firstDay: 1 } };
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/dst.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/dst.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    // 09:00 in Warsaw every day: 07:00 UTC before the change on Sunday the 25th, 08:00 UTC after it.
    expect(await api(page, "api => api.getCalendarEvents().map(event => event.start)")).toEqual(["2026-10-23T07:00:00Z", "2026-10-24T07:00:00Z", "2026-10-25T08:00:00Z"]);
    const tops = await page.locator(".cx-cal-slots .cx-cal-ev-block").evaluateAll(elements => elements.map(element => element.style.getPropertyValue("--t")));
    expect(new Set(tops).size).toBe(1);
  });
});

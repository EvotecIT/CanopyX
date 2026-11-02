// Shared screens (docs/calendar.md#shared-screens): faces in front of events and in the legend, copies of one event across
// sources merged into one, finished events fading as time passes, day header notes and the dayHeader hook, day counts that
// follow the calendar's own width while keeping today, the stacked week list, the Reset button and the folding legend.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { examples, runtimeAssets } from "./support.mjs";
import { NOW, capture, openCalendar } from "./calendar-support.mjs";

const SCREEN = ["merge", "fadePast", "dayNotes", "faces", "listDays", "dayWidth", "listBelow", "reset"];
/** A page that mounts CanopyX.createCalendar with the options (shared-screen keys go under calendar); hooks is script text added to them. */
function screenPage(input, { width = 1000, height = 700, hooks = "" } = {}) {
  const options = { ...input, calendar: { ...input.calendar } };
  for (const name of SCREEN) if (name in options) { options.calendar[name] = options[name]; delete options[name]; }
  const { script, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Calendar</title><style>" +
    style + " body{margin:0;padding:16px} #cal{width:" + width + "px;height:" + height + "px}</style><script>" + script + "</script></head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div><script>" +
    "window.errors = []; const options = " + JSON.stringify(options).replace(/</g, "\\u003c") + "; " + hooks +
    " window.api = CanopyX.createCalendar(document.getElementById('cal'), options); document.getElementById('cal').addEventListener('canopyx:error', event => window.errors.push(event.detail.error.message));</script></body></html>";
}
async function open(page, name, html, { clock = "fixed", ready = true } = {}) {
  if (clock === "fixed") await page.clock.setFixedTime(NOW); else await page.clock.install({ time: NOW });
  await page.route("http://canopyx.test/" + name, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/" + name);
  if (ready) await page.waitForSelector("[data-cx-calendar-ready]", { timeout: 30000 });
}
const call = (page, body) => page.evaluate(body => new Function("api", "return (" + body + ")(api);")(window.api), body);
const settle = page => page.waitForFunction(() => document.querySelector("#cal").getAttribute("data-cx-calendar-ready") === "true");

const PEOPLE = [
  { id: "anna", label: "Anna", color: "#2563eb", initials: "AN", avatar: "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 4'><rect width='4' height='4' fill='#2563eb'/></svg>").toString("base64") },
  { id: "tom", label: "Tom", color: "#059669", initials: "TO" },
  { id: "home", label: "Home", icon: "🏠" }
];
const timed = (id, title, source, start, end, extra = {}) => ({ id, title, source, start: "2026-10-16T" + start + ":00Z", end: "2026-10-16T" + end + ":00Z", ...extra });

test.describe("calendar shared screens", () => {
  test("faces lead events and legend switches, and copies of one event across sources merge into one", async ({ page }) => {
    const events = [
      timed("a1", "Swimming", "anna", "16:00", "17:00", { location: "City pool" }), timed("t1", "Swimming", "tom", "16:00", "17:00", { location: "city pool " }),
      timed("t2", "swimming ", "tom", "18:00", "19:00", { location: "City pool" }), timed("a2", "Swimming", "anna", "18:00", "19:00", { location: "Lake" }),
      timed("a3", "Run", "anna", "07:00", "08:00"), timed("a4", "Run", "anna", "07:00", "08:00"), timed("h1", "Groceries", "home", "12:00", "13:00")
    ];
    await open(page, "merge.html", screenPage({ events, sources: PEOPLE, date: "2026-10-16", view: "day", firstDay: 1, details: "popover", links: true, merge: { tone: "info" } }));
    const merged = page.locator(".cx-cal-ev.cx-cal-merged");
    await expect(merged).toHaveCount(1);
    await expect(merged).toHaveAttribute("aria-label", "Swimming, 4:00 PM – 5:00 PM, Shared by Anna, Tom");
    await expect(merged.locator(".cx-cal-faces > .cx-cal-face")).toHaveCount(2);
    await expect(merged.locator(".cx-cal-face").first().locator("img")).toHaveCount(1);
    await expect(merged.locator(".cx-cal-face").nth(1)).toHaveText("TO");
    // A different location stays apart; two copies in one source stay two events of that source.
    await expect(page.locator(".cx-cal-ev", { hasText: "Run" })).toHaveCount(2);
    await expect(page.locator(".cx-cal-ev:not(.cx-cal-merged)", { hasText: /swimming/i })).toHaveCount(2);
    await expect(page.locator('.cx-cal-ev[data-cx-record="h1"] .cx-cal-face')).toHaveText("🏠");
    await expect(page.locator('[data-cx-source="anna"] .cx-cal-face img')).toHaveCount(1);
    const listed = await call(page, "api => api.getCalendarEvents().filter(event => event.owners)");
    expect(listed).toEqual([expect.objectContaining({ record: "a1", owners: ["anna", "tom"] })]);
    // Selecting the day reports the records of every copy; export writes the shared event once.
    await page.evaluate(() => document.querySelector("#cal").addEventListener("canopyx:linkchange", event => { window.linkKeys = event.detail.keys; }));
    await call(page, "api => api.setCalendarView('month')");
    await page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 16) / 86400000 + '"]').focus();
    await page.keyboard.press(" ");
    await expect.poll(() => page.evaluate(() => window.linkKeys?.slice().sort())).toEqual(["a1", "a2", "a3", "a4", "h1", "t1", "t2"]);
    const text = await call(page, "api => api.exportCalendar().then(result => result.text)");
    expect(text.match(/SUMMARY:Swimming\r\n/g)).toHaveLength(2);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    await call(page, "api => api.setCalendarView('day')");
    await page.locator(".cx-cal-ev.cx-cal-merged").click();
    const details = page.getByRole("dialog", { name: "Swimming" });
    await expect(details.locator(".cx-cal-det-owner > span:last-child")).toHaveText(["Anna", "Tom"]);
    await expect(details).toContainText("City pool");
    await capture(page, "calendar-screen-merged");
    await page.keyboard.press("Escape");
    // A hidden owner leaves the event to the others.
    await page.locator('[data-cx-source="tom"]').click();
    await expect(page.locator(".cx-cal-ev.cx-cal-merged")).toHaveCount(0);
    await expect(page.locator('.cx-cal-ev[data-cx-record="a1"]')).toHaveAttribute("aria-label", "Swimming, 4:00 PM – 5:00 PM");
    // The test page leaves out the linked views part; nothing else may fail.
    expect((await page.evaluate(() => window.errors)).filter(message => !message.includes("linked views"))).toEqual([]);
  });

  test("each copy in a source joins its own merged event, and a resource's face shows in the details", async ({ page }) => {
    const swim = (id, source) => timed(id, "Swim", source, "16:00", "17:00", { resource: "r1" });
    const events = [swim("a1", "anna"), swim("a2", "anna"), swim("t1", "tom"), swim("t2", "tom"), { id: "r", title: "Fix sink", resource: "r1", start: "2026-10-16T12:00:00Z", end: "2026-10-16T13:00:00Z" }];
    // Initials count as people see them: an emoji with a skin tone and a hair style is one, as in the C# API.
    await open(page, "pairs.html", screenPage({ events, sources: PEOPLE, resources: [{ id: "r1", label: "Plumber" }], faces: [{ resource: "r1", initials: "👩🏽‍🦰" }],
      date: "2026-10-16", view: "day", details: "popover", merge: true }));
    await expect(page.locator(".cx-cal-ev.cx-cal-merged")).toHaveCount(2);
    await page.locator('.cx-cal-ev[data-cx-record="r"]').click();
    const owner = page.getByRole("dialog", { name: "Fix sink" }).locator(".cx-cal-det-owner");
    await expect(owner.locator(".cx-cal-face")).toHaveText("👩🏽‍🦰");
    await expect(owner.locator("span:last-child")).toHaveText("Plumber");
  });

  test("finished events fade in the time and list views, and keep fading as time passes", async ({ page }) => {
    const events = [timed("done", "Stand-up", "anna", "09:00", "10:00"), timed("now", "Review", "anna", "10:00", "11:00"), timed("later", "Lunch", "anna", "12:00", "13:00")];
    await open(page, "fade.html", screenPage({ events, sources: PEOPLE, date: "2026-10-16", view: "week", views: ["week", "agenda", "month"], firstDay: 1, fadePast: 0.6 }), { clock: "install" });
    const past = () => page.locator(".cx-cal-ev.cx-cal-past").evaluateAll(items => items.map(item => item.dataset.cxRecord));
    expect(await past()).toEqual(["done"]);
    // The strength reaches the decoration only; the text keeps full opacity so it stays readable.
    expect(await page.locator('.cx-cal-ev[data-cx-record="done"]').evaluate(item => [getComputedStyle(item).getPropertyValue("--cx-cal-fade").trim(), getComputedStyle(item).opacity])).toEqual(["0.4", "1"]);
    await page.clock.fastForward("01:00:00");
    await expect.poll(past).toEqual(["done", "now"]);
    await call(page, "api => api.setCalendarView('agenda')");
    await expect.poll(past).toEqual(["done", "now"]);
    await call(page, "api => api.setCalendarView('month')");
    expect(await past()).toEqual([]);
  });

  test("in narrow time-grid events the title wins over faces and the time, and a time shows whole or not at all", async ({ page }) => {
    const events = [timed("s1", "School run", "anna", "07:45", "08:15"), timed("s2", "School run", "tom", "07:45", "08:15"),
      timed("o1", "Office", "home", "07:30", "12:00"), timed("w1", "Workshop", "anna", "08:00", "11:00"), timed("w1b", "Workshop", "tom", "08:00", "11:00"), timed("w2", "Dentist", "tom", "08:30", "10:00")];
    // Each block: is the title shown untruncated whenever the time is shown, and is the time either whole inside the block or out of view?
    const blocks = () => page.locator(".cx-cal-slots .cx-cal-ev-block").evaluateAll(items => items.map(item => {
      const box = item.getBoundingClientRect(), title = item.querySelector(".cx-cal-ev-title"), time = item.querySelector(".cx-cal-ev-time");
      const titleBox = title.getBoundingClientRect(), timeBox = time?.getBoundingClientRect();
      const timeShown = !!timeBox && timeBox.width > 0 && timeBox.top < box.bottom - 1;
      return { record: item.dataset.cxRecord, titleShown: titleBox.width > 0 && titleBox.top < box.bottom, titleFirst: !timeShown || titleBox.top <= timeBox.top + 1,
        titleWhole: !timeShown || title.scrollWidth <= title.clientWidth, timeWhole: !timeShown || (timeBox.right <= box.right + 0.5 && time.scrollWidth <= time.clientWidth) };
    }));
    for (const width of [1000, 560]) {
      await open(page, "narrow-" + width + ".html", screenPage({ events, sources: PEOPLE, date: "2026-10-16", view: "week", views: ["week"], firstDay: 1, merge: true }, { width }));
      const found = await blocks();
      expect(found.map(block => block.record).sort()).toEqual(["o1", "s1", "w1", "w2"]);
      for (const block of found) expect(block, width + "px " + block.record).toMatchObject({ titleShown: true, titleFirst: true, titleWhole: true, timeWhole: true });
    }
    // At 560px a short shared event gives its line to the title, and a taller one shows its first face and a count.
    expect(await page.locator('.cx-cal-ev[data-cx-record="s1"] .cx-cal-faces').evaluate(group => getComputedStyle(group).display)).toBe("none");
    const faces = page.locator('.cx-cal-ev[data-cx-record="w1"] .cx-cal-faces');
    expect(await faces.evaluate(group => [group.dataset.cxMore, [...group.children].filter(face => face.getBoundingClientRect().width > 0).length, getComputedStyle(group, "::after").content])).toEqual(["+1", 1, "\"+1\""]);
  });

  test("day headers carry notes and host content as text, in their accessible names", async ({ page }) => {
    const hooks = "options.calendar = { ...options.calendar, dayHeader({ day, events, element }) { if (day === '2026-10-14') return events + ' planned'; " +
      "if (day === '2026-10-15') { const b = document.createElement('b'); b.textContent = '☀ 18°'; element.append(b); return true; } " +
      "if (day === '2026-10-13') throw new Error('weather offline'); } };";
    const options = { events: [timed("a", "Planning", "anna", "09:00", "10:00", { start: "2026-10-14T09:00:00Z", end: "2026-10-14T10:00:00Z" })], sources: PEOPLE,
      date: "2026-10-16", view: "week", views: ["week", "weekList", "agenda", "month"], firstDay: 1, dayNotes: [{ date: "2026-10-16", text: "♻ Bin day", tone: "success" }] };
    await open(page, "notes.html", screenPage(options, { hooks }));
    const head = day => page.locator('.cx-cal-dayhead[data-cx-day="' + Date.UTC(2026, 9, day) / 86400000 + '"]');
    await expect(head(16).locator(".cx-cal-note")).toHaveText("♻ Bin day");
    await expect(head(16)).toHaveAttribute("aria-label", "Friday, October 16, 2026, ♻ Bin day");
    await expect(head(14)).toHaveAttribute("aria-label", "Wednesday, October 14, 2026, 1 planned");
    await expect(head(15).locator(".cx-cal-note-host > b")).toHaveText("☀ 18°");
    await expect(head(13).locator(".cx-cal-notes")).toHaveCount(0);
    expect(await page.evaluate(() => window.errors)).toContain("weather offline");
    for (const view of ["weekList", "month"]) {
      await call(page, "api => api.setCalendarView('" + view + "')");
      await expect(page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 16) / 86400000 + '"]')).toHaveAttribute("aria-label", /, ♻ Bin day$/);
    }
    await call(page, "api => api.setCalendarView('agenda')");
    await expect(page.locator(".cx-cal-ahead-c", { hasText: "Oct 14" }).locator(".cx-cal-note")).toHaveText("1 planned");
    // A phone month's small cells name their notes, and the chosen day's list under the month shows them.
    await page.locator("#cal").evaluate(host => host.style.width = "400px");
    await call(page, "api => api.setCalendarView('month')");
    const cell = page.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 16) / 86400000 + '"]');
    await expect(cell).toHaveAttribute("aria-label", /, ♻ Bin day$/);
    await expect(cell.locator(".cx-cal-notes")).toHaveCount(0);
    await cell.click();
    await expect(page.locator(".cx-cal-daylist-h .cx-cal-note")).toHaveText("♻ Bin day");
  });

  test("dayWidth drops one day at a time as the calendar narrows, keeping today, and steps by the days shown", async ({ page }) => {
    await open(page, "fit.html", screenPage({ events: [], date: "2026-10-16", view: "week", views: ["week", "days", "weekList"], firstDay: 1, dayWidth: 120 }));
    const range = () => call(page, "api => [api.getCalendar().from, api.getCalendar().to]");
    const resize = async width => { await page.locator("#cal").evaluate((host, width) => host.style.width = width + "px", width); await page.waitForTimeout(150); await settle(page); };
    expect(await range()).toEqual(["2026-10-12", "2026-10-18"]);
    await resize(64 + 6 * 120 + 30);
    await expect.poll(range).toEqual(["2026-10-13", "2026-10-18"]);
    await resize(64 + 3 * 120 + 30);
    await expect.poll(range).toEqual(["2026-10-16", "2026-10-18"]);
    await expect(page.locator(".cx-cal-dayhead")).toHaveCount(3);
    await expect(page.locator('.cx-cal-dayhead[aria-current="date"]')).toHaveCount(1);
    await call(page, "api => api.calendarStep(1)");
    expect(await range()).toEqual(["2026-10-19", "2026-10-21"]);
    await call(page, "api => api.calendarStep(-1)");
    expect(await range()).toEqual(["2026-10-16", "2026-10-18"]);
    await call(page, "api => api.calendarStep(1).then(() => api.calendarToday())");
    expect(await range()).toEqual(["2026-10-16", "2026-10-18"]);
    await resize(1000);
    await expect.poll(range).toEqual(["2026-10-12", "2026-10-18"]);
    // The N-day view fits the same way; the week list stacks its days when fewer columns than listBelow fit.
    await call(page, "api => api.setCalendarView('days')");
    expect(await range()).toEqual(["2026-10-16", "2026-10-18"]);
  });

  test("the week list shows listDays days as columns and stacks them below listBelow columns", async ({ page }) => {
    const events = [timed("a", "Planning", "anna", "09:00", "10:00")];
    await open(page, "list.html", screenPage({ events, sources: PEOPLE, date: "2026-10-16", view: "weekList", views: ["weekList"], firstDay: 1, listDays: 3, listBelow: 3, dayWidth: 150 }, { width: 600 }));
    expect(await call(page, "api => [api.getCalendar().from, api.getCalendar().to]")).toEqual(["2026-10-16", "2026-10-18"]);
    await expect(page.locator(".cx-cal-list")).toHaveClass(/cx-cal-boxes/);
    await expect(page.locator(".cx-cal-list")).not.toHaveClass(/cx-cal-stack/);
    await expect(page.locator(".cx-cal-lday")).toHaveCount(3);
    await page.locator("#cal").evaluate(host => host.style.width = "320px");
    await expect(page.locator(".cx-cal-list")).toHaveClass(/cx-cal-stack/);
    await expect(page.locator(".cx-cal-lday")).toHaveCount(3);
    const boxes = await page.locator(".cx-cal-lday").evaluateAll(days => days.map(day => Math.round(day.getBoundingClientRect().left)));
    expect(new Set(boxes).size).toBe(1);
    await capture(page, "calendar-screen-stacked");
  });

  test("Reset appears once the calendar leaves its defaults and restores them in one press", async ({ page }) => {
    await open(page, "reset.html", screenPage({ events: [timed("a", "Planning", "anna", "09:00", "10:00")], sources: PEOPLE, date: "2026-10-16", view: "week", firstDay: 1, reset: true }));
    const reset = page.getByRole("button", { name: "Reset" });
    await expect(reset).toBeHidden();
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(reset).toBeHidden();
    await expect(page.getByRole("button", { name: "Today" })).toBeFocused();
    expect(await call(page, "api => api.getCalendar().from")).toBe("2026-10-12");
    await page.getByRole("button", { name: "Month" }).click();
    await page.locator('[data-cx-source="tom"]').click();
    await expect(reset).toBeVisible();
    await call(page, "api => api.resetCalendar()");
    await expect(reset).toBeHidden();
    expect(await call(page, "api => api.getCalendar().view")).toBe("week");
    await expect(page.locator('[data-cx-source="tom"]')).toHaveAttribute("aria-pressed", "true");
    // November's grid also draws October 31, the home day; it is still another month.
    await open(page, "reset-month.html", screenPage({ events: [], sources: PEOPLE, date: "2026-10-31", view: "month", firstDay: 1, reset: true }));
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(reset).toBeVisible();
  });

  test("legend switches that do not fit fold into a menu of checkboxes", async ({ page }) => {
    const sources = ["Grandparents", "Neighbours", "Football club", "Music school", "Book club", "Work"].map((label, index) => ({ id: "s" + index, label, color: "#2563eb" }));
    const events = sources.map((source, index) => timed("e" + index, "Event " + index, source.id, "09:00", "10:00"));
    await open(page, "fold.html", screenPage({ events, sources, date: "2026-10-16", view: "day" }, { width: 900 }));
    const fold = page.locator(".cx-cal-src-fold");
    await expect(fold).toBeHidden();
    await page.locator("#cal").evaluate(host => host.style.width = "360px");
    await expect(fold).toBeVisible();
    await expect(fold).toHaveText("Calendars · 6 of 6");
    await expect(page.locator(".cx-cal-srcs")).toBeHidden();
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    const music = page.getByRole("checkbox", { name: "Music school" });
    await expect(page.getByRole("checkbox", { name: "Grandparents" })).toBeFocused();
    await expect(page.getByRole("checkbox")).toHaveCount(6);
    expect(await new AxeBuilder({ page }).include(".cx-cal-legend").analyze().then(result => result.violations.map(item => item.id))).toEqual([]);
    await capture(page, "calendar-screen-folded-legend");
    await music.uncheck();
    await expect(page.locator('.cx-cal-ev[data-cx-record="e3"]')).toHaveCount(0);
    await expect(fold).toHaveText("Calendars · 5 of 6");
    await expect(page.locator('[data-cx-source="s3"]')).toHaveAttribute("aria-pressed", "false");
    // WebKit on macOS leaves a clicked checkbox unfocused; Escape belongs to the menu, so focus a checkbox first.
    await music.focus();
    await page.keyboard.press("Escape");
    await expect(fold).toBeFocused();
    await expect(page.locator(".cx-cal-src-menu")).toBeHidden();
    await page.locator("#cal").evaluate(host => host.style.width = "1200px");
    await expect(fold).toBeHidden();
    await expect(page.locator(".cx-cal-srcs")).toBeVisible();
    // Near the bottom of a screen that does not scroll, the menu opens where it fits.
    await page.evaluate(() => { document.body.style.overflow = "hidden"; Object.assign(document.querySelector("#cal").style, { width: "360px", marginTop: innerHeight - 200 + "px" }); });
    await fold.click();
    const box = await page.locator(".cx-cal-src-menu").boundingBox(), screen = page.viewportSize().height;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(screen);
  });

  test("the shared-screen settings are checked when the calendar starts", async ({ page }) => {
    await open(page, "bad.html", screenPage({ events: [], sources: [{ id: "a", label: "A", avatar: "javascript:alert(1)" }] }), { ready: false });
    await expect.poll(() => page.evaluate(() => window.errors.join(" "))).toContain("calendar source a has an avatar");
  });

  for (const [width, dark] of [[1440, false], [1440, true], [820, false], [390, false]]) {
    test(`the family example at ${width} ${dark ? "dark" : "light"} shows faces, shared plans, notes and today`, async ({ page }) => {
      await openCalendar(page, "calendar-family.html", { width, dark, height: 1000 });
      const week = page.locator("#family-week");
      await expect(week.locator(".cx-cal-legend .cx-cal-face").first()).toBeAttached();
      await expect(week.locator('[aria-current="date"]').first()).toBeAttached();
      await expect(week.locator(".cx-cal-ev.cx-cal-merged").first()).toBeVisible();
      await expect(week.locator(".cx-cal-reset")).toBeHidden();
      const bounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
      await capture(page, `calendar-family-${width}-${dark ? "dark" : "light"}`);
    });
  }

  test("a page without shared-screen settings does not carry the part", () => {
    expect(fs.readFileSync(path.join(examples, "calendar-basic.html"), "utf8")).not.toContain("function calScreenSettings(");
    expect(fs.readFileSync(path.join(examples, "calendar-family.html"), "utf8")).toContain("function calScreenSettings(");
  });
});

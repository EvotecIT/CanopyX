// Per-event colours, addresses and the event-click hook (docs/calendar.md#events): an event's own colour, background and text
// colour, safely parsed; an address that activating the event opens; and canopyx:eventClick / onEventClick, which come first
// and may cancel, so a page written from C# can act on a click with a listener or CanopyX.configure.
import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";
import { openBuilt } from "./calendar-support.mjs";

function calendarPage(options, script = "", hooks = "{}") {
  const { script: runtime, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Calendar</title><style>" + style + " body{margin:0;padding:16px} #cal{height:680px}</style><script>" +
    runtime + "</script></head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div><script>" + script +
    "window.api = CanopyX.createCalendar(document.getElementById('cal'), Object.assign(" + JSON.stringify(options).replace(/</g, "\\u003c") + ", " + hooks + "));</script></body></html>";
}
const EVENTS = [
  { id: "own", title: "Own colours", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", color: "#0f766e", backgroundColor: "rgb(204, 251, 241)", textColor: "#134e4a" },
  { id: "fill", title: "Background only", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", backgroundColor: "#fde68a" },
  { id: "bad", title: "Unsafe colour", start: "2026-10-16T13:00:00Z", end: "2026-10-16T14:00:00Z", tone: "danger", color: "red;background:url(https://evil.test/x)" },
  { id: "link", title: "Ticket", start: "2026-10-17T09:00:00Z", end: "2026-10-17T10:00:00Z", url: "/tickets/42" },
  { id: "unsafe", title: "Script link", start: "2026-10-17T11:00:00Z", end: "2026-10-17T12:00:00Z", url: "javascript:window.__xss=1" }
];
const event = (page, id) => page.locator('.cx-cal-ev[data-cx-record="' + id + '"]').first();
const look = (page, id) => event(page, id).evaluate(element => ({ accent: element.style.getPropertyValue("--cx-ev"), background: getComputedStyle(element).backgroundColor,
  text: getComputedStyle(element).color, fill: element.style.getPropertyValue("--cx-ev-fill") }));

test("events take their own colour, background and text colour, and ignore values that are not colours", async ({ page }) => {
  await openBuilt(page, "looks.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "week" }));
  expect(await look(page, "own")).toMatchObject({ accent: "#0f766e", background: "rgb(204, 251, 241)", text: "rgb(19, 78, 74)", fill: "rgb(204, 251, 241)" });
  // A background alone also colours the bar.
  expect(await look(page, "fill")).toMatchObject({ accent: "#fde68a", background: "rgb(253, 230, 138)" });
  // A value that is not a colour is ignored: the tone colours the event and nothing else reaches the style.
  const bad = await look(page, "bad");
  expect(bad.accent).toContain("status-bad");
  expect(await event(page, "bad").getAttribute("style")).not.toContain("evil");
  // The public event carries the colours and the address.
  const events = await page.evaluate(() => window.api.getCalendarEvents());
  expect(events.find(item => item.id === "own")).toMatchObject({ color: "#0f766e", backgroundColor: "rgb(204, 251, 241)", textColor: "#134e4a", url: null });
  expect(events.find(item => item.id === "link").url).toBe("http://canopyx.test/tickets/42");
  expect(events.find(item => item.id === "unsafe").url).toBeNull();
  // A month line has no fill of its own: it keeps the theme's text and shows the colour on its dot.
  await page.evaluate(() => window.api.setCalendarView("month"));
  const line = await event(page, "own").evaluate(element => ({ text: getComputedStyle(element).color, dot: getComputedStyle(element, "::before").backgroundColor }));
  expect(line.text).not.toBe("rgb(19, 78, 74)");
  expect(line.dot).toBe("rgb(15, 118, 110)");
});

test("the strong style fills an event with its background colour and writes its text colour", async ({ page }) => {
  await openBuilt(page, "strong.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "week", calendar: { eventStyle: "strong" } }));
  expect(await look(page, "own")).toMatchObject({ background: "rgb(204, 251, 241)", text: "rgb(19, 78, 74)" });
});

test("activating an event with an address opens it, after canopyx:eventClick and onEventClick, which can cancel", async ({ page }) => {
  await page.route("http://canopyx.test/tickets/42", route => route.fulfill({ contentType: "text/html", body: "<title>Ticket 42</title>ticket" }));
  // A listener on the calendar's host element, and the onEventClick option.
  const script = "window.clicks = []; document.getElementById('cal').addEventListener('canopyx:eventClick', e => { window.clicks.push(['event', e.detail.event.id, e.detail.url, e.detail.keyboard]); if (window.cancel) e.preventDefault(); });";
  const hooks = "{ onEventClick: detail => { window.clicks.push(['hook', detail.event.id]); return window.hookResult; } }";
  await openBuilt(page, "click.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "week" }, script, hooks));
  // A cancelled click opens nothing: no address, no details.
  await page.evaluate(() => { window.cancel = true; });
  await event(page, "link").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).toBe("http://canopyx.test/click.html");
  // The hook can cancel too.
  await page.evaluate(() => { window.cancel = false; window.hookResult = false; });
  await event(page, "own").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.clicks)).toEqual([["event", "link", "http://canopyx.test/tickets/42", false], ["hook", "link"], ["event", "own", null, false], ["hook", "own"]]);
  // An event without an address opens its details; an unsafe address is no address.
  await page.evaluate(() => { window.hookResult = undefined; });
  await event(page, "unsafe").click();
  await expect(page.getByRole("dialog", { name: "Script link" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  // Enter on an event with an address opens it in the page.
  await event(page, "link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("http://canopyx.test/tickets/42");
});

test("urlTarget blank opens the address in a new window without an opener", async ({ page, context }) => {
  await context.route("http://canopyx.test/tickets/42", route => route.fulfill({ contentType: "text/html", body: "<title>Ticket 42</title><script>document.title += ' ' + (window.opener === null)</script>" }));
  await openBuilt(page, "blank.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "week", urlTarget: "blank" }));
  const popup = page.waitForEvent("popup");
  await event(page, "link").click();
  const opened = await popup;
  await opened.waitForLoadState();
  expect(opened.url()).toBe("http://canopyx.test/tickets/42");
  expect(await opened.title()).toBe("Ticket 42 true");
  expect(page.url()).toBe("http://canopyx.test/blank.html");
});

test("a calendar written from C# takes its colours and addresses, and CanopyX.configure gives it an onEventClick hook", async ({ page, context }) => {
  const fs = await import("node:fs"), path = await import("node:path"), { examples } = await import("./support.mjs");
  // A HeadHtml script runs after the runtime and before the page mounts its views, as CanopyHtmlOptions.HeadHtml writes it.
  const html = fs.readFileSync(path.join(examples, "calendar-event-looks.html"), "utf8").replace("</head>",
    "<script>window.clicks = []; CanopyX.configure('event-looks', { onEventClick: detail => { window.clicks.push(detail.event.id); return detail.event.id !== 'ticket'; } });</script></head>");
  await context.route("https://releases.example.test/2026-q4", route => route.fulfill({ contentType: "text/html", body: "<title>Release</title>" }));
  await openBuilt(page, "event-looks.html", html);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setCalendarView("week"));
  expect(await look(page, "network")).toMatchObject({ accent: "#0f766e", background: "rgb(204, 251, 241)", text: "rgb(19, 78, 74)" });
  // The hook keeps the ticket from opening; the release opens in a new window.
  await event(page, "ticket").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setCalendarView("month"));
  const popup = page.waitForEvent("popup");
  await event(page, "release").click();
  expect((await popup).url()).toBe("https://releases.example.test/2026-q4");
  expect(await page.evaluate(() => window.clicks)).toEqual(["ticket", "release"]);
});

test("an event's own background outranks its source's colour, and relative addresses work in a report opened from disk", async ({ page }) => {
  const fs = await import("node:fs"), path = await import("node:path"), { pathToFileURL } = await import("node:url");
  const folder = test.info().outputPath("disk"); fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "calendar.html");
  fs.writeFileSync(file, calendarPage({ events: [
    { id: "sourced", title: "Sourced", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", source: "team", backgroundColor: "#bbf7d0", url: "notes/sourced.html" },
    { id: "plain", title: "Plain", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", source: "team" }],
    sources: [{ id: "team", label: "Team", color: "#dc2626" }], date: "2026-10-16", view: "week" }));
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector("[data-cx-calendar-ready]");
  expect(await look(page, "sourced")).toMatchObject({ accent: "#bbf7d0", background: "rgb(187, 247, 208)" });
  expect((await look(page, "plain")).accent).toBe("#dc2626");
  const events = await page.evaluate(() => window.api.getCalendarEvents());
  expect(events.find(item => item.id === "sourced").url).toBe(pathToFileURL(path.join(folder, "notes", "sourced.html")).href);
});

test("forced colours keep the system text colour on events with their own text colour", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openBuilt(page, "forced.html", calendarPage({ events: EVENTS, date: "2026-10-16", view: "week" }));
  const text = await event(page, "own").evaluate(element => getComputedStyle(element).color);
  expect(text).not.toBe("rgb(19, 78, 74)");
});

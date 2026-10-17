// Scheduling on a calendar (docs/calendar.md#creating-events and the sections after it): creating events by click, drag and
// keyboard, dropping grid rows and marked page elements, changing one occurrence, this and following, or all of a series,
// context menus and hover cards, sources with a legend, iCalendar sources (untrusted text within limits) and inverse ranges.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { repo, runtimeAssets } from "./support.mjs";

/** The editing part (script and stylesheet) inline, as a page written for an editable grid carries it. */
const editingAssets = () => "<style>" + fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-editing.css"), "utf8") + "</style><script>" + fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-editing.js"), "utf8") + "</script>";
import { capture, loadKit, openBuilt, openCalendar, api } from "./calendar-support.mjs";
import { parseAdversarialCalendar } from "./calendar-parser-fixture.mjs";

/**
 * A page with a calendar from createCalendar (options as a JavaScript expression, so hooks can be functions) that records
 * every gridCommit in window.commits and answers each insert with a stored id; extra is more markup after the calendar.
 */
function page(optionsCode, { extra = "", dir = "ltr", height = 680 } = {}) {
  const { script, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"en\" dir=\"" + dir + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Scheduling</title><style>" +
    style + " body{margin:0;padding:16px} #cal{height:" + height + "px} #grid{height:240px;margin-top:16px}</style><script>" + script + "</script>" + editingAssets() + "</head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div>" +
    extra + "<script>window.commits = []; let stored = 100;\n" +
    "const writer = { commit(batch) { window.commits.push(JSON.parse(JSON.stringify(batch))); return { protocol: 'canopyx/2', type: 'gridCommitResult', view: batch.view, rows: batch.rows.map(row => row.op === 'insert' ? { id: row.id, status: 'saved', newId: 'stored-' + (++stored) } : { id: row.id, status: 'saved' }) }; } };\n" +
    "window.api = CanopyX.createCalendar(document.getElementById('cal'), Object.assign({ editing: writer }, " + optionsCode + "));</script></body></html>";
}
const EVENTS = "[{ id: 'a', title: 'Planning', start: '2026-10-16T09:00:00Z', end: '2026-10-16T10:00:00Z' }, { id: 'w', title: 'Weekly sync', start: '2026-10-05T14:00:00Z', end: '2026-10-05T15:00:00Z', recurrence: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6' }]";
const events = p => p.evaluate(() => window.api.getCalendarEvents());
const slot = (p, day, minutes) => p.locator('.cx-cal-slot[data-cx-day="' + Date.UTC(2026, 9, day) / 86400000 + '"][data-cx-minutes="' + minutes + '"]');

test.describe("creating events", () => {
  test("a click on an empty slot opens the form; Add inserts and commits the new event", async ({ page: p }) => {
    await openBuilt(p, "create.html", page("{ preset: 'scheduler', events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }"));
    await slot(p, 14, 660).click();
    const form = p.getByRole("dialog", { name: "New event" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Title")).toBeFocused();
    await p.keyboard.type("Pairing");
    await capture(p, "calendar-create-event");
    await form.getByRole("button", { name: "Add" }).click();
    await expect.poll(() => p.evaluate(() => window.commits.length)).toBe(1);
    const commit = await p.evaluate(() => window.commits[0]);
    expect(commit.rows).toHaveLength(1);
    expect(commit.rows[0]).toMatchObject({ op: "insert", values: { title: "Pairing", start: "2026-10-14T11:00:00Z", end: "2026-10-14T12:00:00Z" } });
    expect(commit.rows[0].id).toMatch(/^new-\d+$/);
    expect(commit.rows[0].original).toBeUndefined();
    await expect.poll(async () => (await events(p)).find(event => event.title === "Pairing")?.record).toBe("stored-101");
    await expect(p.locator(".cx-cal .cx-live")).toHaveText(/Pairing added on/);
  });

  test("dragging over slots creates the range; Escape cancels the form; N creates from the keyboard", async ({ page: p }) => {
    await openBuilt(p, "range.html", page("{ preset: 'scheduler', events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }"));
    const from = await slot(p, 13, 600).boundingBox(), to = await slot(p, 13, 690).boundingBox();
    await p.mouse.move(from.x + 10, from.y + 5); await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(from.x + 10, from.y + 5 + (to.y - from.y) * i / 6); await p.waitForTimeout(20); }
    await p.waitForTimeout(80);
    await p.mouse.up();
    const form = p.getByRole("dialog", { name: "New event" });
    await expect(form).toContainText("10:00 AM – 12:00 PM");
    await p.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    expect(await p.evaluate(() => window.commits.length)).toBe(0);
    await slot(p, 15, 540).focus();
    await p.keyboard.press("n");
    await expect(form).toBeVisible();
    await p.keyboard.type("Keyboard event");
    await p.keyboard.press("Enter");
    await expect.poll(() => p.evaluate(() => window.commits.length)).toBe(1);
    expect(await p.evaluate(() => window.commits[0].rows[0].values.start)).toBe("2026-10-15T09:00:00Z");
  });

  test("a host takes creation over by cancelling canopyx:eventCreate; the valid range refuses outside days", async ({ page: p }) => {
    await openBuilt(p, "host-create.html", page("{ preset: 'scheduler', events: " + EVENTS + ", date: '2026-10-16', view: 'month', firstDay: 1, calendar: { validRange: { start: '2026-10-05' } }, onCreate: detail => { window.created = detail; return false; } }"));
    await p.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 21) / 86400000 + '"]').click({ position: { x: 60, y: 70 } });
    // Creating gives the calendar an all-day column, so a day proposes an all-day event.
    await expect.poll(() => p.evaluate(() => window.created)).toEqual({ start: "2026-10-21T00:00:00Z", end: "2026-10-22T00:00:00Z", allDay: true, resource: null });
    await expect(p.getByRole("dialog", { name: "New event" })).toHaveCount(0);
    // A day outside the valid range is disabled: Enter on it says why and creates nothing.
    const outside = p.locator('.cx-cal-day[data-cx-day="' + Date.UTC(2026, 9, 1) / 86400000 + '"]');
    await expect(outside).toHaveAttribute("aria-disabled", "true");
    await p.evaluate(() => { window.created = null; });
    await outside.focus();
    await p.keyboard.press("Enter");
    await expect(p.locator(".cx-cal-notice")).toHaveText("Outside the dates this calendar shows");
    expect(await p.evaluate(() => window.created)).toBe(null);
  });
});

test.describe("dropping from outside", () => {
  test("a grid row picked up with F2 drops on a slot with Enter and becomes a commit", async ({ page: p }) => {
    await openCalendar(p, "calendar-scheduler.html", { width: 1440, height: 1200 });
    const task = p.locator('#unscheduled, [data-canopyx-host]').last().locator(".cx-row").first();
    await task.click();
    await p.keyboard.press("F2");
    await expect(p.locator(".cx-live").filter({ hasText: "Write the release notes" }).first()).toBeAttached();
    await slot(p, 15, 600).focus();
    await p.keyboard.press("Enter");
    await expect.poll(async () => (await api(p, "api => api.getCalendarEvents()", undefined, "team-scheduler")).find(event => event.title === "Write the release notes"))
      .toMatchObject({ start: "2026-10-15T10:00:00Z", end: "2026-10-15T11:30:00Z" });
  });

  test("dragging a row over the calendar shows where it lands and dropping schedules it", async ({ page: p, browserName }) => {
    test.skip(browserName !== "chromium", "Synthetic HTML drag and drop with a shared DataTransfer is checked once; the keyboard path runs everywhere.");
    await openCalendar(p, "calendar-scheduler.html", { width: 1440, height: 1200 });
    const row = p.locator("[data-canopyx-host]").last().locator(".cx-row").nth(1);
    const target = await slot(p, 14, 720).boundingBox();
    const data = await p.evaluateHandle(() => new DataTransfer());
    await row.dispatchEvent("dragstart", { dataTransfer: data });
    await p.locator(".cx-cal-body").first().dispatchEvent("dragover", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    // The row lasts its minutes column: an hour from noon.
    await expect(p.locator(".cx-cal-ghost")).toContainText("12:00 PM – 1:00 PM");
    await capture(p, "calendar-external-drop");
    await p.locator(".cx-cal-body").first().dispatchEvent("drop", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    await expect.poll(async () => (await api(p, "api => api.getCalendarEvents()", undefined, "team-scheduler")).find(event => event.title === "Pair on the login bug"))
      .toMatchObject({ start: "2026-10-14T12:00:00Z", end: "2026-10-14T13:00:00Z" });
  });

  test("a marked page element drops with its own title and length, and canopyx:eventReceive can take it", async ({ page: p }) => {
    const extra = "<div id=\"chip\" draggable=\"true\" data-canopyx-event='{\"title\":\"Coffee chat\",\"minutes\":30}'>Coffee chat</div>";
    await openBuilt(p, "element.html", page("{ preset: 'scheduler', drop: true, events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }", { extra }));
    const target = await slot(p, 13, 900).boundingBox(), data = await p.evaluateHandle(() => new DataTransfer());
    await p.locator("#chip").dispatchEvent("dragstart", { dataTransfer: data });
    await p.locator(".cx-cal-body").dispatchEvent("dragover", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    await p.locator(".cx-cal-body").dispatchEvent("drop", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    await expect.poll(() => p.evaluate(() => window.commits[0]?.rows[0].values)).toMatchObject({ title: "Coffee chat", start: "2026-10-13T15:00:00Z", end: "2026-10-13T15:30:00Z" });
    await p.evaluate(() => document.getElementById("cal").addEventListener("canopyx:eventReceive", event => { window.received = event.detail; event.preventDefault(); }));
    await p.locator("#chip").dispatchEvent("dragstart", { dataTransfer: data });
    await p.locator(".cx-cal-body").dispatchEvent("drop", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 40 });
    await expect.poll(() => p.evaluate(() => window.received?.item.title)).toBe("Coffee chat");
    expect(await p.evaluate(() => window.commits.length)).toBe(1);
  });
});

test.describe("changing one occurrence", () => {
  // The basic event list has no series columns: a grid document gives the calendar series and recurrenceId.
  const view = (occurrence) => "{ view: { protocol: 'canopyx/2', type: 'grid', id: 'ops', label: 'Ops', rowHeight: 34, pageSize: 200, selection: 'single', columns: [" +
    "{ id: 'title', title: 'Title', kind: 'text', rowHeader: true, editable: true }, { id: 'start', title: 'Start', kind: 'datetime', editable: true }, { id: 'end', title: 'End', kind: 'datetime', editable: true }," +
    "{ id: 'rule', title: 'Rule', kind: 'text', editable: true }, { id: 'series', title: 'Series', kind: 'text', editable: true }, { id: 'rid', title: 'Replaces', kind: 'datetime', editable: true }]," +
    "source: { kind: 'inline' }, rows: [{ id: 's', cells: { title: 'Weekly sync', start: '2026-10-05T14:00:00Z', end: '2026-10-05T15:00:00Z', rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6' } }]," +
    "calendar: { start: 'start', end: 'end', title: 'title', recurrence: 'rule', series: 'series', recurrenceId: 'rid', date: '2026-10-12', view: 'week', views: ['week', 'month'], firstDay: 1, editable: true" + (occurrence ? ", occurrence: '" + occurrence + "'" : "") + " } } }";
  function gridPage(occurrence) {
    const { script, style } = runtimeAssets("grid");
    return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Series</title><style>" + style + " body{margin:0;padding:16px} #cal{height:700px}</style><script>" + script +
      "</script>" + editingAssets() + "</head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div><script>window.commits = [];\n" +
      "const writer = { commit(batch) { window.commits.push(JSON.parse(JSON.stringify(batch))); return { protocol: 'canopyx/2', type: 'gridCommitResult', view: batch.view, rows: batch.rows.map(row => ({ id: row.id, status: 'saved' })) }; } };\n" +
      "window.api = CanopyX.createDataGrid(document.getElementById('cal'), Object.assign({ editing: writer }, " + view(occurrence) + "));</script></body></html>";
  }
  async function move(p) {
    const event = p.locator('.cx-cal-ev[data-cx-record="s"]'), box = await event.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + 8); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + box.width / 2, box.y + 8 + 48 * i / 8); await p.waitForTimeout(20); }
    // The proposal follows the pointer once per frame: let the last frame land before the drop.
    await p.waitForTimeout(80);
    await p.mouse.up();
  }

  test("the dialog asks; This event writes an overriding record and the series skips the occurrence", async ({ page: p }) => {
    await openBuilt(p, "this.html", gridPage());
    await move(p);
    const dialog = p.getByRole("dialog", { name: "Change a repeating event" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "This event", exact: true })).toBeFocused();
    await capture(p, "calendar-occurrence-dialog");
    await dialog.getByRole("button", { name: "This event", exact: true }).click();
    await expect.poll(() => p.evaluate(() => window.commits.length)).toBe(1);
    const row = await p.evaluate(() => window.commits[0].rows[0]);
    expect(row).toMatchObject({ op: "insert", values: { title: "Weekly sync", start: "2026-10-12T15:00:00Z", end: "2026-10-12T16:00:00Z", series: "s", rid: "2026-10-12T14:00:00Z" } });
    const shown = await p.evaluate(() => window.api.getCalendarEvents().map(event => [event.record, event.start]));
    expect(shown).toContainEqual([row.id, "2026-10-12T15:00:00Z"]);
    expect(shown.filter(([record]) => record === "s")).toHaveLength(0);
  });

  test("This and following ends the series before the occurrence and starts a new one; Escape cancels", async ({ page: p }) => {
    await openBuilt(p, "following.html", gridPage());
    await move(p);
    await p.keyboard.press("Escape");
    await expect(p.getByRole("dialog")).toHaveCount(0);
    expect(await p.evaluate(() => window.commits.length)).toBe(0);
    await move(p);
    await p.getByRole("button", { name: "This and following events" }).click();
    // The old series is saved first, then the new one.
    await expect.poll(() => p.evaluate(() => window.commits.length)).toBe(2);
    const rows = await p.evaluate(() => window.commits.flatMap(commit => commit.rows));
    expect(await p.evaluate(() => window.commits.map(commit => commit.rows.map(row => row.op || "update")))).toEqual([["update"], ["insert"]]);
    const update = rows.find(row => row.op !== "insert"), insert = rows.find(row => row.op === "insert");
    // One occurrence (October 5) stays in the old series; the new one has the five left.
    expect(update).toMatchObject({ id: "s", values: { rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=1" } });
    expect(insert.values).toMatchObject({ rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=5", start: "2026-10-12T15:00:00Z" });
    // A saved new record leaves the history (there are no deletes), and the change grouped with it goes with it.
    await p.locator(".cx-cal-ev").first().focus();
    await p.keyboard.press("Control+z");
    await p.waitForTimeout(300);
    expect(await p.evaluate(() => window.commits.length)).toBe(2);
    expect(await p.evaluate(() => window.api.canUndo())).toBe(false);
  });

  test("occurrence 'all' moves the whole series without asking", async ({ page: p }) => {
    await openBuilt(p, "all.html", gridPage("all"));
    await move(p);
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => p.evaluate(() => window.commits[0]?.rows[0].values.start)).toBe("2026-10-05T15:00:00Z");
  });
});

test.describe("context menus and hover cards", () => {
  test("right-click on an event offers Open and Move; Shift+F10 on a slot offers New event here; the host adds its own", async ({ page: p }) => {
    await openBuilt(p, "menu.html", page("{ preset: 'scheduler', events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }"));
    await p.locator('.cx-cal-ev[data-cx-record="a"]').click({ button: "right" });
    const menu = p.getByRole("menu", { name: "Actions for Planning" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Move"]);
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await capture(p, "calendar-context-menu");
    await p.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Move" })).toBeFocused();
    await p.keyboard.press("Enter");
    await expect(p.locator(".cx-cal .cx-live")).toHaveText(/^Arrow keys move/);
    await p.keyboard.press("Escape");
    await slot(p, 14, 600).focus();
    await p.keyboard.press("Shift+F10");
    await expect(p.getByRole("menuitem")).toHaveText(["New event here"]);
    await p.keyboard.press("Escape");
    await expect(p.getByRole("menu")).toHaveCount(0);
    await expect(slot(p, 14, 600)).toBeFocused();
    // WCAG rules (the time grid's corner header is empty by design, a best-practice note).
    expect(await new AxeBuilder({ page: p }).include("#cal").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze().then(result => result.violations.map(item => item.id))).toEqual([]);
  });

  test("a host hook replaces the items, and returning null leaves the browser's menu", async ({ page: p }) => {
    // Functions in calendar are the host's hooks; createCalendar passes them to the grid options.
    await openBuilt(p, "menu-hook.html", page("{ preset: 'scheduler', events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1, calendar: { menu: (context, defaults) => context.kind === 'event' ? [{ id: 'open' }, { label: 'Copy link', run: c => { window.copied = c.event.id; } }] : null } }"));
    await p.locator('.cx-cal-ev[data-cx-record="a"]').click({ button: "right" });
    await expect(p.getByRole("menuitem")).toHaveText(["Open", "Copy link"]);
    await p.getByRole("menuitem", { name: "Copy link" }).click();
    await expect.poll(() => p.evaluate(() => window.copied)).toBe("a");
    await slot(p, 14, 600).click({ button: "right" });
    await expect(p.getByRole("menu")).toHaveCount(0);
  });

  test("a touch long press opens the menu; the hover card shows on pointer hover only", async ({ page: p }) => {
    await openBuilt(p, "touch.html", page("{ events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }"));
    const event = p.locator('.cx-cal-ev[data-cx-record="a"]'), box = await event.boundingBox();
    await event.hover();
    await expect(p.locator(".cx-cal-hover")).toContainText("Planning", { timeout: 3000 });
    await p.mouse.move(5, 5);
    await expect(p.locator(".cx-cal-hover")).toHaveCount(0);
    await event.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 7, clientX: box.x + 10, clientY: box.y + 10, isPrimary: true });
    await p.waitForTimeout(800);
    await expect(p.getByRole("menuitem")).toHaveText(["Open"]);
  });
});

test.describe("sources and iCalendar", () => {
  const ICS = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VTIMEZONE", "TZID:Europe/Warsaw", "END:VTIMEZONE",
    "BEGIN:VEVENT", "UID:h1", "SUMMARY:Public holiday", "DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261102", "END:VEVENT",
    "BEGIN:VEVENT", "UID:m1", "SUMMARY:Board meeting\\, quarterly", "DESCRIPTION:Line one\\nLine two", "LOCATION:Room 4",
    "DTSTART;TZID=Europe/Warsaw:20261014T100000", "DURATION:PT90M", "END:VEVENT",
    "BEGIN:VEVENT", "UID:r1", "SUMMARY:Payroll run", "DTSTART:20261002T080000Z", "DTEND:20261002T090000Z", "RRULE:FREQ=WEEKLY;BYDAY=FR", "EXDATE:20261009T080000Z", "END:VEVENT",
    "BEGIN:VEVENT", "UID:r1", "RECURRENCE-ID:20261016T080000Z", "SUMMARY:Payroll run (late)", "DTSTART:20261016T110000Z", "DTEND:20261016T120000Z", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:No start", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

  test("a legend switches sources off and on; an iCalendar source joins read-only", async ({ page: p }) => {
    await p.route("http://canopyx.test/holidays.ics", route => route.fulfill({ contentType: "text/calendar", body: ICS }));
    await openBuilt(p, "sources.html", page("{ preset: 'standard', date: '2026-10-16', firstDay: 1, events: [{ id: 'a', title: 'Planning', start: '2026-10-16T09:00:00Z', source: 'team' }, { id: 'b', title: 'On call', start: '2026-10-14T08:00:00Z', source: 'ops' }]," +
      "sources: [{ id: 'team', label: 'Team', tone: 'info' }, { id: 'ops', label: 'Operations', tone: 'danger' }, { id: 'ext', label: 'Company', tone: 'success', ics: 'holidays.ics' }] }"));
    const legend = p.getByRole("group", { name: "Calendars" });
    await expect(legend.getByRole("button")).toHaveText(["Team", "Operations", "Company"]);
    await expect.poll(async () => (await events(p)).map(event => event.title).sort()).toEqual(["Board meeting, quarterly", "On call", "Payroll run", "Payroll run", "Payroll run", "Payroll run (late)", "Planning", "Public holiday"]);
    const meeting = (await events(p)).find(event => event.title === "Board meeting, quarterly");
    expect(meeting).toMatchObject({ start: "2026-10-14T08:00:00Z", end: "2026-10-14T09:30:00Z" });
    await capture(p, "calendar-sources-legend");
    await legend.getByRole("button", { name: "Operations" }).click();
    await expect(legend.getByRole("button", { name: "Operations" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await events(p)).some(event => event.title === "On call")).toBe(false);
    await legend.getByRole("button", { name: "Company" }).click();
    await expect.poll(async () => (await events(p)).length).toBe(1);
    await legend.getByRole("button", { name: "Company" }).click();
    // An imported event opens its details (the drawer has no record for it) and cannot be moved.
    await p.locator(".cx-cal-ev").filter({ hasText: "Board meeting" }).click();
    await expect(p.getByRole("dialog", { name: "Board meeting, quarterly" })).toContainText("Room 4");
  });

  test("an iCalendar file past a limit, or without a calendar, fails with a notice; another site is refused", async ({ page: p }) => {
    await p.route("http://canopyx.test/big.ics", route => route.fulfill({ contentType: "text/calendar", body: "BEGIN:VCALENDAR\r\n" + "X-PAD:" + "x".repeat(20000) + "\r\nEND:VCALENDAR" }));
    await openBuilt(p, "bad.html", page("{ date: '2026-10-16', events: [], sources: [{ id: 'x', label: 'External', ics: 'big.ics' }] }"));
    await expect(p.locator(".cx-cal-notice")).toHaveText(/Could not read External: a line longer than 10000 characters/);
    const refused = await p.evaluate(() => new Promise(resolve => {
      const host = document.createElement("div"); document.body.appendChild(host);
      host.addEventListener("canopyx:error", event => resolve(String(event.detail.error?.message)));
      try { CanopyX.createCalendar(host, { events: [], sources: [{ id: "x", label: "X", ics: "https://elsewhere.example/a.ics" }] }); } catch (error) { resolve(error.message); }
      setTimeout(() => resolve(host.textContent), 5000);
    }));
    expect(refused).toContain("same-origin");
  });

  test("the parser keeps every value text, drops control characters and counts unreadable events", async ({ page: p }) => {
    await loadKit(p);
    const result = await p.evaluate(text => window.kit.calIcsParse(text, "utc"), ICS);
    expect(result.skipped).toBe(1);
    expect(result.events.map(event => event.title)).toEqual(["Public holiday", "Board meeting, quarterly", "Payroll run", "Payroll run (late)"]);
    expect(result.events[1]).toMatchObject({ description: "Line one\nLine two", location: "Room 4", start: "2026-10-14T08:00:00Z", end: "2026-10-14T09:30:00Z" });
    expect(result.events[0]).toMatchObject({ allDay: true, start: "2026-11-01T00:00:00Z", end: "2026-11-02T00:00:00Z" });
    expect(result.events[2]).toMatchObject({ recurrence: "FREQ=WEEKLY;BYDAY=FR", exceptions: "2026-10-09T08:00:00Z" });
    const errors = await p.evaluate(() => [
      () => window.kit.calIcsParse("BEGIN:VEVENT\r\nEND:VEVENT"),
      () => window.kit.calIcsParse("x".repeat(2000001)),
      () => window.kit.calIcsParse("BEGIN:VCALENDAR\r\n" + "BEGIN:VEVENT\r\nDTSTART:20260101T000000Z\r\nEND:VEVENT\r\n".repeat(5001) + "END:VCALENDAR")
    ].map(run => { try { run(); return null; } catch (error) { return error.message; } }));
    expect(errors).toEqual(["no VCALENDAR", "more than 2000000 characters", "more than 5000 events"]);
    const dirty = await p.evaluate(() => window.kit.calIcsParse("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261001T000000Z\r\nSUMMARY:<b>Bold</b>\u0007 \\; ok\r\nRRULE:FREQ=SECONDLY\r\nEND:VEVENT\r\nEND:VCALENDAR", "utc"));
    expect(dirty.events[0]).toMatchObject({ title: "<b>Bold</b> ; ok", recurrence: null });
    expect(dirty.notes.join(" ")).toContain("repeat rule");
  });
});

test.describe("inverse ranges", () => {
  test("an inverse range shades the time outside it, and creating there is refused", async ({ page: p }) => {
    await openCalendar(p, "calendar-scheduler.html", { width: 1440, height: 1200 });
    const shaded = p.locator(".cx-cal-unavailable");
    await expect(shaded.first()).toBeVisible();
    // Weekdays: before 08:00 and after 18:00; the weekend all day.
    const titles = await shaded.evaluateAll(blocks => blocks.map(block => block.title || block.getAttribute("aria-label") || block.textContent));
    expect(titles.some(text => /Outside office hours/.test(text))).toBe(true);
    await capture(p, "calendar-inverse-background");
    await slot(p, 17, 600).click();
    await expect(p.locator(".cx-cal-notice").first()).toHaveText("Unavailable");
  });
});

test.describe("review guards", () => {
  test("a drag that did not start in the page drops nothing", async ({ page: p }) => {
    await openBuilt(p, "foreign.html", page("{ preset: 'scheduler', drop: true, events: " + EVENTS + ", date: '2026-10-16', view: 'week', firstDay: 1 }"));
    const target = await slot(p, 13, 900).boundingBox();
    const data = await p.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.setData("application/x-canopyx-event", JSON.stringify({ title: "Injected" })); return transfer; });
    await p.locator(".cx-cal-body").dispatchEvent("dragover", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    await p.locator(".cx-cal-body").dispatchEvent("drop", { dataTransfer: data, clientX: target.x + 10, clientY: target.y + 4 });
    await p.waitForTimeout(300);
    expect(await p.evaluate(() => window.commits.length)).toBe(0);
    expect((await events(p)).some(event => event.title === "Injected")).toBe(false);
  });

  test("a refused new series keeps the old one whole, and a failed save leaves nothing to redo", async ({ page: p }) => {
    const { script, style } = runtimeAssets("grid");
    const view = "{ protocol: 'canopyx/2', type: 'grid', id: 'ops', label: 'Ops', rowHeight: 34, pageSize: 200, selection: 'single', columns: [" +
      "{ id: 'title', title: 'Title', kind: 'text', rowHeader: true, editable: true }, { id: 'start', title: 'Start', kind: 'datetime', editable: true }, { id: 'end', title: 'End', kind: 'datetime', editable: true }," +
      "{ id: 'rule', title: 'Rule', kind: 'text', editable: true }, { id: 'series', title: 'Series', kind: 'text', editable: true }, { id: 'rid', title: 'Replaces', kind: 'datetime', editable: true }]," +
      "source: { kind: 'inline' }, rows: [{ id: 's', cells: { title: 'Weekly sync', start: '2026-10-05T14:00:00Z', end: '2026-10-05T15:00:00Z', rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6' } }]," +
      "calendar: { start: 'start', end: 'end', title: 'title', recurrence: 'rule', series: 'series', recurrenceId: 'rid', date: '2026-10-12', view: 'week', views: ['week'], firstDay: 1, editable: true, occurrence: 'following' } }";
    const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Guard</title><style>" + style + " #cal{height:700px}</style><script>" + script + "</script>" + editingAssets() +
      "</head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"light\"></div><script>window.refuse = true; window.commits = [];\n" +
      "const writer = { commit(batch) { window.commits.push(JSON.parse(JSON.stringify(batch))); return { protocol: 'canopyx/2', type: 'gridCommitResult', view: batch.view, rows: batch.rows.map(row => ({ id: row.id, status: 'error', error: 'Offline' })) }; } };\n" +
      "const host = document.getElementById('cal'); host.addEventListener('canopyx:rowInserting', event => { if (window.refuse) event.preventDefault(); });\n" +
      "window.api = CanopyX.createDataGrid(host, Object.assign({ editing: writer }, { view: " + view + " }));</script></body></html>";
    await openBuilt(p, "guard.html", html);
    const move = async () => {
      const box = await p.locator('.cx-cal-ev[data-cx-record="s"]').boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + 8); await p.mouse.down();
      for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + box.width / 2, box.y + 8 + 48 * i / 8); await p.waitForTimeout(20); }
      await p.waitForTimeout(80); await p.mouse.up(); await p.waitForTimeout(300);
    };
    await move();
    // The insert was refused: the series keeps its rule, and no step is left to undo.
    expect(await p.evaluate(() => window.api.getChanges())).toEqual([]);
    expect(await p.evaluate(() => window.api.canUndo())).toBe(false);
    await p.evaluate(() => { window.refuse = false; });
    await move();
    // The writer refuses the old series' new end: nothing is sent for the new series, and nothing is left to redo.
    await expect(p.locator(".cx-cal-notice")).toHaveText(/not saved: Offline/);
    expect(await p.evaluate(() => window.commits.map(commit => commit.rows.map(row => row.op || "update")))).toEqual([["update"]]);
    expect(await p.evaluate(() => window.api.getChanges())).toEqual([]);
    expect(await p.evaluate(() => window.api.canRedo())).toBe(false);
  });

  test("the parser bounds what an imported file can make a calendar do", async ({ page: p }) => {
    await loadKit(p);
    const result = await parseAdversarialCalendar(p);
    expect(result.count.recurrence).toBe("FREQ=DAILY;UNTIL=20290626T080000Z");
    expect(result.count.cut).toBe(true);
    expect(result.never).toMatchObject({ recurrence: null, unsupported: true });
  });
});

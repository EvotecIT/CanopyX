import { test, expect } from "@playwright/test";
import { calendarC1Page } from "./calendar-c1-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";
import { openBuilt } from "./calendar-support.mjs";

test.use({ timezoneId: "Europe/Warsaw" });

const events = page => page.evaluate(() => window.api.getCalendarEvents());
const form = page => page.locator(".cx-cal-occurrence-editor");
async function editOccurrence(page, event) {
  expect(await page.evaluate(id => window.api.editCalendarOccurrence(id), event.id)).toBe(true);
  await expect(form(page)).toBeVisible();
}
async function saveTitle(page, title) {
  await form(page).getByLabel("Title", { exact: true }).fill(title);
  await form(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(form(page)).toHaveCount(0);
}

for (const kind of ["repeated endpoints", "repeated start"]) test("occurrence title edits preserve unchanged instants through DST " + kind, async ({ page }) => {
  const start = kind === "repeated endpoints" ? "2026-10-24T00:30:00Z" : "2026-10-25T01:30:00.125Z";
  const end = kind === "repeated endpoints" ? "2026-10-24T01:30:00Z" : "2026-10-25T02:30:00.875Z";
  await openBuilt(page, "dst-c1.html", calendarEditPage({ occurrence: "this", inline: true, starts: start, ends: end,
    date: "2026-10-25", timeZone: kind === "repeated endpoints" ? "Europe/Warsaw" : "local" }));
  const event = (await events(page)).find(item => item.start.startsWith("2026-10-25"));
  await editOccurrence(page, event);
  await saveTitle(page, "Title changed only");
  const batch = await page.evaluate(() => window.commits[0]);
  expect(batch.rows.find(row => row.op === "insert").values).toMatchObject({ title: "Title changed only", starts: event.start, ends: event.end, rid: event.start });
  expect(batch.rows.find(row => row.id === "event").values.exceptions).toContain(event.start);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("editing only an occurrence end preserves its unchanged later-fold start", async ({ page }) => {
  await openBuilt(page, "dst-end-c1.html", calendarEditPage({ occurrence: "this", inline: true,
    starts: "2026-10-25T01:30:00.125Z", ends: "2026-10-25T02:30:00Z", date: "2026-10-25", timeZone: "Europe/Warsaw" }));
  const event = (await events(page))[0];
  await editOccurrence(page, event);
  await form(page).getByLabel("Ends", { exact: true }).fill("2026-10-25T04:00");
  await saveTitle(page, "Longer session");
  expect(await page.evaluate(() => window.commits[0].rows.find(row => row.op === "insert").values)).toMatchObject({
    starts: event.start, ends: "2026-10-25T03:00:00Z", rid: event.start
  });
});

test("first hosted occurrence edit writes EXDATE for a master absent from the table page", async ({ page }) => {
  const extraRows = Array.from({ length: 20 }, (_, index) => ({ id: "older-" + index, cells: {
    title: "Older record", starts: "2026-09-01T09:00:00Z", ends: "2026-09-01T10:00:00Z" } }));
  await openBuilt(page, "hosted-c1.html", calendarEditPage({ occurrence: "this", rangeOnlyMaster: true, extraRows }));
  await editOccurrence(page, (await events(page))[0]);
  await saveTitle(page, "Hosted exception");
  const batch = await page.evaluate(() => window.commits[0]);
  expect(batch.rows).toHaveLength(2);
  expect(batch.rows.find(row => row.id === "event").values.exceptions).toContain("2026-10-14T09:00:00Z");
  expect(batch.rows.find(row => row.op === "insert").values).toMatchObject({ title: "Hosted exception", series: "event", rid: "2026-10-14T09:00:00Z" });
  await page.evaluate(() => window.readSaved());
  expect((await events(page)).filter(item => item.title === "Hosted exception")).toHaveLength(1);
  expect((await events(page)).filter(item => item.title === "Planning")).toHaveLength(4);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("feed tuple identities and master links stay independent of colons and native records", async ({ page }) => {
  const nativeId = 'json:["team:east","meeting"]';
  await page.route("http://canopyx.test/east**", route => route.fulfill({ json: [
    { id: "meeting", title: "East series", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", recurrence: "FREQ=DAILY;COUNT=2" },
    { id: "exception", title: "East override", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", series: "meeting", recurrenceId: "2026-10-16T09:00:00Z" }
  ] }));
  await page.route("http://canopyx.test/team**", route => route.fulfill({ json: [
    { id: "east:meeting", title: "Team series", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", recurrence: "FREQ=DAILY;COUNT=2" }
  ] }));
  await openBuilt(page, "identity-c1.html", calendarC1Page({ links: true, events: [
    { id: nativeId, title: "Native series", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", recurrence: "FREQ=DAILY;COUNT=2" },
    { id: "grid:" + nativeId, title: "Native reserved prefix", start: "2026-10-16T13:00:00Z", end: "2026-10-16T14:00:00Z" }
  ], sources: [{ id: "team:east", label: "East", url: "/east" }, { id: "team", label: "Team", url: "/team" }] }));
  const items = await events(page);
  expect(items.map(item => item.title).sort()).toEqual(["East override", "Native reserved prefix", "Native series", "Team series"]);
  expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  for (const item of items) {
    await page.evaluate(id => window.api.openCalendarEvent(id), item.id);
    await expect(page.locator(".cx-cal-details")).toContainText(item.title);
    await page.keyboard.press("Escape");
  }
  const text = await page.evaluate(async () => (await window.api.exportCalendar({ scope: "visible" })).text);
  const unfolded = text.replace(/\r\n /g, "");
  expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  for (const title of ["East override", "East series", "Native series", "Team series", "Native reserved prefix"]) expect(unfolded).toContain("SUMMARY:" + title);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1), uid = title => blocks.find(block => block.includes("SUMMARY:" + title + "\r\n")).match(/UID:(.+)/)[1];
  expect(uid("East override")).toBe(uid("East series"));
  expect(new Set([uid("East series"), uid("Team series"), uid("Native series"), uid("Native reserved prefix")]).size).toBe(4);
  await page.evaluate(async id => {
    window.links = []; document.getElementById("cal").addEventListener("canopyx:linkchange", event => window.links.push(event.detail));
    await window.api.setCalendarView("month"); await window.api.setHighlight([id]);
  }, nativeId);
  await expect(page.locator('.cx-cal-ev[data-cx-linked="true"]')).toHaveCount(2);
  for (const element of await page.locator('.cx-cal-ev[data-cx-linked="true"]').all()) await expect(element).toContainText("Native series");
  await page.locator('.cx-cal-day[data-cx-day="' + Date.parse("2026-10-16T00:00:00Z") / 86400000 + '"]').focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.links.at(-1).keys.sort())).toEqual([nativeId, "grid:" + nativeId].sort());
  await page.evaluate(() => window.api.setCalendarSource("team:east", false));
  expect((await events(page)).some(item => item.source === "team:east")).toBe(false);
  expect((await events(page)).filter(item => item.title === "Native series")).toHaveLength(2);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

for (const view of ["day", "week", "timeline"]) test("shared event repaint and editor return preserve the focused assignment in " + view, async ({ page }) => {
  await openBuilt(page, "focus-c1.html", calendarC1Page({ count: 3, view, live: true, editable: true, calendar: { occurrence: "all", editable: { commit: "manual" } }, events: [
    { id: "shared", title: "Shared review", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", recurrence: "FREQ=DAILY;COUNT=2", resourceIds: ["room-0", "room-2"] }
  ] }));
  const copy = page.locator('[data-cx-resource="room-2"] > .cx-cal-ev[data-cx-record="shared"]').first();
  await copy.focus();
  // A real live update drives the ordinary repaint while the second assignment owns DOM focus.
  await page.evaluate(() => window.api.updateRows([{ id: "shared", cells: { title: "Shared review refreshed" } }]));
  await expect(copy).toContainText("Shared review refreshed");
  await expect(copy).toBeFocused();
  await copy.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit this occurrence", exact: true }).click();
  await expect(form(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(copy).toBeFocused();
  // F2 then a resource move must replace room-2, preserving room-0.
  await page.keyboard.press("F2"); await page.keyboard.press("Alt+ArrowUp"); await page.keyboard.press("Enter");
  await expect.poll(async () => (await events(page)).find(item => item.record === "shared").resourceIds).toEqual(["room-0", "room-1"]);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

for (const allDay of [false, true]) test("shared event repaint retains the second day's " + (allDay ? "all-day assignment" : "overnight segment"), async ({ page }) => {
  await openBuilt(page, "segment-c1.html", calendarC1Page({ count: 3, view: "week", live: true, editable: true,
    calendar: { minTime: "00:00", maxTime: "24:00" }, events: [{ id: "shared", title: "Shared session", allDay,
      start: allDay ? "2026-10-15" : "2026-10-15T23:00:00Z", end: allDay ? "2026-10-17" : "2026-10-16T01:00:00Z",
      recurrence: "FREQ=WEEKLY;COUNT=2", resourceIds: ["room-0", "room-2"] }] }));
  const day = Date.parse("2026-10-16T00:00:00Z") / 86400000;
  const copy = page.locator('[data-cx-day="' + day + '"][data-cx-resource="room-2"] > .cx-cal-ev[data-cx-record="shared"]').first();
  await copy.focus();
  await page.evaluate(() => window.api.updateRows([{ id: "shared", cells: { title: "Session refreshed" } }]));
  await expect(copy).toContainText("Session refreshed"); await expect(copy).toBeFocused();
  await copy.click({ button: "right" }); await page.getByRole("menuitem", { name: "Edit this occurrence", exact: true }).click();
  await expect(form(page)).toBeVisible(); await page.keyboard.press("Escape"); await expect(copy).toBeFocused();
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("resource-window resize retains the shared event's second assignment", async ({ page }) => {
  await openBuilt(page, "window-focus-c1.html", calendarC1Page({ count: 48, events: [
    { id: "shared", title: "Shared review", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resourceIds: ["room-0", "room-2"] }
  ] }));
  const copy = page.locator('[data-cx-resource="room-2"] > .cx-cal-ev[data-cx-record="shared"]').first();
  await copy.focus();
  const original = await copy.elementHandle();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(() => original.evaluate(element => element.isConnected)).toBe(false);
  await expect(copy).toBeFocused();
});

test("resource picker stays keyboard accessible after grid focus and repaint", async ({ page }) => {
  await openBuilt(page, "picker-c1.html", calendarC1Page({ count: 48 }));
  const picker = page.locator(".cx-cal-rpick-select");
  await page.locator(".cx-cal-slot").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.setViewportSize({ width: 1320, height: 900 });
  await picker.focus(); await expect(picker).toBeFocused();
  await picker.selectOption("8"); await expect(picker).toBeFocused();
  await expect(page.locator(".cx-cal-rhead").first()).toHaveText("Room 09");
  await page.locator(".cx-cal-rpick-next").focus(); await page.keyboard.press("Enter");
  await expect(picker).toBeFocused();
  await expect(page.locator(".cx-cal-rhead").first()).toHaveText("Room 17");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

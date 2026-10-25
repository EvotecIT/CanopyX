import { test, expect } from "@playwright/test";
import { calendarC1Page } from "./calendar-c1-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";
import { openBuilt } from "./calendar-support.mjs";
import { nextFrames } from "./support.mjs";

const nativeId = 'json:["team:east","meeting"]';
const sources = [{ id: "team:east", label: "East", url: "/east" }];
async function feed(page) {
  await page.route("http://canopyx.test/east**", route => route.fulfill({ json: [{ id: "meeting", title: "Feed meeting",
    start: "2026-10-16T08:00:00Z", end: "2026-10-16T09:00:00Z" }] }));
}

test("opening an exact feed occurrence id takes precedence over a matching native record key", async ({ page }) => {
  await feed(page);
  await openBuilt(page, "open-identity-c1.html", calendarC1Page({ sources, events: [{ id: nativeId, title: "Native meeting",
    start: "2026-10-16T07:00:00Z", end: "2026-10-16T08:00:00Z" }] }));
  const items = await page.evaluate(() => window.api.getCalendarEvents());
  await page.evaluate(id => window.api.openCalendarEvent(id), items.find(item => item.external).id);
  await expect(page.locator(".cx-cal-details .cx-cal-det-title")).toHaveText("Feed meeting");
  await page.keyboard.press("Escape");
  await page.evaluate(id => window.api.openCalendarEvent(id), items.find(item => !item.external).id);
  await expect(page.locator(".cx-cal-details .cx-cal-det-title")).toHaveText("Native meeting");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("a range-only native master cannot borrow a colliding external record during its first occurrence edit", async ({ page }) => {
  await feed(page);
  await openBuilt(page, "edit-identity-c1.html", calendarEditPage({ occurrence: "this", rangeOnlyMaster: nativeId, sources, extraRows: [{ id: nativeId,
    cells: { title: "Native series", starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z", allDay: "false", resource: "Room A", rule: "FREQ=DAILY;COUNT=2" } }] }));
  const event = (await page.evaluate(() => window.api.getCalendarEvents())).find(item => !item.external && item.record === nativeId);
  expect(await page.evaluate(id => window.api.editCalendarOccurrence(id), event.id)).toBe(true);
  const form = page.locator(".cx-cal-occurrence-editor");
  await form.getByLabel("Title", { exact: true }).fill("Native exception");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).toHaveCount(0);
  const batch = await page.evaluate(() => window.commits[0]);
  expect(batch.rows).toHaveLength(2);
  expect(batch.rows.find(row => row.id === nativeId).values.exceptions).toContain(event.start);
  expect(batch.rows.find(row => row.op === "insert").values).toMatchObject({ title: "Native exception", series: nativeId, rid: event.start });
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

for (const mode of ["ordinary", "all", "following"]) test("colliding feed bookings still block " + mode + " native moves", async ({ page }) => {
  const day = mode === "ordinary" ? "16" : mode === "all" ? "17" : "18";
  await page.route("http://canopyx.test/east**", route => route.fulfill({ json: [{ id: "meeting", title: "Feed booking",
    start: "2026-10-" + day + "T10:00:00Z", end: "2026-10-" + day + "T11:00:00Z", resource: "Room A" }] }));
  await openBuilt(page, "overlap-identity-c1.html", calendarEditPage({ sources, resources: true, overlap: false, inline: true,
    ...(mode === "ordinary" ? {} : { occurrence: mode }), extraRows: [{ id: nativeId,
      cells: { title: "Native collision", starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z", allDay: "false", resource: "Room A",
        ...(mode === "ordinary" ? {} : { rule: "FREQ=DAILY;COUNT=3" }) } }] }));
  const event = page.locator(".cx-cal-ev").filter({ hasText: "Native collision" }).nth(mode === "following" ? 1 : 0);
  await nextFrames(page); await event.scrollIntoViewIfNeeded(); await event.focus(); await page.keyboard.press("F2");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.locator(".cx-live").filter({ hasText: "Feed booking" })).toHaveCount(1);
  expect(await page.evaluate(() => window.commits)).toEqual([]);
  expect(await page.evaluate(() => window.api.getChanges())).toEqual([]);
  expect(await page.evaluate(() => window.records.find(row => row.id === 'json:["team:east","meeting"]').cells.starts)).toBe("2026-10-16T09:00:00Z");
});

test("a native series still excludes its own occurrences from overlap checks", async ({ page }) => {
  await openBuilt(page, "self-overlap-c1.html", calendarEditPage({ occurrence: "all", resources: true, overlap: false, inline: true,
    extraRows: [{ id: nativeId, cells: { title: "Native collision", starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z",
      allDay: "false", resource: "Room A", rule: "FREQ=DAILY;COUNT=3" } }] }));
  const event = page.locator(".cx-cal-ev").filter({ hasText: "Native collision" }).first();
  await nextFrames(page); await event.scrollIntoViewIfNeeded(); await event.focus();
  await page.keyboard.press("F2"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
  expect(await page.evaluate(() => window.records.find(row => row.id === 'json:["team:east","meeting"]').cells.starts)).toBe("2026-10-16T10:00:00Z");
});

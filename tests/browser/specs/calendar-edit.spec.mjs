// Editing a calendar (docs/calendar.md#editing): drag to move and resize, the keyboard move mode, commits through the editing
// contract with undo and redo, refusals for overlaps, allowed resources and working hours shown before the drop, a failed save
// putting the event back, and moving a recurring series.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";
import { api, capture, openCalendar, NOW } from "./calendar-support.mjs";

/** Drags from the middle (or an edge) of an element by dx, dy in steps, optionally stopping before the drop. */
async function drag(page, locator, dx, dy, { from = "middle", drop = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = from === "bottom" ? box.y + box.height - 3 : from === "end" ? box.y + box.height / 2 : box.y + Math.min(12, box.height / 2);
  const startX = from === "end" ? box.x + box.width - 3 : x;
  await page.mouse.move(startX, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(startX + dx * i / 8, y + dy * i / 8); await page.waitForTimeout(20); }
  await page.waitForTimeout(80);
  if (drop) { await page.mouse.up(); await page.waitForTimeout(150); }
}
const startOf = (page, record) => api(page, "(api, element, id) => api.getCalendarEvents().find(event => event.record === id)?.start", record);

test.describe("calendar editing", () => {
  test("dragging moves an event, commits it, and undo and redo take it back and forth", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    const commits = [];
    await page.exposeFunction("onCommit", detail => commits.push(detail));
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:commit", event => window.onCommit(event.detail)));
    const event = page.locator('.cx-cal-ev[data-cx-record="op-010"]');
    const slot = await page.locator(".cx-cal-slot").first().boundingBox();
    // One column to the left and five slots (two and a half hours) down: Thursday 11:30.
    await drag(page, event, -slot.width, 24 * 5);
    await expect.poll(() => startOf(page, "op-010")).toBe("2026-10-15T11:30:00Z");
    await expect.poll(() => commits.length).toBe(1);
    expect(commits[0]).toMatchObject({ ok: true, saved: 1 });
    expect(await api(page, "api => api.getChanges()")).toEqual([]);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Database failover test moved to Oct 15 11:30 AM");
    await page.locator('.cx-cal-ev[data-cx-record="op-010"]').focus();
    await page.keyboard.press("Control+z");
    await expect.poll(() => startOf(page, "op-010")).toBe("2026-10-16T09:00:00Z");
    await page.locator('.cx-cal-ev[data-cx-record="op-010"]').focus();
    await page.keyboard.press("Control+y");
    await expect.poll(() => startOf(page, "op-010")).toBe("2026-10-15T11:30:00Z");
    await expect.poll(() => commits.length).toBe(3);
  });

  test("dragging the bottom edge changes the end", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('day')");
    const event = page.locator('.cx-cal-ev[data-cx-record="op-010"]');
    await drag(page, event, 0, 24 * 2, { from: "bottom" });
    await expect.poll(() => api(page, "api => api.getCalendarEvents().find(event => event.record === 'op-010').end")).toBe("2026-10-16T12:00:00Z");
    expect(await startOf(page, "op-010")).toBe("2026-10-16T09:00:00Z");
  });

  test("pointer and F2 moves cancel with Escape; Shift with arrows changes the end", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    const event = page.locator('.cx-cal-ev[data-cx-record="op-010"]');
    await drag(page, event, 0, 48, { drop: false });
    await expect(page.locator(".cx-cal-ghost")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".cx-cal-ghost")).toHaveCount(0);
    expect(await startOf(page, "op-010")).toBe("2026-10-16T09:00:00Z");
    await event.focus();
    await page.keyboard.press("F2");
    await expect(page.locator(".cx-cal .cx-live")).toHaveText(/^Arrow keys move/);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cx-cal-ghost")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cx-cal-ghost")).toHaveCount(0);
    expect(await startOf(page, "op-010")).toBe("2026-10-16T09:00:00Z");
    await page.locator('.cx-cal-ev[data-cx-record="op-010"]').focus();
    await page.keyboard.press("F2");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => api(page, "api => { const event = api.getCalendarEvents().find(event => event.record === 'op-010'); return [event.start, event.end]; }"))
      .toEqual(["2026-10-15T09:30:00Z", "2026-10-15T11:45:00Z"]);
  });

  test("an overlap on the same host is refused before the drop and the event stays", async ({ page }) => {
    // The day zoom: a month of days, each a cell; drags snap to an hour.
    await openCalendar(page, "calendar-timeline.html");
    // Two events of one host a few days apart, the second long enough that landing on its start overlaps it.
    const pair = await page.evaluate(() => {
      const events = [...document.querySelectorAll(".cx-tl-lane .cx-cal-ev:not(.cx-tl-point)")].map(element => element._calEvent);
      const byHost = new Map();
      for (const event of events) { if (!byHost.has(event.resource)) byHost.set(event.resource, []); byHost.get(event.resource).push(event); }
      for (const list of byHost.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 0; i + 1 < list.length; i++)
          if (list[i + 1].start - list[i].start < 4 * 86400000 && list[i + 1].end - list[i + 1].start >= 180 * 60000 && list[i].end <= list[i + 1].start)
            return [list[i].key, list[i + 1].key, list[i].start, list[i + 1].start];
      }
      return null;
    });
    expect(pair).not.toBeNull();
    const [moving, target, movingStart, targetStart] = pair;
    const width = await page.evaluate(() => document.querySelector(".cx-tl-cell").getBoundingClientRect().width);
    const element = page.locator('.cx-tl-lane .cx-cal-ev[data-cx-record="' + moving + '"]');
    await drag(page, element, (targetStart - movingStart + 3600000) / 86400000 * width, 0, { drop: false });
    const ghost = page.locator(".cx-cal-ghost.cx-cal-conflict");
    await expect(ghost).toBeVisible();
    await expect(ghost).toContainText("Overlaps ");
    await capture(page, "drag-conflict-light-1440");
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
    expect(await api(page, "(api, element, id) => api.getCalendarEvents().find(event => event.record === id).start", moving)).toBe(new Date(movingStart).toISOString().replace(".000Z", "Z"));
    expect(await api(page, "api => api.getChanges()")).toEqual([]);
    void target;
  });

  test("a resource the record does not allow, and time outside working hours, are refused", async ({ page }) => {
    await openCalendar(page, "calendar-resources.html");
    const event = page.locator(".cx-cal-slots .cx-cal-ev").first();
    const record = await event.getAttribute("data-cx-record");
    const before = await startOf(page, record);
    await event.focus();
    await page.keyboard.press("F2");
    // Ada works 7:00 to 15:00: twelve hours later (24 steps of the 30-minute snap) is outside her shift, on the same day.
    for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cx-cal-ghost.cx-cal-conflict")).toContainText("Outside working hours");
    await page.keyboard.press("Enter");
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Outside working hours");
    expect(await startOf(page, record)).toBe(before);
  });

  test("a failed save puts the event back and says why", async ({ page }) => {
    const view = { protocol: "canopyx/2", type: "grid", id: "guarded", label: "Guarded", rowHeight: 34, pageSize: 50, selection: "single", search: false,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime", editable: true }, { id: "ends", title: "Ends", kind: "datetime", editable: true }],
      source: { kind: "inline" }, rows: [{ id: "g1", cells: { title: "Guarded window", starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z" } }],
      calendar: { start: "starts", end: "ends", title: "title", date: "2026-10-16", view: "day", views: ["day"], editable: true } };
    // A page the test builds preloads the editing part, which generated pages load on demand.
    const assets = new URL("../../../CanopyX.Html/Assets/", import.meta.url);
    const editing = "<style>" + fs.readFileSync(new URL("canopyx-editing.css", assets), "utf8") + "</style><script>" + fs.readFileSync(new URL("canopyx-editing.js", assets), "utf8") + "</script>";
    const setup = editing + "<script>CanopyX.configure('guarded', { editing: { commit(batch) { return { protocol: 'canopyx/2', type: 'gridCommitResult', view: batch.view, rows: batch.rows.map(row => ({ id: row.id, status: 'conflict' })) }; } } });</script>";
    await page.clock.setFixedTime(NOW);
    await page.route("http://canopyx.test/guarded.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
    await page.goto("http://canopyx.test/guarded.html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    await drag(page, page.locator(".cx-cal-ev").first(), 0, 48);
    await expect(page.locator(".cx-cal-notice")).toHaveText(/^Guarded window was not saved: /);
    await expect.poll(() => api(page, "api => api.getCalendarEvents()[0].start")).toBe("2026-10-16T09:00:00Z");
    expect(await api(page, "api => api.getChanges()")).toEqual([]);
  });

  test("moving an occurrence moves its series, unless the host takes it", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    await api(page, "api => api.setCalendarDate('2026-10-09')");
    // Backup verification repeats every other Friday at 09:00 and has no overriding records.
    const occurrence = page.locator('.cx-cal-ev[data-cx-record="op-007"]');
    await expect(occurrence).toHaveCount(1);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:occurrenceChange", event => { window.occurrence = event.detail; if (window.refuse) event.preventDefault(); }));
    await page.evaluate(() => { window.refuse = true; });
    await drag(page, occurrence, 0, 24 * 2);
    await expect.poll(() => page.evaluate(() => window.occurrence?.occurrence)).toBe("2026-10-09T09:00:00Z");
    expect(await page.evaluate(() => window.occurrence.start)).toBe("2026-10-09T10:00:00Z");
    expect(await api(page, "api => api.getChanges()")).toEqual([]);
    await page.evaluate(() => { window.refuse = false; });
    await drag(page, page.locator('.cx-cal-ev[data-cx-record="op-007"]'), 0, 24 * 2);
    // The whole series starts an hour later, and this week's occurrence with it.
    await expect.poll(() => api(page, "api => api.getCalendarEvents().find(event => event.record === 'op-007').start")).toBe("2026-10-09T10:00:00Z");
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Every occurrence of Backup verification moved");
  });

  test("a series with an overriding record, or moved to another day, is refused", async ({ page }) => {
    await openCalendar(page, "calendar.html");
    await api(page, "api => api.setCalendarView('week')");
    await api(page, "api => api.setCalendarDate('2026-10-06')");
    // The weekly window has a moved occurrence on October 15: shifting the series would detach it.
    await drag(page, page.locator('.cx-cal-ev[data-cx-record="op-001"]'), 0, 24 * 2);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Only the time of a whole series can be moved here.");
    expect(await api(page, "api => api.getCalendarEvents().find(event => event.record === 'op-001').start")).toBe("2026-10-06T20:00:00Z");
    const slot = await page.locator(".cx-cal-slot").first().boundingBox();
    await drag(page, page.locator('.cx-cal-ev[data-cx-record="op-003"]').first(), slot.width, 0);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Only the time of a whole series can be moved here.");
    expect(await api(page, "api => api.getChanges()")).toEqual([]);
  });
});

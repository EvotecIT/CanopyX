import { test, expect } from "@playwright/test";
import { openBuilt, capture } from "./calendar-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";

const event = page => page.locator('.cx-cal-ev[data-cx-record="event"]').filter({ hasText: "Planning" }).last();
const state = page => page.evaluate(() => ({ commits: window.commits, records: window.records, changes: window.api.getChanges(), events: window.api.getCalendarEvents(), errors: window.errors }));
async function move(page, keys = ["ArrowDown"]) {
  await event(page).scrollIntoViewIfNeeded(); await event(page).focus(); await page.keyboard.press("F2");
  for (const key of keys) await page.keyboard.press(key);
  await page.keyboard.press("Enter");
}
async function evidence(page, info, name) {
  await capture(page, name);
  await info.attach(name, { body: JSON.stringify(await state(page), null, 2), contentType: "application/json" });
}

test.describe("calendar edit contracts", () => {
  test("the calendar respects the host cell UI policy before keyboard move and resize", async ({ page }, info) => {
    await openBuilt(page, "edit-policy.html", calendarEditPage({ denied: ["starts", "ends"] }));
    await move(page); await move(page, ["Shift+ArrowDown"]);
    await evidence(page, info, "calendar-host-policy");
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).records[0].cells).toMatchObject({ starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z" });
    expect((await state(page)).changes).toEqual([]);
  });

  test("the calendar respects the host cell UI policy before pointer move and resize", async ({ page }) => {
    await openBuilt(page, "pointer-policy.html", calendarEditPage({ denied: ["starts", "ends"] }));
    for (const resize of [false, true]) {
      await event(page).scrollIntoViewIfNeeded();
      const box = await event(page).boundingBox(), x = box.x + box.width / 2, y = resize ? box.y + box.height - 2 : box.y + 12;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y + 48, { steps: 6 }); await page.waitForTimeout(80); await page.mouse.up();
    }
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).records[0].cells).toMatchObject({ starts: "2026-10-16T09:00:00Z", ends: "2026-10-16T10:00:00Z" });
    expect((await state(page)).changes).toEqual([]);
  });

  test("validRange refuses keyboard and pointer moves and resizes outside its dates while saving an inside move", async ({ page }, info) => {
    await openBuilt(page, "edit-range.html", calendarEditPage({ validRange: { start: "2026-10-16", end: "2026-10-17" } }));
    for (const keys of [["ArrowLeft"], ["Shift+ArrowRight"]]) {
      await move(page, keys);
      await expect(page.locator(".cx-cal .cx-live")).toHaveText("Outside the dates this calendar shows");
      expect((await state(page)).commits).toEqual([]);
    }
    for (const resize of [false, true]) {
      await event(page).scrollIntoViewIfNeeded();
      const box = await event(page).boundingBox(), slot = await page.locator(".cx-cal-slot").first().boundingBox();
      const x = box.x + box.width / 2, y = resize ? box.y + box.height - 2 : box.y + 12;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + slot.width * (resize ? 1 : -1), y, { steps: 6 });
      await expect(page.locator(".cx-cal-ghost")).toContainText("Outside the dates this calendar shows");
      await capture(page, "calendar-range-" + (resize ? "resize" : "move") + "-" + info.project.name);
      await page.mouse.up();
      await expect(page.locator(".cx-cal .cx-live")).toHaveText("Outside the dates this calendar shows");
      expect((await state(page)).commits).toEqual([]);
      expect((await state(page)).changes).toEqual([]);
    }
    await move(page);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    expect((await state(page)).records[0].cells).toMatchObject({ starts: "2026-10-16T09:30:00Z", ends: "2026-10-16T10:30:00Z" });
    expect((await state(page)).errors).toEqual([]);
  });

  test("a role change during a keyboard move refuses the stale proposal before saving", async ({ page }, info) => {
    await openBuilt(page, "stale-policy.html", calendarEditPage());
    await event(page).scrollIntoViewIfNeeded(); await event(page).focus(); await page.keyboard.press("F2"); await page.keyboard.press("ArrowDown");
    await page.evaluate(() => { window.policy.denied = ["starts"]; });
    await page.keyboard.press("Enter");
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    await evidence(page, info, "calendar-stale-policy");
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
  });

  test("an occurrence decision rechecks the host UI policy after the awaited hook", async ({ page }) => {
    await openBuilt(page, "awaited-policy.html", calendarEditPage({ occurrence: "this", holdOccurrence: true }));
    await move(page);
    await expect.poll(() => page.evaluate(() => typeof window.releaseOccurrence)).toBe("function");
    await page.evaluate(() => { window.policy.denied = ["starts"]; window.releaseOccurrence(); });
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
  });

  test("a resource move respects its cell policy and the host editing APIs retain their own contract", async ({ page }) => {
    await openBuilt(page, "resource-policy.html", calendarEditPage({ denied: ["resource"], resources: true }));
    await move(page, ["Alt+ArrowDown"]);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Not saved.");
    expect((await state(page)).commits).toEqual([]);
    await page.evaluate(async () => {
      window.api.setReadOnly(true);
      await window.api.setCellValue("event", "starts", "2026-10-16T11:00:00Z");
      await window.api.setCellValue("event", "ends", "2026-10-16T12:00:00Z");
      await window.api.commitChanges();
      const inserted = await window.api.insertRow({ cells: { title: "Host created", starts: "2026-10-16T13:00:00Z", ends: "2026-10-16T14:00:00Z" } });
      await window.api.commitChanges({ ids: [inserted.id] });
    });
    expect((await state(page)).commits).toHaveLength(2);
    expect((await state(page)).records[0].cells.starts).toBe("2026-10-16T11:00:00Z");
    expect((await state(page)).records[1].cells.title).toBe("Host created");
  });

  test("a following split respects the recurrence cell UI policy before cutting the original series", async ({ page }) => {
    await openBuilt(page, "following-policy.html", calendarEditPage({ occurrence: "following", inline: true, denied: ["rule"] }));
    await move(page);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    expect((await state(page)).records).toHaveLength(1);
    expect((await state(page)).records[0].cells.rule).toBe("FREQ=DAILY;COUNT=5");
  });

  test("a whole-series move respects the exception cell UI policy before shifting its excluded instants", async ({ page }) => {
    await openBuilt(page, "exceptions-policy.html", calendarEditPage({ occurrence: "all", inline: true, exceptions: true, denied: ["exceptions"] }));
    await move(page);
    await expect(page.locator(".cx-cal .cx-live")).toHaveText("Only the time of a whole series can be moved here.");
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    expect((await state(page)).records[0].cells).toMatchObject({ starts: "2026-10-14T09:00:00Z", exceptions: "2026-10-15T09:00:00Z" });
  });

  test("the existing occurrence hook can take a readonly copy before the built-in refusal", async ({ page }) => {
    await openBuilt(page, "host-copy.html", calendarEditPage({ occurrence: "following", inline: true, readonly: ["business"], takeOccurrence: true }));
    await move(page);
    await expect.poll(() => page.evaluate(() => window.occurrenceCalls)).toBe(1);
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    expect((await state(page)).records[0].cells.rule).toBe("FREQ=DAILY;COUNT=5");
    await expect(page.locator(".cx-cal-notice")).toBeHidden();
  });

  test("a readonly null value does not prevent an otherwise persistable occurrence copy", async ({ page }) => {
    await openBuilt(page, "null-copy.html", calendarEditPage({ occurrence: "this", readonly: ["business"], nullBusiness: true }));
    await move(page);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    await page.evaluate(() => window.readSaved());
    await expect.poll(() => page.evaluate(() => window.api.getCalendarEvents().find(item => item.record === "stored-1")?.title)).toBe("Planning");
    expect((await state(page)).records[1].cells).toMatchObject({ title: "Planning", resource: "Room A", allDay: "false" });
    expect((await state(page)).records[1].cells.business ?? null).toBeNull();
    expect((await state(page)).errors).toEqual([]);
  });

  for (const occurrence of ["this", "following"]) for (const readonly of ["title", "resource", "allDay", "business"]) test("a " + occurrence + " occurrence copy refuses a writer that cannot persist the readonly " + readonly + " value", async ({ page }, info) => {
    await openBuilt(page, "copy-" + occurrence + ".html", calendarEditPage({ occurrence, inline: occurrence === "following", readonly: [readonly], allDay: readonly === "allDay" }));
    await move(page, readonly === "allDay" ? ["Shift+ArrowRight"] : ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.occurrenceCalls)).toBe(1);
    const refusal = await page.locator(".cx-cal-notice").textContent();
    await capture(page, "calendar-copy-" + occurrence + "-" + readonly + "-notice");
    // Read the actual public source again: a locally complete draft is not proof that the saved record kept its values.
    await page.evaluate(() => window.readSaved());
    await expect(page.locator("[data-cx-calendar-ready]")).toHaveCount(1);
    await evidence(page, info, "calendar-copy-" + occurrence + "-" + readonly);
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).records).toHaveLength(1);
    expect(refusal).toBe("This part of the series cannot be saved because some values are read-only.");
  });

  for (const occurrence of ["this", "following"]) test("a " + occurrence + " occurrence copy preserves readonly values in a local inline calendar", async ({ page }) => {
    await openBuilt(page, "local-copy-" + occurrence + ".html", calendarEditPage({ occurrence, inline: true, local: true, readonly: ["title", "resource", "allDay", "business"] }));
    await move(page);
    await expect.poll(() => page.evaluate(() => window.api.getCalendarEvents().some(item => item.record !== "event"))).toBe(true);
    await page.evaluate(() => window.api.reload());
    await expect.poll(() => page.evaluate(() => window.api.getCalendarEvents().filter(item => item.record !== "event"))).toEqual([
      expect.objectContaining({ title: "Planning", resource: "Room A", start: "2026-10-18T09:30:00Z", end: "2026-10-18T10:30:00Z" })
    ]);
    const csv = await page.evaluate(() => window.api.toCsv({ scope: "all", columns: ["title", "resource", "allDay", "business"] }));
    expect(csv.match(/Planning,Room A,false,Keep me/g)).toHaveLength(2);
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
  });

  for (const occurrence of ["this", "following"]) test("a " + occurrence + " occurrence copy with editable values survives a writer and query roundtrip", async ({ page }) => {
    await openBuilt(page, "saved-copy-" + occurrence + ".html", calendarEditPage({ occurrence, inline: occurrence === "following" }));
    await move(page);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(occurrence === "this" ? 1 : 2);
    await page.evaluate(() => window.readSaved());
    await expect.poll(() => page.evaluate(() => window.api.getCalendarEvents().find(item => item.record === "stored-1")?.title)).toBe("Planning");
    expect((await state(page)).records[1].cells).toMatchObject({ title: "Planning", resource: "Room A", allDay: "false", business: "Keep me" });
    expect((await state(page)).changes).toEqual([]);
    expect((await state(page)).errors).toEqual([]);
  });
});

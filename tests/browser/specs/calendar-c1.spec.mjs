import { test, expect } from "@playwright/test";
import { calendarC1Page } from "./calendar-c1-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";
import { capture, openBuilt } from "./calendar-support.mjs";

const api = (page, call, arg) => page.evaluate(([call, arg]) => new Function("api", "element", "arg", "return (" + call + ")(api, element, arg)")(window.api, document.getElementById("cal"), arg), [call, arg]);

test("many resources mount bounded columns and reach the final resource with mouse and keyboard", async ({ page }) => {
  await openBuilt(page, "c1.html", calendarC1Page({ count: 1000 }));
  await expect(page.locator(".cx-cal-rhead")).toHaveCount(8);
  expect(await page.locator(".cx-cal-slot").count()).toBeLessThan(500);
  await expect(page.locator(".cx-cal-time")).toHaveAttribute("aria-colcount", "1001");
  await page.locator(".cx-cal-rpick-select").selectOption("992");
  await expect(page.locator(".cx-cal-rhead").last()).toHaveText("Room 1000");
  const final = page.locator('.cx-cal-slot[data-cx-resource="room-999"]').first();
  await final.focus(); await page.keyboard.press("ArrowLeft");
  await expect(page.locator('.cx-cal-slot[data-cx-resource="room-998"]').first()).toBeFocused();
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("week resource windows retain global column order across day boundaries", async ({ page }) => {
  await openBuilt(page, "week-c1.html", calendarC1Page({ count: 100, view: "week" }));
  await expect(page.locator(".cx-cal-time")).toHaveAttribute("aria-colcount", "701");
  await page.locator(".cx-cal-rpick-select").selectOption("96");
  await expect(page.locator(".cx-cal-rhead").first()).toHaveText("Room 97");
  await expect(page.locator(".cx-cal-dayhead")).toHaveCount(2);
  const edge = page.locator('.cx-cal-slot[data-cx-resource="room-95"]').first();
  // Move past the mounted window's left edge: the preceding resource is mounted and focused.
  const first = page.locator(".cx-cal-slot").first(); await first.focus(); await page.keyboard.press("ArrowLeft");
  await expect(edge).toBeFocused();
});

test("week resource scrolling reveals Friday events after the initial Monday window", async ({ page }) => {
  await openBuilt(page, "friday-c1.html", calendarC1Page({ count: 1000, view: "week" }));
  expect(await api(page, "a => a.getCalendarEvents().length")).toBe(1000);
  await expect(page.locator(".cx-cal-ev")).toHaveCount(0);
  await page.locator(".cx-cal-rpick-select").selectOption("4000");
  await expect(page.locator('.cx-cal-ev[data-cx-record="event-0"]')).toHaveCount(1);
  await expect(page.locator(".cx-cal-ev")).toHaveCount(8);
  await expect(page.locator('.cx-cal-slot[data-cx-resource="room-0"]').first()).toHaveAttribute("data-cx-day", String(Date.parse("2026-10-16T00:00:00Z") / 86400000));
  expect(await api(page, "a => a.getCalendarEvents().length")).toBe(1000);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("shared events retain one identity across day, month and timeline views", async ({ page }) => {
  await openBuilt(page, "shared-c1.html", calendarC1Page({ count: 3, links: true, events: [{ id: "shared", title: "Shared review", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resource: "room-0", resourceIds: ["room-0", "room-2"] }] }));
  await expect(page.locator('.cx-cal-ev[data-cx-record="shared"]')).toHaveCount(2);
  expect((await api(page, "a => a.getCalendarEvents()"))).toMatchObject([{ record: "shared", resourceIds: ["room-0", "room-2"] }]);
  await page.evaluate(() => { window.links = []; document.getElementById("cal").addEventListener("canopyx:linkchange", event => window.links.push(event.detail)); });
  await page.locator('.cx-cal-slot[data-cx-resource="room-2"][data-cx-minutes="540"]').focus(); await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.links.at(-1).keys)).toContain("shared");
  await api(page, 'a => a.setCalendarView("month")'); await expect(page.locator('.cx-cal-ev[data-cx-record="shared"]')).toHaveCount(1);
  await api(page, 'a => a.setCalendarView("timeline")'); await expect(page.locator('.cx-cal-ev[data-cx-record="shared"]')).toHaveCount(2);
});

test("single-occurrence editor persists EXDATE and an override through the host writer", async ({ page }) => {
  await openBuilt(page, "editor-c1.html", calendarEditPage({ occurrence: "this", inline: true }));
  const event = page.locator('.cx-cal-ev[data-cx-record="event"]').nth(2);
  await event.click({ button: "right" }); await page.getByRole("menuitem", { name: "Edit this occurrence", exact: true }).click();
  const form = page.locator(".cx-cal-occurrence-editor");
  await expect(form).toBeVisible();
  await form.getByLabel("Title", { exact: true }).fill("Planning exception");
  await form.getByLabel("Starts", { exact: true }).fill("2026-10-16T11:00");
  await form.getByLabel("Ends", { exact: true }).fill("2026-10-16T12:00");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
  const batch = await page.evaluate(() => window.commits[0]);
  expect(batch.rows).toHaveLength(2);
  expect(batch.rows.find(row => row.op === "insert").values).toMatchObject({ title: "Planning exception", starts: "2026-10-16T11:00:00Z", series: "event", rid: "2026-10-16T09:00:00Z" });
  expect(batch.rows.find(row => row.id === "event").values.exceptions).toContain("2026-10-16T09:00:00Z");
  await page.evaluate(() => window.readSaved());
  const events = await api(page, "a => a.getCalendarEvents()");
  expect(events).toHaveLength(5);
  expect(events.filter(event => event.title === "Planning exception")).toHaveLength(1);
  expect(events.filter(event => event.title === "Planning")).toHaveLength(4);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("occurrence editor cancel leaves the series unchanged", async ({ page }) => {
  await openBuilt(page, "cancel-c1.html", calendarEditPage({ occurrence: "this", inline: true }));
  const id = (await api(page, "a => a.getCalendarEvents()"))[0].id;
  expect(await api(page, "(a,e,id) => a.editCalendarOccurrence(id)", id)).toBe(true);
  await page.locator(".cx-cal-occurrence-editor input[name=title]").fill("Discard this");
  await page.keyboard.press("Escape");
  expect(await api(page, "a => a.getChanges()")).toEqual([]);
  expect(await page.evaluate(() => window.commits)).toEqual([]);
});

test("occurrence editor uses minute fields and removes only the chosen date through the writer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openBuilt(page, "remove-c1.html", calendarEditPage({ occurrence: "this", inline: true }));
  const events = await api(page, "a => a.getCalendarEvents()");
  const chosen = events.find(event => event.start.startsWith("2026-10-16"));
  expect(await api(page, "(a,e,id) => a.editCalendarOccurrence(id)", chosen.id)).toBe(true);
  const form = page.getByRole("dialog", { name: "Edit this occurrence", exact: true });
  await expect(form).toContainText("Only Fri, Oct 16 changes");
  await expect(form.locator('input[name=start]')).toHaveAttribute("step", "60");
  expect(await form.locator('input[name=start]').inputValue()).toMatch(/T\d\d:\d\d$/);
  await expect(form).toHaveCSS("position", "fixed");
  const box = await form.boundingBox(); expect(box.y + box.height).toBeCloseTo(900, 0);
  await form.getByRole("button", { name: "Remove this occurrence", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
  const batch = await page.evaluate(() => window.commits[0]);
  expect(batch.rows).toHaveLength(1); expect(batch.rows[0].values.exceptions).toContain(chosen.start);
  await page.evaluate(() => window.readSaved());
  const after = await api(page, "a => a.getCalendarEvents()");
  expect(after.map(event => event.start)).toEqual(events.filter(event => event.id !== chosen.id).map(event => event.start));
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("occurrence removal respects read-only exceptions and writer refusals", async ({ page }) => {
  for (const options of [{ readonly: ["exceptions"] }, { rejectCommit: true }]) {
    await openBuilt(page, "remove-refused.html", calendarEditPage({ occurrence: "this", inline: true, ...options }));
    const events = await api(page, "a => a.getCalendarEvents()");
    await api(page, "(a,e,id) => a.editCalendarOccurrence(id)", events[0].id);
    const remove = page.getByRole("button", { name: "Remove this occurrence", exact: true });
    if (options.readonly) { await expect(remove).toBeDisabled(); await page.keyboard.press("Escape"); }
    else { await remove.click(); await expect(page.locator('.cx-cal-occurrence-error')).toContainText("Save refused"); }
    expect((await api(page, "a => a.getCalendarEvents()")).map(event => event.start)).toEqual(events.map(event => event.start));
  }
});

test("shared event markers highlight siblings and resource controls stay beside headers", async ({ page }) => {
  await openBuilt(page, "shared-markers.html", calendarC1Page({ count: 48, events: [
    { id: "shared", title: "Shared review", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", resourceIds: ["room-0", "room-1"] }
  ] }));
  const cards = page.locator('.cx-cal-ev[data-cx-record="shared"]'); await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAccessibleName(/Room 01, Room 02, 2 resources/);
  await expect(cards.first().locator('.cx-cal-shared')).toHaveText("2 resources");
  await cards.first().hover(); await expect(page.locator('.cx-cal-shared-active')).toHaveCount(2);
  await page.mouse.move(0, 0); await cards.last().focus(); await expect(page.locator('.cx-cal-shared-active')).toHaveCount(2);
  await page.locator('.cx-cal-rpick-select').focus(); await expect(page.locator('.cx-cal-shared-active')).toHaveCount(0);
  expect(await page.locator('.cx-cal-rpick').evaluate(bar => bar.getBoundingClientRect().bottom <= document.querySelector('.cx-cal-rheads').getBoundingClientRect().top)).toBe(true);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('.cx-cal-rpick-select')).toHaveAccessibleName("Resources 1–2 of 48");
  await expect(page.locator('.cx-cal-dayname')).toHaveText("Fri");
  await page.locator('.cx-cal-rpick-next').click();
  await expect(page.locator('.cx-cal-rpick-select')).toHaveAccessibleName("Resources 3–4 of 48");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("JSON feeds send range parameters, respect visibility and source colour, and cache previous ranges", async ({ page }) => {
  const requests = [];
  await page.route("http://canopyx.test/feed**", route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: [{ id: "feed-event", title: "Visitor review", start: "2026-10-16T12:00:00Z", end: "2026-10-16T13:00:00Z", resourceIds: ["room-0", "room-1"] }] });
  });
  await openBuilt(page, "feeds-c1.html", calendarC1Page({ count: 3, events: [], sources: [{ id: "visitors", label: "Visitors", url: "/feed", fetchParams: { team: "design & research" }, color: "#b45309", hidden: true }] }));
  expect(requests).toHaveLength(0);
  await api(page, 'a => a.setCalendarSource("visitors", true)');
  await expect(page.locator('.cx-cal-ev').filter({ hasText: "Visitor review" })).toHaveCount(2);
  expect(requests).toHaveLength(1); expect(requests[0].searchParams.get("team")).toBe("design & research");
  expect(requests[0].searchParams.get("start")).toBe("2026-10-16T00:00:00Z");
  expect(requests[0].searchParams.get("end")).toBe("2026-10-17T00:00:00Z");
  expect(requests[0].searchParams.get("timeZone")).toBe("utc");
  expect(await page.locator('.cx-cal-src[data-cx-source="visitors"]').evaluate(element => element.style.getPropertyValue("--cx-ev"))).toBe("#b45309");
  await api(page, 'a => a.setCalendarDate("2026-10-17")'); expect(requests).toHaveLength(2);
  await api(page, 'a => a.setCalendarDate("2026-10-16")'); expect(requests).toHaveLength(2);
  await api(page, 'a => a.setCalendarSource("visitors", false)');
  await expect(page.locator('.cx-cal-ev').filter({ hasText: "Visitor review" })).toHaveCount(0);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("JSON source failure preserves local events and later ranges replace obsolete feed requests", async ({ page }) => {
  const waiting = [];
  await page.route("http://canopyx.test/late**", async route => {
    const day = new URL(route.request().url()).searchParams.get("start").slice(0, 10);
    if (day === "2026-10-16") await new Promise(resolve => waiting.push(resolve));
    await route.fulfill({ json: [{ id: "late", title: day, start: day + "T12:00:00Z", end: day + "T13:00:00Z", resource: "room-0" }] }).catch(() => {});
  });
  await page.route("http://canopyx.test/broken**", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await openBuilt(page, "late-c1.html", calendarC1Page({ count: 2, sources: [
    { id: "late", label: "Late feed", url: "/late" }, { id: "broken", label: "Unavailable feed", url: "/broken" }
  ] }), null);
  await expect.poll(() => waiting.length).toBeGreaterThan(0);
  await api(page, 'a => a.setCalendarDate("2026-10-17")');
  for (const release of waiting) release();
  await expect(page.locator(".cx-cal-notice")).toContainText("Unavailable feed: HTTP 503");
  await expect.poll(async () => (await api(page, "a => a.getCalendarEvents()")).map(item => item.title)).toEqual(["2026-10-17"]);
  expect(await api(page, '(a,e) => a.editCalendarOccurrence("json:late:late")')).toBe(false);
  await api(page, 'a => a.setCalendarSource("late", false)');
  await api(page, 'a => a.setCalendarDate("2026-10-16")');
  await expect(page.locator('.cx-cal-ev[data-cx-record="event-0"]')).toHaveCount(1);
});

test("moving a shared assignment preserves its peers and conflicts are checked on every resource", async ({ page }) => {
  await openBuilt(page, "shared-edit-c1.html", calendarC1Page({ count: 3, editable: true, calendar: { editable: { overlap: false, commit: "manual" } }, events: [
    { id: "shared", title: "Shared review", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resourceIds: ["room-0", "room-2"] },
    { id: "busy", title: "Busy room", start: "2026-10-16T10:00:00Z", end: "2026-10-16T11:00:00Z", resource: "room-2" }
  ] }));
  let event = page.locator('.cx-cal-slot[data-cx-resource="room-0"] .cx-cal-ev[data-cx-record="shared"]');
  await event.focus(); await page.keyboard.press("F2"); await page.keyboard.press("Alt+ArrowDown"); await page.keyboard.press("Enter");
  await expect.poll(async () => (await api(page, "a => a.getCalendarEvents()")).find(item => item.record === "shared").resourceIds).toEqual(["room-1", "room-2"]);
  event = page.locator('.cx-cal-slot[data-cx-resource="room-1"] .cx-cal-ev[data-cx-record="shared"]');
  await event.focus(); await page.keyboard.press("F2"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.locator(".cx-cal > .cx-live")).toContainText("Busy room");
  expect((await api(page, "a => a.getCalendarEvents()")).find(item => item.record === "shared").start).toBe("2026-10-16T09:00:00Z");
});

for (const frame of [{ width: 1440, dark: false }, { width: 390, dark: true }]) test("C1 review frames " + frame.width, async ({ page }) => {
  await page.setViewportSize({ width: frame.width, height: 900 });
  await openBuilt(page, "frames-c1.html", calendarC1Page({ count: 48, editable: true, dark: frame.dark, events: [
    { id: "review", title: "Weekly design review", start: "2026-10-16T11:00:00Z", end: "2026-10-16T12:00:00Z", recurrence: "FREQ=WEEKLY;COUNT=5", resourceIds: ["room-0", "room-1"] },
    ...Array.from({ length: 48 }, (_, i) => ({ id: "planning-" + i, title: "Room " + (i + 1) + " planning", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resource: "room-" + i }))
  ], sources: [{ id: "planning", label: "Planning", color: "#2563eb" }, { id: "visitors", label: "Visitors", color: "#b45309", hidden: true }] }));
  await capture(page, "many-resources-" + frame.width + (frame.dark ? "-dark" : "-light"));
  const id = (await api(page, "a => a.getCalendarEvents()")).find(event => event.record === "review").id;
  expect(await api(page, "(a,e,id) => a.editCalendarOccurrence(id)", id)).toBe(true);
  await expect(page.locator(".cx-cal-occurrence-editor")).toBeVisible();
  await capture(page, "occurrence-editor-" + frame.width + (frame.dark ? "-dark" : "-light"));
});

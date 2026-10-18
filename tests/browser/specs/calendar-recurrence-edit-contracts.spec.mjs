import { test, expect } from "@playwright/test";
import { openBuilt, capture } from "./calendar-support.mjs";
import { calendarEditPage } from "./calendar-edit-contracts-support.mjs";
import { nextFrames } from "./support.mjs";

const state = page => page.evaluate(() => ({ records: window.records, commits: window.commits, changes: window.api.getChanges(), events: window.api.getCalendarEvents(), errors: window.errors }));
async function change(page, index, keys) {
  await nextFrames(page);
  const event = page.locator('.cx-cal-ev[data-cx-record="event"]').nth(index);
  await event.scrollIntoViewIfNeeded(); await event.focus(); await page.keyboard.press("F2");
  for (const key of keys) await page.keyboard.press(key);
  await page.keyboard.press("Enter");
}
async function roundtrip(page, info) {
  await page.evaluate(() => window.readSaved());
  await expect(page.locator("[data-cx-calendar-ready]")).toHaveCount(1); await nextFrames(page);
  const result = await state(page);
  expect(result.errors).toEqual([]);
  await info.attach("saved-recurrence", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  return result;
}

test.describe("recurrence edit contracts", () => {
  for (const item of [
    { name: "one occurrence moved onto its sibling", occurrence: "this", index: 0, keys: ["ArrowRight"] },
    { name: "one occurrence resized through its sibling", occurrence: "this", index: 0, keys: ["Shift+ArrowRight"] },
    { name: "following occurrences resized through their successors", occurrence: "following", index: 2, keys: ["Shift+ArrowRight"] },
    { name: "all occurrences resized through their siblings", occurrence: "all", index: 2, keys: ["Shift+ArrowRight"] },
    { name: "later following occurrences resized across an unequal gap", occurrence: "following", index: 0, keys: ["Shift+ArrowRight"], view: "month", rule: "FREQ=WEEKLY;BYDAY=MO,WE,SU;COUNT=5" }
  ]) test("overlap off refuses " + item.name + " before writing", async ({ page }, info) => {
    await openBuilt(page, "series-conflict.html", calendarEditPage({ ...item, overlap: false, inline: true }));
    await change(page, item.index, item.keys);
    await expect(page.locator(".cx-cal-notice")).toContainText("Planning");
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    await capture(page, "recurrence-refusal-" + item.occurrence + "-" + info.project.name);
    const saved = await roundtrip(page, info);
    expect(saved.records).toHaveLength(1);
    expect(saved.records[0].cells.starts).toBe("2026-10-14T09:00:00Z");
    expect(saved.records[0].cells.ends).toBe("2026-10-14T10:00:00Z");
  });

  for (const mode of ["this", "following", "all"]) test("overlap off keeps a nonconflicting " + mode + " move chosen by the host", async ({ page }, info) => {
    await openBuilt(page, "series-choice.html", calendarEditPage({ occurrence: "ask", mode, overlap: false, inline: true }));
    await change(page, 2, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(mode === "following" ? 2 : 1);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(5);
    expect(saved.events.filter(event => event.start.endsWith("09:30:00Z"))).toHaveLength(mode === "this" ? 1 : mode === "following" ? 3 : 5);
    expect(saved.changes).toEqual([]);
  });

  for (const rule of ["FREQ=DAILY;COUNT=5", "FREQ=DAILY;COUNT=1"]) test("following from the first " + rule + " occurrence updates one series without adding a phantom", async ({ page }, info) => {
    await openBuilt(page, "first-count.html", calendarEditPage({ occurrence: "following", inline: true, rule }));
    await change(page, 0, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.records).toHaveLength(1);
    expect(saved.commits.flatMap(batch => batch.rows).every(row => row.op !== "insert")).toBe(true);
    expect(saved.records[0].cells.rule).toBe(rule);
    expect(saved.events).toHaveLength(rule.endsWith("=1") ? 1 : 5);
    expect(saved.events.every(event => event.start.endsWith("09:30:00Z"))).toBe(true);
  });

  for (const item of [
    { name: "UTC", rule: "FREQ=DAILY;UNTIL=20261018T090000Z", expected: "FREQ=DAILY;UNTIL=20261018T093000Z" },
    { name: "floating", rule: "FREQ=DAILY;UNTIL=20261018T090000", expected: "FREQ=DAILY;UNTIL=20261018T093000" },
    { name: "date-only", rule: "FREQ=DAILY;UNTIL=20261018", expected: "FREQ=DAILY;UNTIL=20261018" }
  ]) for (const index of [0, 2]) test("following from " + (index ? "a later" : "the first") + " occurrence preserves the " + item.name + " UNTIL series end", async ({ page }, info) => {
    await openBuilt(page, "until.html", calendarEditPage({ occurrence: "following", inline: true, rule: item.rule }));
    await change(page, index, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(index ? 2 : 1);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(5);
    expect(saved.events.at(-1).start).toBe("2026-10-18T09:30:00Z");
    expect(saved.records.at(-1).cells.rule).toBe(item.expected);
    expect(saved.changes).toEqual([]);
  });

  test("a whole-series move preserves seconds and fractions while shifting its timed cutoff", async ({ page }, info) => {
    await openBuilt(page, "fractional-until.html", calendarEditPage({ occurrence: "all", inline: true,
      starts: "2026-10-14T09:00:45.125Z", ends: "2026-10-14T10:00:45.125Z", rule: "FREQ=DAILY;UNTIL=20261018T090046Z" }));
    await change(page, 0, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(5);
    expect(saved.records[0].cells).toMatchObject({ starts: "2026-10-14T09:30:45.125Z", ends: "2026-10-14T10:30:45.125Z", rule: "FREQ=DAILY;UNTIL=20261018T093046Z" });
  });

  test("a whole-series move keeps its final occurrence when the UTC cutoff lies in the later DST fold", async ({ page }, info) => {
    await openBuilt(page, "fold-until.html", calendarEditPage({ occurrence: "all", inline: true, timeZone: "Europe/Warsaw", date: "2026-10-24",
      starts: "2026-10-24T00:45:00Z", ends: "2026-10-24T01:15:00Z", rule: "FREQ=DAILY;UNTIL=20261025T013000Z" }));
    await change(page, 0, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.events.map(event => event.start)).toEqual(["2026-10-24T01:15:00Z", "2026-10-25T02:15:00Z"]);
  });

  test("a zero-minute resize preserves the exact later-fold start and its fractions", async ({ page }, info) => {
    await openBuilt(page, "fold-resize.html", calendarEditPage({ occurrence: "all", inline: true, timeZone: "Europe/Warsaw", date: "2026-10-25",
      starts: "2026-10-25T01:30:45.125Z", ends: "2026-10-25T02:30:45.125Z", rule: "FREQ=DAILY;COUNT=1" }));
    await change(page, 0, ["Shift+ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(1);
    expect(saved.records[0].cells).toMatchObject({ starts: "2026-10-25T01:30:45.125Z", ends: "2026-10-25T03:00:45.125Z" });
  });

  test("a pre-epoch move preserves seconds and fractions in the start and floating cutoff", async ({ page }, info) => {
    await openBuilt(page, "pre-epoch-until.html", calendarEditPage({ occurrence: "all", inline: true, date: "1969-12-30",
      starts: "1969-12-30T09:00:45.125Z", ends: "1969-12-30T10:00:45.125Z", rule: "FREQ=DAILY;UNTIL=19691231T090046" }));
    await change(page, 0, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(2);
    expect(saved.events.map(event => event.start)).toEqual(["1969-12-30T09:30:45.125Z", "1969-12-31T09:30:45.125Z"]);
    expect(saved.records[0].cells).toMatchObject({ starts: "1969-12-30T09:30:45.125Z", ends: "1969-12-30T10:30:45.125Z", rule: "FREQ=DAILY;UNTIL=19691231T093046" });
  });

  test("a timed cutoff move respects the recurrence cell UI policy before any write", async ({ page }, info) => {
    await openBuilt(page, "until-policy.html", calendarEditPage({ occurrence: "all", inline: true, denied: ["rule"], rule: "FREQ=DAILY;UNTIL=20261018T090000Z" }));
    await change(page, 0, ["ArrowDown"]);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(5);
    expect(saved.records[0].cells.starts).toBe("2026-10-14T09:00:00Z");
  });

  test("the occurrence hook may cancel a conflicting proposal without a write", async ({ page }, info) => {
    await openBuilt(page, "cancel-series-conflict.html", calendarEditPage({ occurrence: "this", inline: true, overlap: false, takeOccurrence: true }));
    await change(page, 0, ["ArrowRight"]); await nextFrames(page);
    expect(await page.evaluate(() => window.occurrenceCalls)).toBe(1);
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    expect((await roundtrip(page, info)).events).toHaveLength(5);
  });

  for (const occurrence of ["all", "following"]) test("a " + occurrence + " move refuses a changed loaded successor in unavailable time even with overlap allowed", async ({ page }, info) => {
    await openBuilt(page, "successor-unavailable.html", calendarEditPage({ occurrence, inline: true, overlap: true,
      ranges: [{ start: "2026-10-18T10:00:00Z", end: "2026-10-18T11:00:00Z", resource: "Room A", kind: "unavailable", label: "Maintenance" }] }));
    await change(page, occurrence === "all" ? 0 : 2, ["ArrowDown"]);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    expect((await state(page)).commits).toEqual([]);
    expect((await state(page)).changes).toEqual([]);
    const saved = await roundtrip(page, info);
    expect(saved.records).toHaveLength(1);
    expect(saved.records[0].cells.rule).toBe("FREQ=DAILY;COUNT=5");
    expect(saved.events.at(-1).end).toBe("2026-10-18T10:00:00Z");
  });

  for (const conflicting of [false, true]) test("a whole-series move " + (conflicting ? "refuses a loaded future conflict" : "ignores unrelated pre-existing overlaps"), async ({ page }, info) => {
    const extraRows = conflicting ? [{ id: "other", cells: { title: "Other", starts: "2026-10-18T09:30:00Z", ends: "2026-10-18T10:30:00Z", resource: "Room A" } }] :
      ["a", "b"].map(id => ({ id, cells: { title: id, starts: "2026-10-14T12:00:00Z", ends: "2026-10-14T13:00:00Z", resource: "Room A" } }));
    await openBuilt(page, "other-overlap.html", calendarEditPage({ occurrence: "all", inline: true, overlap: false, extraRows }));
    await change(page, 0, ["ArrowDown"]);
    if (conflicting) await expect(page.locator(".cx-cal-notice")).toContainText("Other");
    else await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.commits).toHaveLength(conflicting ? 0 : 1);
    expect(saved.records[0].cells.starts).toBe(conflicting ? "2026-10-14T09:00:00Z" : "2026-10-14T09:30:00Z");
  });
});

const gapSeries = { inline: true, starts: "2026-03-27T01:30:00Z", ends: "2026-03-27T01:45:00Z", rule: "FREQ=DAILY;COUNT=3",
  date: "2026-03-27", timeZone: "Europe/Warsaw", scrollTime: "02:00" };
async function pushMaster(page, cells) {
  await page.evaluate(async cells => {
    Object.assign(window.records[0].cells, cells);
    await window.api.updateRows([{ id: "event", cells }]);
    await window.api.reload();
  }, cells);
  await nextFrames(page);
}

test.describe("saved recurrence decisions", () => {
  for (const occurrence of ["all", "following"]) for (const policy of ["unavailable", "overlap"]) test(occurrence + " checks the actual saved gap-day occurrence against " + policy, async ({ page }, info) => {
    const span = { starts: "2026-03-29T01:00:00Z", ends: "2026-03-29T01:15:00Z", resource: "Room A" };
    await openBuilt(page, "gap-policy.html", calendarEditPage({ ...gapSeries, occurrence, overlap: policy !== "overlap",
      ...(policy === "overlap" ? { extraRows: [{ id: "other", cells: { ...span, title: "Other" } }] } :
        { ranges: [{ start: span.starts, end: span.ends, resource: span.resource, kind: "unavailable", label: "Maintenance" }] }) }));
    await change(page, occurrence === "all" ? 0 : 1, ["ArrowDown"]);
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    if (policy === "overlap") await expect(page.locator(".cx-cal-notice")).toContainText("Other");
    const saved = await roundtrip(page, info);
    expect(saved.commits).toEqual([]); expect(saved.changes).toEqual([]);
    expect(saved.records[0].cells.starts).toBe(gapSeries.starts);
    expect(saved.events.filter(event => event.id.startsWith("event@"))).toHaveLength(3);
    await capture(page, "saved-gap-" + occurrence + "-" + policy + "-" + info.project.name);
  });

  for (const occurrence of ["all", "following"]) test(occurrence + " preserves a timed EXDATE's saved occurrence identity across the DST gap", async ({ page }, info) => {
    await openBuilt(page, "gap-exdate.html", calendarEditPage({ ...gapSeries, occurrence, exceptions: "2026-03-29T01:30:00Z" }));
    expect((await state(page)).events).toHaveLength(2);
    await change(page, occurrence === "all" ? 0 : 1, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(occurrence === "all" ? 1 : 2);
    const saved = await roundtrip(page, info);
    expect(saved.events).toHaveLength(2);
    expect(saved.records.at(-1).cells.exceptions).toBe("2026-03-29T01:00:00Z");
    expect(saved.events.some(event => event.start.startsWith("2026-03-29"))).toBe(false);
  });

  for (const occurrence of ["all", "following"]) test(occurrence + " saves the selected gap-day proposal exactly or refuses it faithfully", async ({ page }, info) => {
    await openBuilt(page, "selected-gap.html", calendarEditPage({ ...gapSeries, occurrence }));
    await change(page, 2, ["ArrowDown"]);
    if (occurrence === "all") await expect(page.locator(".cx-cal-notice")).toBeVisible();
    else await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(2);
    const saved = await roundtrip(page, info);
    expect(saved.commits).toHaveLength(occurrence === "all" ? 0 : 2);
    expect(saved.events.at(-1).start).toBe(occurrence === "all" ? "2026-03-29T01:30:00Z" : "2026-03-29T02:00:00Z");
    expect(saved.events).toHaveLength(3);
  });

  test("the host can cancel the all preset before a series-only day constraint", async ({ page }, info) => {
    await openBuilt(page, "preset-all-cancel.html", calendarEditPage({ occurrence: "all", inline: true, takeOccurrence: true }));
    await change(page, 0, ["ArrowRight"]); await nextFrames(page);
    expect(await page.evaluate(() => window.occurrenceCalls)).toBe(1);
    expect((await roundtrip(page, info)).commits).toEqual([]);
  });

  for (const mode of ["this", "following"]) test("the host overrides the all preset with " + mode + " before final mode checks", async ({ page }, info) => {
    await openBuilt(page, "preset-all-override.html", calendarEditPage({ occurrence: "all", mode, inline: true }));
    await change(page, mode === "this" ? 0 : 2, [mode === "this" ? "ArrowRight" : "ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(mode === "this" ? 1 : 2);
    const saved = await roundtrip(page, info);
    expect(await page.evaluate(() => window.occurrenceCalls)).toBe(1);
    expect(saved.records).toHaveLength(2); expect(saved.events).toHaveLength(5);
    if (mode === "this") expect(saved.records[1].cells).toMatchObject({ series: "event", rid: "2026-10-14T09:00:00Z", starts: "2026-10-15T09:00:00Z" });
    else expect(saved.records.map(row => row.cells.rule)).toEqual(["FREQ=DAILY;COUNT=2", "FREQ=DAILY;COUNT=3"]);
  });

  for (const mode of ["this", "following", "all"]) test("a pending host " + mode + " decision cannot overwrite a live master change", async ({ page }, info) => {
    await openBuilt(page, "stale-hook.html", calendarEditPage({ occurrence: "ask", mode, holdOccurrence: true }));
    await change(page, 2, ["ArrowDown"]);
    await page.waitForFunction(() => typeof window.releaseOccurrence === "function");
    await pushMaster(page, { starts: "2026-10-14T12:00:00Z", ends: "2026-10-14T13:00:00Z" });
    await page.evaluate(() => window.releaseOccurrence());
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    const saved = await roundtrip(page, info);
    expect(saved.commits).toEqual([]); expect(saved.changes).toEqual([]); expect(saved.records).toHaveLength(1);
    expect(saved.events).toHaveLength(5); expect(saved.events.every(event => event.start.endsWith("12:00:00Z"))).toBe(true);
  });

  test("a pending occurrence dialog cannot overwrite a live master change", async ({ page }, info) => {
    await openBuilt(page, "stale-dialog.html", calendarEditPage({ occurrence: "ask" }));
    await change(page, 2, ["ArrowDown"]);
    await expect(page.locator(".cx-cal-ask")).toBeVisible();
    await pushMaster(page, { starts: "2026-10-14T12:00:00Z", ends: "2026-10-14T13:00:00Z" });
    await page.locator(".cx-cal-ask-all").click();
    await expect(page.locator(".cx-cal-notice")).toBeVisible();
    const saved = await roundtrip(page, info);
    expect(saved.commits).toEqual([]); expect(saved.changes).toEqual([]);
    expect(saved.events.every(event => event.start.endsWith("12:00:00Z"))).toBe(true);
  });

  test("an unrelated live cell update keeps the pending choice and its current copied values", async ({ page }, info) => {
    await openBuilt(page, "current-copy.html", calendarEditPage({ occurrence: "ask", mode: "this", holdOccurrence: true }));
    await change(page, 2, ["ArrowDown"]);
    await page.waitForFunction(() => typeof window.releaseOccurrence === "function");
    await pushMaster(page, { title: "Updated planning", business: "Current business value" });
    await page.evaluate(() => window.releaseOccurrence());
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.records[1].cells).toMatchObject({ title: "Updated planning", business: "Current business value", starts: "2026-10-16T09:30:00Z" });
    expect(saved.events).toHaveLength(5); expect(saved.changes).toEqual([]);
  });

  for (const item of [
    { name: "empty EXDATE", column: "exceptions", raw: "", count: 5 },
    { name: "date-only EXDATE separators", column: "exceptions", raw: "2026-10-15; 2026-10-17", count: 3 },
    { name: "resource whitespace", column: "resource", raw: " Room A ", count: 5 }
  ]) test("an all-mode time move preserves untouched readonly " + item.name + " without incidental writes", async ({ page }, info) => {
    await openBuilt(page, "raw-series-cell.html", calendarEditPage({ occurrence: "all", inline: true, readonly: [item.column], cells: { [item.column]: item.raw } }));
    await change(page, 0, ["ArrowDown"]);
    await expect.poll(() => page.evaluate(() => window.commits.length)).toBe(1);
    const saved = await roundtrip(page, info);
    expect(saved.records[0].cells[item.column]).toBe(item.raw);
    expect(saved.events).toHaveLength(item.count);
    expect(saved.events.every(event => event.start.endsWith("09:30:00Z") && event.resource === "Room A")).toBe(true);
    expect(saved.commits[0].rows[0].values).toEqual({ starts: "2026-10-14T09:30:00Z", ends: "2026-10-14T10:30:00Z" });
    if (item.column === "resource") expect(Object.hasOwn(saved.records[0].cells, "exceptions")).toBe(false);
    expect(saved.changes).toEqual([]);
  });
});

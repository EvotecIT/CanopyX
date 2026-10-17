// Local wall times must survive component round trips before they become stored UTC instants.
import { expect, test } from "@playwright/test";
import { ready, servePage } from "./enhance-support.mjs";

const zones = [
  { id: "America/New_York", day: "2026-03-08", previous: "2026-03-07T07:30:00Z", early: "2026-03-08T06:30:00Z", gap: "02:30", valid: "03:30", iso: "2026-03-08T07:30:00Z" },
  { id: "Europe/Warsaw", day: "2026-03-29", previous: "2026-03-28T01:30:00Z", early: "2026-03-29T00:30:00Z", gap: "02:30", valid: "03:30", iso: "2026-03-29T01:30:00Z" },
  { id: "Australia/Lord_Howe", day: "2026-10-04", previous: "2026-10-02T15:45:00Z", early: "2026-10-03T15:00:00Z", gap: "02:15", valid: "02:45", iso: "2026-10-03T15:45:00Z" }
];

async function open(page, editor, value, local = true) {
  await servePage(page, "<div id='local' style='height:420px'></div>");
  await page.evaluate(async ({ editor, value, local }) => {
    window.grid = CanopyX.createDataGrid(document.querySelector("#local"), { view: { protocol: "canopyx/2", type: "grid", id: "local", label: "Local dates",
      selection: "none", search: false, pageSize: 10, source: { kind: "inline" }, timeZone: local ? "local" : "utc", rangeSelection: true,
      columns: [{ id: "name", title: "Name", kind: "text" }, { id: "date", title: "Date", kind: "datetime", editable: true, editor }],
      rows: [{ id: "a", cells: { name: "Appointment", date: value } }] } }); await grid.ready;
  }, { editor, value, local });
  await ready(page);
}

for (const zone of zones) test.describe(zone.id, () => {
  test.use({ timezoneId: zone.id });
  for (const editor of ["date", "time", "datetime"]) {
    test("nonexistent local time is refused by the " + editor + " editor without clearing an optional cell", async ({ page }) => {
      await open(page, editor, editor === "date" ? zone.previous : zone.early);
      await page.evaluate(() => grid.beginEdit("a", "date"));
      const input = page.locator(".cx-editor");
      await input.fill(editor === "date" ? zone.day : editor === "time" ? zone.gap : zone.day + "T" + zone.gap);
      expect(await page.evaluate(() => grid.endEdit())).toBe(false);
      await expect(input).toBeVisible();
      expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
      expect(await page.evaluate(() => grid.view.rows[0].cells.date)).toBe(editor === "date" ? zone.previous : zone.early);
      if (editor === "date") { await page.evaluate(() => grid.cancelEdit()); return; }
      await input.fill(editor === "time" ? zone.valid : zone.day + "T" + zone.valid);
      expect(await page.evaluate(() => grid.endEdit())).toBe(true);
      expect(await page.evaluate(() => grid.getChanges()[0].values.date)).toBe(zone.iso);
    });
  }
  test("pasted local times refuse the DST gap and retain valid explicit instants", async ({ page }) => {
    await open(page, "datetime", zone.early);
    const result = await page.evaluate(text => grid.pasteCells(text, { row: 0, column: "date" }), zone.day + " " + zone.gap);
    expect(result.applied).toBe(0); expect(result.refused).toHaveLength(1);
    expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
    expect((await page.evaluate(text => grid.pasteCells(text, { row: 0, column: "date" }), zone.iso)).applied).toBe(1);
    expect(await page.evaluate(() => grid.getChanges()[0].values.date)).toBe(zone.iso.replace("Z", ".000Z"));
  });
});

test("UTC editors and paste preserve early years and reject rolled calendar or clock components", async ({ page }) => {
  await open(page, "datetime", "2026-03-08T01:30:00Z", false);
  await page.evaluate(() => grid.beginEdit("a", "date"));
  await page.locator(".cx-editor").fill("0001-03-08T02:30");
  expect(await page.evaluate(() => grid.endEdit())).toBe(true);
  expect(await page.evaluate(() => grid.getChanges()[0].values.date)).toBe("0001-03-08T02:30:00Z");
  await page.evaluate(() => grid.revertChanges());
  for (const text of ["2026-02-30 02:30", "2026-03-08 24:30", "2026-03-08 02:60", "2026-03-08 02:30:60"])
    expect((await page.evaluate(text => grid.pasteCells(text, { row: 0, column: "date" }), text)).applied).toBe(0);
  expect((await page.evaluate(() => grid.pasteCells("0001-03-08 02:30", { row: 0, column: "date" }))).applied).toBe(1);
  expect(await page.evaluate(() => grid.getChanges()[0].values.date)).toBe("0001-03-08T02:30:00.000Z");
  await page.evaluate(async () => { grid.revertChanges(); await grid.beginEdit("a", "date"); });
  await page.locator(".cx-editor").fill("");
  expect(await page.evaluate(() => grid.endEdit())).toBe(true);
  expect(await page.evaluate(() => grid.getChanges()[0].values.date)).toBeNull();
});

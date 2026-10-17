// Typed editors retain components the reader did not change and honour decimal steps written with an exponent.
import { expect, test } from "@playwright/test";
import { serveGrid } from "./editing-support.mjs";

async function open(page, { kind = "datetime", editor = "date", value = "2026-03-28T12:34:56.789Z", timeZone = "utc", lang = "en" } = {}) {
  await serveGrid(page, { lang, view: { protocol: "canopyx/2", type: "grid", id: "precision", label: "Editor precision",
    source: { kind: "inline" }, selection: "none", search: false, pageSize: 10, timeZone,
    editing: { drawer: "never" }, columns: [{ id: "value", title: "Value", kind, editable: true, editor }],
    rows: [{ id: "a", cells: { value } }] } });
  await page.evaluate(async () => { window.grid = document.querySelector("[data-canopyx-host]").canopyx; await grid.beginEdit("a", "value"); });
  return page.locator("input.cx-editor");
}

test.beforeEach(async ({ page }) => {
  page.editorErrors = [];
  page.on("pageerror", error => page.editorErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.editorErrors).toEqual([]);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

for (const zone of ["utc", "local"]) test.describe(zone + " clock components", () => {
  test.use({ timezoneId: "Europe/Warsaw" });
  test("date-only edits retain seconds and milliseconds while observing a local DST transition", async ({ page }) => {
    const input = await open(page, { timeZone: zone });
    await expect(input).toHaveValue("2026-03-28");
    expect(await page.evaluate(() => grid.endEdit())).toBe(true);
    expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
    await page.evaluate(() => grid.beginEdit("a", "value"));
    await input.fill("2026-03-29");
    expect(await page.evaluate(() => grid.endEdit())).toBe(true);
    expect(await page.evaluate(() => grid.getChanges()[0].values.value)).toBe(
      zone === "utc" ? "2026-03-29T12:34:56.789Z" : "2026-03-29T11:34:56.789Z");
    await page.evaluate(() => { grid.undo(); });
    expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
    await page.evaluate(() => grid.beginEdit("a", "value"));
    await input.fill("");
    expect(await page.evaluate(() => grid.endEdit())).toBe(true);
    expect(await page.evaluate(() => grid.getChanges()[0].values.value)).toBeNull();
  });

  test("time and datetime inputs retain their displayed sub-minute components", async ({ page }, testInfo) => {
    for (const editor of ["time", "datetime"]) {
      const input = await open(page, { editor, timeZone: zone });
      const time = zone === "utc" ? "12:34:56.789" : "13:34:56.789";
      await expect.soft(input).toHaveValue(editor === "time" ? time : "2026-03-28T" + time);
      await testInfo.attach(editor + "-" + zone, { body: await input.screenshot(), contentType: "image/png" });
      expect(await page.evaluate(() => grid.endEdit())).toBe(true);
      expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
      await page.evaluate(() => grid.beginEdit("a", "value"));
      await input.fill(editor === "time" ? "14:25:17.125" : "2026-03-29T14:25:17.125");
      expect(await page.evaluate(() => grid.endEdit())).toBe(true);
      const day = editor === "time" ? "2026-03-28" : "2026-03-29";
      const hour = zone === "utc" ? "14" : editor === "time" ? "13" : "12";
      expect.soft(await page.evaluate(() => grid.getChanges()[0].values.value)).toBe(day + "T" + hour + ":25:17.125Z");
    }
  });
});

for (const step of [1e-7, 1.5e-7, 1e-21, 1e-101]) test("number arrows retain the positive and negative exponent step " + step, async ({ page }) => {
  const input = await open(page, { kind: "number", editor: { type: "number", step }, value: 0 });
  await input.press("ArrowUp");
  expect.soft(Number(await input.inputValue())).toBe(step);
  await input.press("ArrowDown");
  expect.soft(Number(await input.inputValue())).toBe(0);
  await input.press("ArrowDown");
  expect.soft(Number(await input.inputValue())).toBe(-step);
  expect(await page.evaluate(() => grid.endEdit())).toBe(true);
  expect.soft(await page.evaluate(() => grid.getChanges()[0]?.values.value)).toBe(-step);
});

test("ordinary decimal and positive-exponent steps retain locale, bounds and undo", async ({ page }) => {
  for (const [step, start, min, max, lang, first, second] of [
    [0.01, 0.29, -0.01, 0.31, "pl", "0,3", "0,31"], [1e3, 0, -1000, 2000, "en", "1000", "2000"]
  ]) {
    const input = await open(page, { kind: "number", editor: { type: "number", step, min, max }, value: start, lang });
    await input.press("ArrowUp"); await expect(input).toHaveValue(first);
    await input.press("ArrowUp"); await expect(input).toHaveValue(second);
    await input.press("ArrowUp"); await expect(input).toHaveValue(second);
    expect(await page.evaluate(() => grid.endEdit())).toBe(true);
    expect(await page.evaluate(() => grid.getChanges()[0].values.value)).toBe(max);
    await page.evaluate(() => grid.undo());
    expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
    await page.evaluate(() => grid.beginEdit("a", "value"));
    await input.fill(lang === "pl" ? "-0,01" : "-1000");
    await input.press("ArrowDown");
    expect(await page.evaluate(() => grid.endEdit())).toBe(true);
    expect(await page.evaluate(() => grid.getChanges()[0].values.value)).toBe(min);
  }
});

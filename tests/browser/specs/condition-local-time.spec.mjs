// Native condition inputs describe wall time; a missing local time must not silently move the condition.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { formattingPage, healthView } from "./formatting-support.mjs";
import { nextFrames, openGridControl } from "./support.mjs";

test.use({ timezoneId: "America/New_York" });

const initial = ["2026-03-08T06:30:00.125Z", "2026-03-08T08:30:00.875Z"];
const rules = page => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getFormatRules());
const query = page => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery());

async function open(page, { local = true, reporting = false, filters = [] } = {}) {
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const view = healthView(4, { timeZone: local ? "local" : "utc", query: { filters }, ...(reporting ? { reporting: {} } : {}),
    formatRules: [{ id: "window", label: "Check-in window", column: "checked", when: { operator: "and", filters: [
      { column: "checked", operator: "between", values: initial }] }, style: { tone: "warning" } }] });
  await page.route("http://canopyx.test/condition-time", route => route.fulfill({ contentType: "text/html", body: formattingPage(view) }));
  await page.goto("http://canopyx.test/condition-time");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await nextFrames(page);
}

async function formatForm(page) {
  await page.locator(".cx-grid-overflow > summary").click();
  await page.getByRole("button", { name: "Conditional formatting", exact: true }).click();
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Edit Check-in window", exact: true }).click();
  return editor;
}

async function capture(page, name) {
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") });
}

test("format rule Save rejects a missing local time at either range endpoint", async ({ page }) => {
  await open(page); const before = await rules(page), editor = await formatForm(page);
  const inputs = editor.locator('input[type="datetime-local"]');
  await inputs.nth(0).fill("2026-03-08T02:30:00.125");
  await editor.getByRole("button", { name: "Save rule", exact: true }).click();
  await capture(page, "format-gap-lower");
  expect(await rules(page)).toEqual(before);
  await expect(editor.getByRole("status")).toContainText("Complete the rule before saving.");
  await inputs.nth(0).fill("2026-03-08T01:30:00.125");
  await inputs.nth(1).fill("2026-03-08T02:30:00.875");
  await editor.getByRole("button", { name: "Save rule", exact: true }).click();
  expect(await rules(page)).toEqual(before);
  await expect(editor.locator("h4")).toHaveText("Edit Check-in window");
  expect(page.errors).toEqual([]);
});

for (const [local, lower, upper, expected] of [
  [true, "2026-03-08T01:30:00.125", "2026-03-08T03:30:00.875", ["2026-03-08T06:30:00.125Z", "2026-03-08T07:30:00.875Z"]],
  [false, "0001-03-08T02:30:00.125", "0099-03-08T02:30:00.875", ["0001-03-08T02:30:00.125Z", "0099-03-08T02:30:00.875Z"]],
  [false, "2026-03-08T02:30:00.125", "2026-03-08T03:30:00.875", ["2026-03-08T02:30:00.125Z", "2026-03-08T03:30:00.875Z"]]
]) test("format rule Save retains " + (local ? "adjacent local times and milliseconds" : lower.startsWith("0001") ? "early UTC years and milliseconds" : "UTC times during the local DST gap"), async ({ page }) => {
  await open(page, { local }); const editor = await formatForm(page), inputs = editor.locator('input[type="datetime-local"]');
  await inputs.nth(0).fill(lower); await inputs.nth(1).fill(upper);
  await editor.getByRole("button", { name: "Save rule", exact: true }).click();
  expect((await rules(page))[0].when.filters[0].values).toEqual(expected);
  await expect(editor.locator("h4")).toHaveText("Conditional formatting");
  expect(page.errors).toEqual([]);
});

test("editing one format range endpoint retains milliseconds at the untouched endpoint", async ({ page }) => {
  await open(page); const editor = await formatForm(page);
  await editor.locator('input[type="datetime-local"]').nth(0).fill("2026-03-08T03:30:00.125");
  await editor.getByRole("button", { name: "Save rule", exact: true }).click();
  expect((await rules(page))[0].when.filters[0].values).toEqual(["2026-03-08T07:30:00.125Z", initial[1]]);
  expect(page.errors).toEqual([]);
});

test("grid condition builder refuses a missing local time and accepts its valid neighbor", async ({ page }) => {
  await open(page); const before = await query(page); await openGridControl(page, "filters");
  const form = page.locator(".cx-grid-filter-form");
  await form.getByRole("button", { name: "+ Condition", exact: true }).first().click();
  const row = form.locator(".cx-cond").first();
  await row.getByRole("combobox", { name: "Column", exact: true }).selectOption("checked");
  await row.locator('input[type="datetime-local"]').fill("2026-03-08T02:30:00.125");
  await expect(form.getByRole("status")).toHaveText("Enter a valid filter value.");
  expect(await query(page)).toEqual(before);
  await row.locator('input[type="datetime-local"]').fill("2026-03-08T03:30:00.125");
  await expect.poll(async () => (await query(page)).filters?.[0]?.values).toEqual(["2026-03-08T07:30:00.125Z"]);
  expect(page.errors).toEqual([]);
});

test("column condition input refuses a missing local time and accepts its valid neighbor", async ({ page }) => {
  await open(page); const before = await query(page);
  await page.getByRole("button", { name: "Menu for Last check-in", exact: true }).click();
  await page.getByRole("menuitem", { name: "Filter…", exact: true }).click();
  const panel = page.locator(".cx-column-filter"), input = panel.locator('input[type="datetime-local"]').first();
  await input.fill("2026-03-08T02:30:00.125");
  await expect(panel.getByRole("status")).toHaveText("Enter a valid filter value.");
  expect(await query(page)).toEqual(before);
  await input.fill("2026-03-08T03:30:00.125");
  await expect.poll(async () => (await query(page)).filters?.[0]?.values).toEqual(["2026-03-08T07:30:00.125Z"]);
  expect(page.errors).toEqual([]);
});

test("reporting range builder refuses missing local times at both endpoints", async ({ page }) => {
  const filters = [{ column: "checked", operator: "ge", values: [initial[0]] }, { column: "checked", operator: "le", values: [initial[1]] }];
  await open(page, { reporting: true, filters }); const before = await query(page); await openGridControl(page, "filters");
  const form = page.locator(".cx-grid-filter-form"), inputs = form.locator('input[type="datetime-local"]');
  await inputs.nth(0).fill("2026-03-08T02:30:00.125");
  await expect(form.getByRole("status")).toHaveText("Enter a valid filter value.");
  expect(await query(page)).toEqual(before);
  await inputs.nth(0).fill("2026-03-08T01:30:00.125");
  await inputs.nth(1).fill("2026-03-08T02:30:00.875");
  await expect(form.getByRole("status")).toHaveText("Enter a valid filter value.");
  expect(await query(page)).toEqual(before);
  await inputs.nth(1).fill("2026-03-08T03:30:00.875");
  await expect.poll(async () => (await query(page)).filters?.map(filter => filter.values[0])).toEqual(["2026-03-08T06:30:00.125Z", "2026-03-08T07:30:00.875Z"]);
  expect(page.errors).toEqual([]);
});

test("typed date membership refuses calendar rollover and retains explicit instants", async ({ page }) => {
  await open(page); await openGridControl(page, "filters"); const form = page.locator(".cx-grid-filter-form");
  await form.getByRole("button", { name: "+ Condition", exact: true }).first().click();
  const row = form.locator(".cx-cond").first();
  await row.getByRole("combobox", { name: "Column", exact: true }).selectOption("checked");
  await row.getByRole("combobox", { name: "Condition", exact: true }).selectOption("in");
  await row.locator(".cx-ms > summary").click(); const search = row.getByRole("searchbox");
  await search.fill("2026-02-30T03:30"); await search.press("Enter");
  await expect(search).toHaveValue("2026-02-30T03:30");
  await search.fill("2026-03-08T02:30:00.125-05:00"); await search.press("Enter");
  await expect.poll(async () => (await query(page)).filters?.[0]?.values).toEqual(["2026-03-08T02:30:00.125-05:00"]);
  expect(page.errors).toEqual([]);
});

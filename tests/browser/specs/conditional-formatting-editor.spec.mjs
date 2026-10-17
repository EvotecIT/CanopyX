// The rule editor (canopyx-format-editor.js): a dialog that lists a grid's rules and edits one on the filter builder's
// condition rows, from the more menu, with the keyboard, on phones and translated.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { nextFrames, repo } from "./support.mjs";
import { formattingPage, healthView } from "./formatting-support.mjs";

async function open(page, view = healthView(), options = {}) {
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.route("http://canopyx.test/editor", route => route.fulfill({ contentType: "text/html", body: formattingPage(view, options) }));
  await page.goto("http://canopyx.test/editor");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await nextFrames(page);
}
const dialog = page => page.getByRole("dialog", { name: /formatting|Edit|Add rule|Formatowanie/ });
const rules = page => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getFormatRules());

async function openFromMenu(page) {
  await page.locator(".cx-grid-overflow > summary").click();
  await page.getByRole("button", { name: "Conditional formatting" }).click();
  await expect(page.locator(".cx-format-editor")).toBeVisible();
}

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`the editor lists the rules and edits one on the filter builder's rows (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, healthView(), { theme });
    await openFromMenu(page);
    const editor = page.locator(".cx-format-editor");
    await expect(editor).toHaveAttribute("aria-labelledby", /format-title/);
    await expect(editor.getByRole("list", { name: "Conditional formatting" }).getByRole("listitem")).toHaveCount(6);
    await expect(editor.getByRole("checkbox", { name: "Apply Server down" })).toBeChecked();
    if (width === 390) {
      const box = await editor.boundingBox();
      expect(box.width).toBe(390);
      for (const button of await editor.locator(".cx-format-item button").all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).include(".cx-format-editor").analyze()).violations).toEqual([]);
    await editor.getByRole("button", { name: "Edit Degraded" }).click();
    await expect(editor.locator("h4")).toHaveText("Edit Degraded");
    await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Degraded");
    const condition = editor.locator(".cx-cond").first();
    await expect(condition.getByRole("combobox", { name: "Condition" })).toHaveValue("in");
    // The formatting operators join the filter builder's for the column's kind.
    const operators = await condition.getByRole("combobox", { name: "Condition" }).evaluate(select => [...select.options].map(option => option.value));
    expect(operators).toEqual(expect.arrayContaining(["eq", "ne", "contains", "startsWith", "in", "isNull", "isNotNull", "notContains", "endsWith", "notIn", "like", "matches"]));
    expect((await new AxeBuilder({ page }).include(".cx-format-editor").analyze()).violations).toEqual([]);
    expect(page.errors).toEqual([]);
  });
}

test("switching, ordering and deleting rules apply at once, with the keyboard, and the legend follows", async ({ page, browserName }) => {
  await open(page);
  await page.locator(".cx-grid-overflow > summary").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Conditional formatting" }).focus();
  await page.keyboard.press("Enter");
  const editor = page.locator(".cx-format-editor");
  await expect(editor.locator("h4")).toBeFocused();
  const tab = process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(tab);
  await expect(editor.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press(tab);
  await expect(editor.getByRole("checkbox", { name: "Apply Server down" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator('.cx-row[data-cx-id="srv-00005"]')).not.toHaveClass(/cx-fmt-row/);
  await expect(page.getByRole("list", { name: "Formatting legend" }).getByRole("listitem")).toHaveCount(5);
  await expect(editor.getByRole("checkbox", { name: "Apply Server down" })).toBeFocused();
  await editor.getByRole("button", { name: "Move Server down down" }).click();
  expect((await rules(page)).map(rule => rule.id).slice(0, 2)).toEqual(["degraded", "down"]);
  await expect(editor.getByRole("button", { name: "Move Server down down" })).toBeFocused();
  await editor.getByRole("button", { name: "Delete CPU above 90%" }).click();
  expect((await rules(page)).map(rule => rule.id)).toEqual(["degraded", "down", "cpu", "latency", "stale"]);
  await editor.getByRole("checkbox", { name: "Show legend" }).uncheck();
  await expect(page.locator(".cx-format-legend")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  expect((await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getState())).formatRules.map(rule => rule.id)).toEqual(["degraded", "down", "cpu", "latency", "stale"]);
});

test("a new rule is built from a condition, a target and a style, and saved into the grid", async ({ page }) => {
  await open(page);
  await openFromMenu(page);
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Add rule" }).click();
  await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
  await page.keyboard.type("Busy memory");
  await editor.locator(".cx-format-form > .cx-format-field").getByRole("combobox", { name: "Column" }).selectOption("memory");
  await editor.getByRole("checkbox", { name: "Only rows where" }).check();
  const condition = editor.locator(".cx-cond").first();
  await condition.getByRole("combobox", { name: "Column" }).selectOption("memory");
  await condition.getByRole("combobox", { name: "Condition" }).selectOption("gt");
  await condition.getByRole("spinbutton", { name: "Value" }).fill("80");
  await editor.getByRole("combobox", { name: "Tone", exact: true }).selectOption("danger");
  await editor.getByRole("combobox", { name: "Icon", exact: true }).selectOption("up");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByRole("list", { name: "Conditional formatting" }).getByRole("listitem")).toHaveCount(7);
  const added = (await rules(page)).at(-1);
  expect(added).toMatchObject({ id: "rule-1", label: "Busy memory", column: "memory", style: { tone: "danger", icon: "up" },
    when: { operator: "and", filters: [{ column: "memory", operator: "gt", values: [80] }], groups: [] } });
  await page.keyboard.press("Escape");
  // Saving schedules a repaint. Wait for the rendered rule, retaining both matching and nonmatching row checks.
  await expect.poll(async () => {
    const memory = await page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].map(row => [Number(row.children[3].textContent.replace(/\D/g, "")), row.children[3].classList.contains("cx-fmt-fill")]));
    return { hasMatches: memory.some(([value]) => value > 80), mismatches: memory.filter(([value, formatted]) => (value > 80) !== formatted) };
  }).toEqual({ hasMatches: true, mismatches: [] });
});

test("styles switch between highlight, data bar, colour scale and threshold bands, and extended operators edit their values", async ({ page }) => {
  await open(page);
  await openFromMenu(page);
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Edit CPU load" }).click();
  await editor.getByRole("button", { name: "Threshold bands" }).click();
  await editor.getByRole("button", { name: "+ Band" }).click();
  const bounds = editor.getByRole("spinbutton", { name: "Up to" });
  await bounds.nth(0).fill("50"); await bounds.nth(1).fill("80");
  await editor.getByRole("combobox", { name: "Tone" }).nth(2).selectOption("danger");
  await editor.getByRole("button", { name: "Save rule" }).click();
  const cpu = (await rules(page)).find(rule => rule.id === "cpu");
  expect(cpu.style.bands.map(band => band.upperBound ?? null)).toEqual([50, 80, null]);
  await editor.getByRole("button", { name: "Edit No check-in for 14 days" }).click();
  const condition = editor.locator(".cx-cond").first();
  await condition.getByRole("combobox", { name: "Condition" }).selectOption("olderThan");
  await condition.getByRole("spinbutton", { name: "Value" }).fill("21");
  await editor.getByRole("button", { name: "Save rule" }).click();
  expect((await rules(page)).find(rule => rule.id === "stale").when.filters[0]).toEqual({ column: "checked", operator: "olderThan", values: [21] });
  await editor.getByRole("button", { name: "Edit Degraded" }).click();
  await editor.locator(".cx-cond").first().getByRole("button", { name: "Match case" }).click();
  await editor.getByRole("button", { name: "None" }).click();
  await editor.getByRole("button", { name: "Save rule" }).click();
  expect((await rules(page)).find(rule => rule.id === "degraded").when).toMatchObject({ operator: "none", filters: [{ operator: "in", caseSensitive: true }] });
});

test("saving keeps what the form does not show: types, cultures, value columns, classes and badge-only styles", async ({ page }) => {
  const view = healthView();
  view.formatRules = [
    { id: "typed", label: "Typed", column: "name", when: { operator: "and", filters: [{ column: "region", operator: "eq", values: ["north"], type: "text", culture: "pl-PL" }] }, style: { badge: "N", className: "north" } },
    { id: "versus", label: "Versus", column: "cpu", when: { operator: "and", filters: [{ column: "cpu", operator: "gt", valueColumn: "memory" }] }, style: { tone: "warning", css: { "font-style": "italic" } } },
    { id: "bar", label: "Bar", column: "cpu", style: { bar: { tone: "info", showValue: false } } },
    { id: "scale", label: "Scale", column: "latency", style: { scale: { stops: [{ type: "min", tone: "success" }, { type: "percent", value: 30, tone: "warning" }, { type: "max", tone: "danger" }] } } }];
  await open(page, view);
  const before = await rules(page);
  await openFromMenu(page);
  const editor = page.locator(".cx-format-editor");
  for (const name of ["Typed", "Versus", "Bar", "Scale"]) {
    await editor.getByRole("button", { name: "Edit " + name }).click();
    await editor.getByLabel("Name", { exact: true }).fill(name + " ");
    await editor.getByRole("button", { name: "Save rule" }).click();
    await expect(editor.locator("h4")).toHaveText("Conditional formatting");
  }
  // The editor writes conditions in their full form, with an empty groups list.
  expect(await rules(page)).toEqual(before.map(rule => rule.when ? { ...rule, when: { groups: [], ...rule.when } } : rule));
  expect(page.errors).toEqual([]);
});

test("an incomplete rule is not saved, and Escape steps back from the form to the list and out", async ({ page }) => {
  await open(page);
  await openFromMenu(page);
  const editor = page.locator(".cx-format-editor");
  await editor.getByRole("button", { name: "Add rule" }).click();
  await editor.getByRole("combobox", { name: "Tone", exact: true }).selectOption({ index: 0 });
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByRole("status")).toContainText("Complete the rule before saving.");
  await expect(editor.locator("h4")).toHaveText("Add rule");
  await page.keyboard.press("Escape");
  await expect(editor.locator("h4")).toHaveText("Conditional formatting");
  await expect(editor.getByRole("button", { name: "Add rule" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  expect((await rules(page)).length).toBe(6);
});

test("the editor speaks the grid's language from a label pack", async ({ page }) => {
  const polish = (await import("../../../JavaScript/locales/pl.mjs")).default;
  // The complete pack goes to the reporting entry, which knows every label it holds.
  const view = healthView(); view.labels = polish; view.reporting = {};
  await page.addInitScript(() => { document.documentElement.lang = "pl"; });
  await open(page, view);
  await page.locator(".cx-grid-overflow > summary").click();
  await page.getByRole("button", { name: polish.formatRules }).click();
  const editor = page.locator(".cx-format-editor");
  await expect(editor.locator("h4")).toHaveText(polish.formatRules);
  await expect(editor.getByRole("button", { name: polish.formatAddRule })).toBeVisible();
  await expect(page.getByRole("list", { name: polish.formatLegend })).toBeVisible();
  expect(fs.existsSync(path.join(repo, "JavaScript/locales/it.mjs"))).toBe(true);
});

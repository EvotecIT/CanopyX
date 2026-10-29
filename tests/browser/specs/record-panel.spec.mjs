import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, definition, open, drawer } from "./record-panel-fixtures.mjs";

const problems = page => { const list = []; page.on("pageerror", error => list.push(error.message)); return list; };
const openRecord = async (page, id = "c001") => { await page.evaluate(api + ".openDetails('" + id + "')"); await expect(drawer(page)).toBeVisible(); };

test("the record panel shows a pinned summary, tabs as an ARIA tablist and the active tab's sections", async ({ page }) => {
  const errors = problems(page);
  await open(page, definition());
  await openRecord(page);
  const dialog = drawer(page);
  await expect(dialog.locator("h4")).toHaveText("host1.example.test");
  await expect(dialog).toHaveAttribute("data-cx-record", "c001");
  // The summary: the status first, then the facts the header names, with their presenters and tones.
  const summary = dialog.locator(".cx-record-summary");
  await expect(summary.locator(".cx-record-status")).toHaveText("Expiring");
  await expect(summary.locator(".cx-record-fact dt")).toHaveText(["Days left", "Expires", "Issuer"]);
  await expect(summary.locator('[data-cx-fact="days"] .cx-tone-warning')).toHaveText("17");
  const tabs = dialog.getByRole("tablist");
  await expect(tabs).toHaveAttribute("aria-label", "Record views");
  await expect(tabs.getByRole("tab")).toHaveText(["Overview", "Fields", "Related", "History"]);
  const overview = tabs.getByRole("tab", { name: "Overview" });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  const panel = dialog.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("aria-labelledby", await overview.getAttribute("id"));
  await expect(panel.locator(".cx-record-toggle")).toHaveText(["Validity", "Ownership"]);
  // Fields carry their ids for parts that extend the drawer; header facts are not repeated in a trailing section.
  await expect(panel.locator('dd[data-cx-field="notBefore"]')).toHaveText("2025-10-15 08:00 UTC");
  await expect(dialog.locator(".cx-record-section-h", { hasText: "Other fields" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keyboard: arrows move between tabs, sections collapse with aria-expanded, Up and Down still step through records", async ({ page }) => {
  await open(page, definition());
  await openRecord(page);
  const dialog = drawer(page);
  await dialog.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Fields" })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "Fields" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("End");
  await expect(dialog.getByRole("tab", { name: "History" })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  // A collapsed section opens and closes with its heading button.
  await dialog.getByRole("tab", { name: "Fields" }).click();
  const advanced = dialog.getByRole("button", { name: "Advanced" });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.locator('dd[data-cx-field="type"]')).toBeHidden();
  await advanced.click();
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.locator('dd[data-cx-field="type"]')).toHaveText("Server");
  const identity = dialog.getByRole("button", { name: "Identity" });
  await identity.press("Enter");
  await expect(identity).toHaveAttribute("aria-expanded", "false");
  // The tab and the collapsed sections stay while stepping to the next record.
  await dialog.locator("h4").focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator("h4")).toHaveText("host2.example.test");
  await expect(dialog.getByRole("tab", { name: "Fields" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
});

test("empty fields hide by default and the reader's switch shows them for the page", async ({ page }) => {
  await open(page, definition());
  await openRecord(page, "c000");
  const dialog = drawer(page);
  await expect(dialog.locator('dd[data-cx-field="renewalWindow"]')).toHaveCount(0);
  await expect(dialog.locator('dd[data-cx-field="costCenter"]')).toHaveCount(0);
  const toggle = dialog.locator(".cx-record-empty");
  await expect(toggle).toHaveText("Show empty fields (2)");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(dialog.locator('dd[data-cx-field="renewalWindow"]')).toHaveText("—");
  await expect(dialog.locator(".cx-record-empty")).toHaveText("Hide empty fields");
  await expect(dialog.locator(".cx-record-empty")).toBeFocused();
  await page.keyboard.press("Escape");
  await openRecord(page, "c002");
  await expect(drawer(page).locator('dd[data-cx-field="renewalWindow"]')).toHaveText("—");
});

test("structured values: grid summaries, chips, objects, collections, timelines and changes", async ({ page }) => {
  await open(page, definition());
  // The grid cell summarises the list: two chips, then +N.
  const names = page.locator('.cx-row[data-cx-id="c003"] .cx-cell').nth(6);
  await expect(names.locator(".p-tag")).toHaveText(["host3.example.test", "alt1.host3.example.test"]);
  await expect(names.locator(".cx-record-more-count")).toHaveText("+3");
  await openRecord(page, "c003");
  const dialog = drawer(page);
  await dialog.getByRole("tab", { name: "Fields" }).click();
  await expect(dialog.locator('dd[data-cx-field="names"] .cx-record-chip')).toHaveCount(5);
  const policies = dialog.locator('dd[data-cx-field="policies"] .cx-record-object');
  await expect(policies.locator("dt")).toHaveText(["Profile", "Validation", "Key usage"]);
  await expect(policies.locator(".cx-tone-info")).toHaveText("Organisation");
  await dialog.getByRole("tab", { name: "History" }).click();
  const timeline = dialog.locator('.cx-record-block-b[data-cx-field="history"]');
  await expect(timeline.locator(".cx-timeline-day")).toHaveText(["2026-10-01", "2026-09-12"]);
  await expect(timeline.locator(".cx-timeline-summary")).toHaveText(["Reminder sent to the owner", "Owner changed", "Certificate issued"]);
  await expect(timeline.locator(".cx-record-diff tbody th")).toHaveText("Owner");
  // A list change marks what it removed and added in text, not by colour alone.
  const changes = dialog.locator('.cx-record-block-b[data-cx-field="changes"] .cx-record-diff');
  await expect(changes.locator("caption")).toHaveText("Changed fields: 2");
  await expect(changes.locator(".cx-diff-removed")).toHaveText("Removed: old@example.test");
  await expect(changes.locator(".cx-diff-added")).toHaveText("Added: sam@example.test");
  // The record field's sparkline comes with the history part, as it does in a column.
  await expect(dialog.locator('dd[data-cx-field="trend"] .p-line, dd[data-cx-field="trend"] svg').first()).toBeVisible();
});

test("record fields cost the grid nothing: no column, no search match, no export column; drawer: false keeps a column out", async ({ page }) => {
  await open(page, definition());
  // The column chooser lists columns only.
  expect(await page.evaluate(api + ".getState().columns.map(column => column.id)")).not.toContain("thumbprint");
  await page.evaluate(api + ".setQuery({ search: 'A1B2C3D4E5F60001' })");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  await page.evaluate(api + ".setQuery({ search: '' })");
  const capture = await page.evaluate(api + ".prepareExport({ scope: 'all' }).request.columns.map(column => column.id)");
  expect(capture).not.toContain("thumbprint");
  await openRecord(page);
  await expect(drawer(page).locator('[data-cx-field="serial"]')).toHaveCount(0);
  // The plain drawer of a view without a record panel keeps every column, and drawer: false applies there too.
  await page.keyboard.press("Escape");
  const plain = definition(); delete plain.record; plain.rows.forEach(row => delete row.fields);
  await open(page, plain);
  await page.evaluate(api + ".openDetails('c001')");
  await expect(drawer(page).locator("dt")).toHaveText(["Common name", "Status", "Days left", "Expires", "Issuer", "Owner", "Names", "Type"]);
  await expect(drawer(page).locator('dd[data-cx-field="days"] .cx-tone-warning')).toHaveText("17");
});

test("the drawer keeps the contract parts rely on: field ids, the record shown and a paint event", async ({ page }) => {
  await open(page, definition());
  await page.evaluate(() => { window.paints = []; document.addEventListener("cx-drawer-paint", event => window.paints.push(event.detail.id), true); });
  await openRecord(page);
  await drawer(page).locator("h4").focus();
  await page.keyboard.press("ArrowDown");
  await expect(drawer(page)).toHaveAttribute("data-cx-record", "c002");
  // Every paint is reported, in order; the move paints the record it reaches once (c001 may paint again when the history part arrives).
  expect([...new Set(await page.evaluate("window.paints"))]).toEqual(["c001", "c002"]);
  expect((await page.evaluate("window.paints")).filter(id => id === "c002")).toHaveLength(1);
  expect(await page.evaluate("document.querySelector('dialog.cx-drawer')._cxRecord.id")).toBe("c002");
  expect(await page.evaluate("document.querySelector('dialog.cx-drawer').getAttribute('data-cx-view')")).toBe("certificates");
});

for (const theme of ["light", "dark"]) test("accessibility: the open record panel has no axe violations (" + theme + ")", async ({ page }) => {
  await open(page, definition());
  if (theme === "dark") await page.evaluate(() => document.querySelector("[data-canopyx-host]").setAttribute("data-cx-theme", "dark"));
  await openRecord(page);
  for (const tab of ["Overview", "History"]) {
    await drawer(page).getByRole("tab", { name: tab }).click();
    const result = await new AxeBuilder({ page }).include("dialog.cx-drawer").analyze();
    expect(result.violations.map(item => item.id + ": " + item.nodes.map(node => node.target.join(" ")).join(", "))).toEqual([]);
  }
});

test("an invalid record panel is reported and the record shows in the plain drawer", async ({ page }) => {
  const view = definition(); view.record.sections[0].fields.push("nope");
  await open(page, view);
  const errors = page.evaluate(() => new Promise(resolve => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:error", event => resolve(event.detail.error.message), { once: true })));
  await openRecord(page);
  expect(await errors).toContain("record section validity");
  await expect(drawer(page).locator('dd[data-cx-field="status"]')).toBeVisible();
});

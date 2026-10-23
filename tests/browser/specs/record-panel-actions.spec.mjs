import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { api, definition, drawer } from "./record-panel-fixtures.mjs";
import { viewPage } from "./support.mjs";

// The page registers a plugin with a drawer section and a record action, and stubs the clipboard and print.
async function openWithPlugin(page, view = definition(), disabledActions = false) {
  view.record.sections[5].renderer = "trend-chart";
  const script = `<script>
window.copied = []; window.printed = []; window.actionCalls = { renewal: 0, portal: 0 };
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: text => { window.copied.push(text); return Promise.resolve(); } } });
window.print = () => { const sheet = document.querySelector(".cx-record-print");
  window.printed.push({ html: document.documentElement.classList.contains("cx-record-printing"), sections: [...sheet.querySelectorAll(".cx-record-section-h")].map(item => item.textContent),
    tabs: [...sheet.querySelectorAll("h2")].map(item => item.textContent), title: sheet.querySelector("h1").textContent, rows: sheet.querySelectorAll(".cx-record-table tbody tr").length,
    toggles: sheet.querySelectorAll("button").length }); window.dispatchEvent(new Event("afterprint")); };
CanopyX.use({ name: "trend-chart",
  drawerSections: { "trend-chart": (record, element, context) => { const box = document.createElement("div"); box.className = "trend-chart";
    box.textContent = "Chart of " + record.id + " at " + context.width + " px, " + context.values.days.value + " days"; element.appendChild(box);
    context.onDispose(() => { window.disposed = (window.disposed || 0) + 1; }); } },
  recordActions: [{ label: "Open in the issuing portal", disabled: ${disabledActions}, run: ({ record, view }) => { window.actionCalls.portal++; window.portal = view + "/" + record.id; } }] });
CanopyX.configure("certificates", { recordActions: [{ label: "Request renewal", disabled: ${disabledActions}, run: ({ record }) => { window.actionCalls.renewal++; window.renewal = record.id; } }] });
</script>`;
  await page.route("http://canopyx.test/records.html", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("<body class=\"cx-page\">", "<body class=\"cx-page\">" + script) }));
  await page.goto("http://canopyx.test/records.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('c001')");
  await expect(drawer(page)).toBeVisible();
}
const action = async (page, name) => {
  await drawer(page).getByRole("button", { name: "Record actions" }).click();
  await drawer(page).getByRole("menuitem", { name }).click();
};

test("the actions menu is an ARIA menu button with built-in, host and plugin actions", async ({ page }) => {
  await openWithPlugin(page);
  const toggle = drawer(page).getByRole("button", { name: "Record actions" });
  await expect(toggle).toHaveAttribute("aria-haspopup", "menu");
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const items = drawer(page).getByRole("menu", { name: "Record actions" }).getByRole("menuitem");
  await expect(items).toHaveText(["Copy link", "Copy values", "Copy as JSON", "Export CSV", "Export JSON", "Print record", "Request renewal", "Open in the issuing portal"]);
  await expect(items.first()).toBeFocused();
  expect(await items.first().evaluate(item => item.closest('[role="menu"]').parentElement === item.closest("dialog"))).toBe(true);
  await page.keyboard.press("ArrowUp");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(drawer(page)).toBeVisible();
  await action(page, "Request renewal");
  await expect.poll(() => page.evaluate("window.renewal")).toBe("c001");
  expect(await page.evaluate(() => window.actionCalls)).toEqual({ renewal: 1, portal: 0 });
  await toggle.press("ArrowUp"); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate("window.portal")).toBe("certificates/c001");
  expect(await page.evaluate(() => window.actionCalls)).toEqual({ renewal: 1, portal: 1 });
});

test("disabled host and plugin record actions remain navigable without activation", async ({ page }) => {
  await openWithPlugin(page, definition(), true);
  const toggle = drawer(page).getByRole("button", { name: "Record actions" });
  await toggle.press("ArrowUp");
  const menu = drawer(page).getByRole("menu", { name: "Record actions" });
  for (const name of ["Open in the issuing portal", "Request renewal"]) {
    const item = menu.getByRole("menuitem", { name, exact: true });
    await expect(item).toBeFocused(); await expect(item).toHaveAttribute("aria-disabled", "true");
    expect(await item.evaluate(button => button.disabled)).toBe(false);
    await page.keyboard.press("Enter");
    const box = await item.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => window.actionCalls)).toEqual({ renewal: 0, portal: 0 });
    if (name === "Open in the issuing portal") await page.keyboard.press("ArrowUp");
  }
  await page.keyboard.press("Escape"); await expect(toggle).toBeFocused(); await expect(drawer(page)).toBeVisible();
});

test("retiring a record closes its portalled actions menu and preserves an independent dialog", async ({ page }) => {
  await openWithPlugin(page);
  await drawer(page).getByRole("button", { name: "Record actions" }).click();
  await expect(drawer(page).getByRole("menu", { name: "Record actions" })).toBeVisible();
  await page.evaluate(async () => {
    const record = document.querySelector("dialog.cx-drawer");
    window.retiredRecordMenu = record.querySelector('[role="menu"]');
    window.recordClosed = new Promise(resolve => record.addEventListener("close", resolve, { once: true }));
    const sibling = document.createElement("dialog"); sibling.className = "cx-dialog"; sibling.id = "independent-record-dialog";
    sibling.setAttribute("aria-label", "Independent dialog");
    const input = document.createElement("input"); input.setAttribute("aria-label", "Independent value"); sibling.appendChild(input);
    document.body.appendChild(sibling);
    await CanopyX.dialog(sibling).ready;
    CanopyX.dialog(sibling).open();
    record._replaced = true; record._cxOverlay.close("replace", false, true);
  });
  await page.evaluate(() => window.recordClosed);
  await expect(drawer(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.retiredRecordMenu.hidden && !window.retiredRecordMenu.matches(":popover-open"))).toBe(true);
  const sibling = page.getByRole("dialog", { name: "Independent dialog" });
  await expect(sibling).toBeVisible(); await expect(sibling.getByRole("textbox")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape"); await expect(sibling).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  await page.evaluate(() => { const dialog = CanopyX.dialog("#independent-record-dialog"); dialog.destroy(); dialog.element.remove(); });
});

test("copy values and JSON; record.actions switches built-in actions off", async ({ page }) => {
  await openWithPlugin(page);
  await action(page, "Copy values");
  await expect.poll(() => page.evaluate("window.copied.length")).toBe(1);
  const text = await page.evaluate("window.copied[0]");
  expect(text.split("\n")[0]).toBe("host1.example.test");
  expect(text).toContain("Thumbprint\tA1B2C3D4E5F60001");
  expect(text).toContain("Contacts\tOwner · Alex Example · alex@example.test; Technical");
  await action(page, "Copy as JSON");
  await expect.poll(() => page.evaluate("window.copied.length")).toBe(2);
  const json = JSON.parse(await page.evaluate("window.copied[1]"));
  expect(json).toMatchObject({ view: "certificates", id: "c001", title: "host1.example.test" });
  expect(json.fields.find(field => field.id === "keyUsage")).toMatchObject({ section: "Names", text: "Digital signature, Key encipherment", value: { items: ["Digital signature", "Key encipherment"] } });
  // Every field travels, empty ones too.
  expect(json.fields.find(field => field.id === "renewalWindow")).toMatchObject({ text: "" });
  await expect(drawer(page).locator(".cx-record-live")).toHaveText("Copied to the clipboard");

  const view = definition(); view.record.actions = { copy: false, export: false, link: false };
  await openWithPlugin(page, view);
  await drawer(page).getByRole("button", { name: "Record actions" }).click();
  await expect(drawer(page).getByRole("menuitem")).toHaveText(["Print record", "Request renewal", "Open in the issuing portal"]);
});

test("export one record as CSV or JSON", async ({ page }) => {
  await openWithPlugin(page);
  const [csv] = await Promise.all([page.waitForEvent("download"), action(page, "Export CSV")]);
  expect(csv.suggestedFilename()).toBe("certificates-c001.csv");
  const content = fs.readFileSync(await csv.path(), "utf8");
  expect(content.charCodeAt(0)).toBe(0xfeff);
  expect(content.split("\r\n")[0]).toBe("﻿\"Section\",\"Field\",\"Value\"");
  expect(content).toContain("\"Identity\",\"Thumbprint\",\"A1B2C3D4E5F60001\"");
  expect(content).toContain("\"Identity / Advanced\",\"Type\",\"Server\"");
  const [json] = await Promise.all([page.waitForEvent("download"), action(page, "Export JSON")]);
  expect(json.suggestedFilename()).toBe("certificates-c001.json");
  expect(JSON.parse(fs.readFileSync(await json.path(), "utf8")).id).toBe("c001");
});

test("print one record: every tab and section expanded on a sheet the print stylesheet shows alone", async ({ page }) => {
  await openWithPlugin(page);
  await action(page, "Print record");
  await expect.poll(() => page.evaluate("window.printed.length")).toBe(1);
  const printed = await page.evaluate("window.printed[0]");
  expect(printed).toMatchObject({ html: true, title: "host1.example.test", tabs: ["Overview", "Fields", "Related", "History"], toggles: 0 });
  expect(printed.sections).toEqual(["Validity", "Ownership", "Names", "Identity", "Advanced", "Related", "History"]);
  // Collections print as full tables: three contacts and three related certificates.
  expect(printed.rows).toBe(6);
  // The sheet goes once printing ends.
  await expect(page.locator(".cx-record-print")).toHaveCount(0);
  expect(await page.evaluate("document.documentElement.classList.contains('cx-record-printing')")).toBe(false);
  // Print media shows the sheet alone.
  await page.evaluate(() => { window.print = () => {}; });
  await action(page, "Print record");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cx-record-print")).toBeVisible();
  await expect(page.locator("dialog.cx-drawer")).toBeHidden();
  await expect(page.locator("[data-canopyx-host]")).toBeHidden();
});

test("a plugin's drawer section draws content (a chart) with the record's values and is disposed with it", async ({ page }) => {
  await openWithPlugin(page);
  await drawer(page).getByRole("tab", { name: "History" }).click();
  await expect(drawer(page).locator(".cx-record-custom .trend-chart")).toHaveText("Chart of c001 at 380 px, 17 days");
  await drawer(page).locator("h4").focus();
  await page.keyboard.press("ArrowDown");
  await expect(drawer(page).locator(".cx-record-custom .trend-chart")).toHaveText(/Chart of c002/);
  expect(await page.evaluate("window.disposed")).toBeGreaterThan(0);
});

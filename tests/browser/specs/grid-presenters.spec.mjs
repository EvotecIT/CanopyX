import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames, settleOverlayMotion } from "./support.mjs";

const columns = [
  { id: "name", title: "Record", width: 180, kind: "text", sortable: true },
  { id: "url", title: "URL", width: 180, kind: "text", hidden: true },
  { id: "status", title: "Status", width: 110, kind: "text" },
  { id: "amount", title: "Progress", width: 170, kind: "number", sortable: true },
  { id: "flag", title: "Enabled", width: 100, kind: "text" },
  { id: "list", title: "Owners", width: 150, kind: "text" },
  { id: "notes", title: "Notes", width: 220, kind: "text", priority: "essential" }
];
const view = { protocol: "canopyx/2", type: "grid", id: "rich", label: "Rich inventory", source: { kind: "inline" },
  rowHeight: 28, pageSize: 10, presentation: "paged", pageLength: 3, selection: "multiple", search: true, columns,
  reporting: { presenters: { name: { kind: "link", hrefColumn: "url", newWindow: true }, status: { kind: "icon", glyph: "●" },
    amount: { kind: "progress", maximum: 100 }, flag: { kind: "boolean" },
    list: { kind: "list", separator: ",", limit: 2 }, notes: { kind: "longText" } } },
  rows: [
    { id: "a", cells: { name: { value: "A", text: "Open A" }, url: "https://example.com/a", status: { value: "Healthy", tone: "success", badges: [{ text: "Ready" }] },
      amount: { value: 125, text: "125 units" }, flag: true, list: "Alex,Sam,Kim,Pat", notes: "<img src=x onerror=alert(1)>\nComplete plain text" } },
    { id: "b", cells: { name: "B", url: "javascript:alert(1)", status: "Warning", amount: -5, flag: false, list: "Sam", notes: "Other notes" } },
    { id: "c", cells: { name: "C", url: "data:text/html,hi", amount: null, flag: null, list: "", notes: "" } },
    { id: "d", cells: { name: "D", url: "mailto:hello@example.com", amount: 25, flag: true, list: "Pat", notes: "Last record" } }
  ] };
async function open(page, patch = {}) {
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, ...patch })
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Rich inventory</h1>').replace('</body>', '</main></body>') }));
  await page.goto("http://canopyx.test/rich");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
}
const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');

test("safe links, glyph alternatives, boolean labels and progress retain full-query raw values", async ({ page }) => {
  await open(page, { labels: { yes: "Enabled", no: "Disabled" } });
  const link = row(page, "a").getByRole("link", { name: "Open A" });
  await expect(link).toHaveAttribute("href", "https://example.com/a"); await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(row(page, "b").getByRole("link")).toHaveCount(0); await expect(row(page, "c").getByRole("link")).toHaveCount(0);
  await expect(row(page, "a").locator(".cx-presenter-icon")).toHaveAttribute("aria-hidden", "true");
  await expect(row(page, "a").getByText("Healthy", { exact: true })).toBeVisible();
  await expect(row(page, "a").getByText("Ready", { exact: true })).toBeVisible();
  await expect(row(page, "a").getByRole("img", { name: "Enabled", exact: true })).toBeVisible();
  await expect(row(page, "a").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect(row(page, "b").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(row(page, "c").getByRole("progressbar")).toHaveCount(0);
  const exported = await page.evaluate(async () => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    await api.setQuery({ sort: [{ column: "amount", direction: "desc" }] });
    const rows = []; for await (const row of api.prepareExport({ scope: "filtered", raw: true }).rows()) rows.push(row);
    return rows;
  });
  expect(exported.map(item => item.id)).toEqual(["a", "d", "b", "c"]);
  expect(exported[0].cells.amount).toMatchObject({ value: 125, text: "125 units" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("text and list dialogs escape markup, return focus and leave fixed row height intact", async ({ page }) => {
  await open(page);
  const button = row(page, "a").getByRole("button", { name: "Notes: show complete text" }); await button.click();
  const dialog = page.getByRole("dialog", { name: "Notes", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.locator("img")).toHaveCount(0);
  await expect(dialog.locator("pre")).toHaveText(view.rows[0].cells.notes);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await row(page, "a").evaluate(item => item.getBoundingClientRect().height)).toBe(28);
  await dialog.locator("pre").press("Escape"); await expect(dialog).toHaveCount(0); await expect(button).toBeFocused();
  await row(page, "a").getByRole("button", { name: "Owners: show complete text" }).click();
  await expect(page.getByRole("dialog").locator("pre")).toHaveText("Alex,Sam,Kim,Pat");
  await page.getByRole("button", { name: "Close complete text" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [1440, 390]) test(`first-column long text stays readable beside native selection at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const text = "Complete operational notes and the recommended next action. ".repeat(12);
  for (const selectionControls of [false, true]) {
    await open(page, { reporting: { selectionControls },
      columns: [{ id: "notes", title: "Notes", width: 260, kind: "text", presenter: { kind: "longText" } },
        { id: "amount", title: "Amount", width: 100, kind: "number" }],
      rows: [{ id: "a", cells: { notes: text, amount: 1 } }] });
    const first = row(page, "a"), more = first.getByRole("button", { name: "Notes: show complete text" });
    const geometry = await more.evaluate(button => {
      const cell = button.closest(".cx-cell").getBoundingClientRect(), target = button.getBoundingClientRect();
      const preview = button.parentElement.querySelector(".cx-wrapped-text").getBoundingClientRect();
      return { rowHeight: button.closest(".cx-row").getBoundingClientRect().height,
        previewHeight: preview.height, previewLineHeight: parseFloat(getComputedStyle(button.parentElement.querySelector(".cx-wrapped-text")).lineHeight),
        targetHeight: target.height, visibleTargetHeight: Math.max(0, Math.min(target.bottom, cell.bottom) - Math.max(target.top, cell.top)),
        previewInside: preview.top >= cell.top - 0.5 && preview.bottom <= cell.bottom + 0.5 };
    });
    if (width === 1440) expect(geometry.rowHeight).toBe(28);
    else { expect(geometry.rowHeight).toBeGreaterThanOrEqual(28); expect(geometry.previewHeight).toBeLessThanOrEqual(4 * geometry.previewLineHeight + 1); }
    expect(geometry.targetHeight).toBeGreaterThanOrEqual(24);
    expect(geometry.visibleTargetHeight).toBeGreaterThanOrEqual(24); expect(geometry.previewInside).toBe(true);
    if (selectionControls) {
      await first.focus(); await page.keyboard.press("F2");
      const check = first.locator(".cx-grid-row-select"), held = await check.elementHandle();
      await page.keyboard.down("Space");
      try { await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.refresh()); await nextFrames(page); }
      finally { await page.keyboard.up("Space"); }
      await nextFrames(page);
      expect(await check.evaluate((current, previous) => current === previous, held)).toBe(true);
      await expect(check).toBeChecked(); await expect(check).toBeFocused();
    }
    await more.click();
    const dialog = page.getByRole("dialog", { name: "Notes", exact: true });
    await expect(dialog.locator("pre")).toHaveText(text);
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(more).toBeFocused();
  }
});

test("retiring a query or destroying a grid closes complete text and recycled links do not retain unsafe destinations", async ({ page }) => {
  await open(page);
  await row(page, "a").getByRole("button", { name: "Notes: show complete text" }).click();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ search: "B" }));
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(row(page, "b").getByRole("link")).toHaveCount(0);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setQuery({ search: "A" }));
  await row(page, "a").getByRole("button", { name: "Notes: show complete text" }).click();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.destroy());
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("explicit trusted host renderers override presenters without changing exports", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const host = document.querySelector('[data-canopyx-host]'), view = host.canopyx.view; host.canopyx.destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view, renderers: { name(row, element) {
      element.textContent = "Host " + row.id; return true;
    } } }); return host.canopyx.ready;
  });
  await expect(row(page, "a").getByText("Host a", { exact: true })).toBeVisible();
  await expect(row(page, "a").getByRole("link")).toHaveCount(0);
  const csv = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.toCsv({ scope: "filtered" }));
  expect(csv).toContain("Open A"); expect(csv).not.toContain("Host a");
});

test("large notes and lists retain complete exports with bounded mounted previews", async ({ page }) => {
  const notes = "Long paragraph ".repeat(10000), owners = "Owner, ".repeat(10000);
  await open(page, { rows: [{ id: "large", cells: { name: "Large", notes, list: owners } }] });
  const notesButton = row(page, "large").getByRole("button", { name: "Notes: show complete text" });
  expect((await notesButton.textContent()).length).toBeLessThanOrEqual(258);
  expect((await row(page, "large").getByRole("button", { name: "Owners: show complete text" }).textContent()).length).toBeLessThanOrEqual(258);
  await notesButton.click(); await expect(page.getByRole("dialog").locator("pre")).toHaveText(notes);
  await page.getByRole("button", { name: "Close complete text" }).click();
  const csv = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.toCsv({ scope: "filtered" }));
  expect(csv).toContain(notes); expect(csv).toContain(owners);
});

test("compact dark complete-text sheets stay within the phone and retain keyboard close controls", async ({ page, browserName }) => {
  const tab = process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.setViewportSize({ width: 390, height: 700 }); await open(page);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').setAttribute('data-cx-theme', 'dark'));
  await row(page, "a").getByRole("button", { name: "Notes: show complete text" }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(); await settleOverlayMotion(dialog);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
  await dialog.locator("pre").press(tab);
  const copy = dialog.getByRole("button", {name:"Copy",exact:true}); await expect(copy).toBeFocused();
  const close = page.getByRole("button", { name: "Close complete text" });
  await copy.press(tab); await expect(close).toBeFocused();
  await close.press("Shift+" + tab); await expect(copy).toBeFocused();
  await copy.press("Shift+" + tab); await expect(dialog.locator("pre")).toBeFocused();
  await dialog.locator("pre").press("Shift+" + tab); await expect(close).toBeFocused();
  await close.press(tab); await expect(dialog.locator("pre")).toBeFocused();
  await dialog.locator("pre").press(tab); await expect(copy).toBeFocused();
  await copy.press(tab); await expect(close).toBeFocused();
  await close.press("Enter"); await expect(dialog).toHaveCount(0);
});

test("complete text returns to the same record cell after a host refresh replaces its control", async ({ page }) => {
  await open(page);
  for (const column of ["Notes", "Owners"]) {
    const button = row(page, "a").getByRole("button", { name: column + ": show complete text" });
    await button.click();
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.refresh()); await nextFrames(page);
    await page.getByRole("button", { name: "Close complete text" }).click(); await expect(button).toBeFocused();
  }
  await row(page, "a").getByRole("button", { name: "Notes: show complete text" }).click();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnVisible("notes", false)); await nextFrames(page);
  await page.getByRole("button", { name: "Close complete text" }).click(); await expect(row(page, "a")).toBeFocused();
});

test("lists below the item and preview limits remain readable when the column clips their text", async ({ page }) => {
  const owners = "Alexandra Montgomery, Samantha Williamson";
  await open(page, { rows: [{ id: "clipped", cells: { name: "Clipped list", list: owners } }] });
  const button = row(page, "clipped").getByRole("button", { name: "Owners: show complete text" });
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("list", 80)); await nextFrames(page);
  await expect(button).toBeVisible(); await button.click();
  await expect(page.getByRole("dialog").locator("pre")).toHaveText(owners);
  await page.getByRole("button", { name: "Close complete text" }).click(); await expect(button).toBeFocused();
});

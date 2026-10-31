import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const longName = "server-01.branch-office.production-region.internal.".repeat(8);
async function open(page, { extra = 0, selected = false, labels, lang = "en", signal = "Expires 0-7d" } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  const columns = [{ id: "name", title: "Record", kind: "text", rowHeader: true, width: 260 },
    { id: "days", title: "Days", kind: "number", priority: 1 },
    { id: "signal", title: "Signal", kind: "text", priority: 1, presenter: { kind: "enum" } },
    ...Array.from({ length: extra }, (_, index) => ({ id: "extra" + index, title: "Detail " + index, kind: "text", priority: "optional" }))];
  const rows = Array.from({ length: 40 }, (_, index) => ({ id: "r" + index, cells: {
    name: longName + index, days: 7, signal: { value: signal, tone: "warning" },
    ...Object.fromEntries(Array.from({ length: extra }, (_, i) => ["extra" + i, "Evidence " + i])) } }));
  const view = { protocol: "canopyx/2", type: "grid", id: "phone", label: "Observations", rowHeight: 32, pageSize: 100,
    selection: selected ? "multiple" : "none", reporting: selected ? { selectionControls: true } : undefined, source: { kind: "inline" }, columns, rows, labels };
  const html = viewPage(view).replace('<html lang="en">', `<html lang="${lang}">`);
  await page.route("http://canopyx.test/phone-line", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/phone-line");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  await nextFrames(page); await nextFrames(page);
}

for (const selected of [false, true]) test(`phone record contains an over-viewport identity and shows essentials without a repeated chip (selection ${selected})`, async ({ page }) => {
  await open(page, { selected });
  const row = page.locator('.cx-row[data-cx-id="r0"]');
  await expect(row.locator('.cx-phone-fields')).toContainText("Days:");
  await expect(row.locator('.cx-phone-fields')).toContainText("Signal:");
  await expect(row.locator('.cx-phone-value').nth(1)).toHaveText("Expires 0-7d");
  await expect(row.locator('.cx-hidden-fields')).toHaveCount(0);
  await expect(row.locator('.cx-cell').first()).toHaveAttribute("title", longName + "0");
  const geometry = await row.evaluate(element => {
    const name = element.querySelector('.cx-phone-primary .cx-text'), card = document.querySelector('[data-canopyx-host]');
    return { page: document.documentElement.scrollWidth, viewport: innerWidth, right: card.getBoundingClientRect().right,
      clipped: name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight + 1, ellipsis: getComputedStyle(name).textOverflow, line: element.querySelector('.cx-phone-fields').getBoundingClientRect().bottom,
      bottom: element.getBoundingClientRect().bottom };
  });
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.clipped).toBe(true); expect(geometry.ellipsis).toBe("ellipsis");
  expect(geometry.line).toBeLessThanOrEqual(geometry.bottom + 1);
  await page.locator('.cx-grid').evaluate(grid => grid.scrollTop = 700); await nextFrames(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const count of [1, 2]) test(`phone disclosure counts only ${count} fields beyond the second line with sentence-case plurals`, async ({ page }) => {
  await open(page, { extra: count });
  await expect(page.locator('.cx-row[data-cx-id="r0"] .cx-hidden-fields')).toHaveText(`+${count} column${count === 1 ? "" : "s"}`);
});

test("phone disclosure stays with its context when the last field wraps", async ({ page }) => {
  await open(page, { extra: 4, signal: "A long inspection outcome with retained evidence" });
  const row = page.locator('.cx-row[data-cx-id="r0"]');
  await expect(row.locator('.cx-hidden-fields')).toHaveText("+4 columns");
  const geometry = await row.evaluate(element => {
    const disclosure = element.querySelector('.cx-hidden-fields').getBoundingClientRect();
    const context = element.querySelectorAll('.cx-phone-field');
    const last = context[context.length - 1].querySelector('.cx-phone-value').getBoundingClientRect();
    return { disclosure: (disclosure.top + disclosure.bottom) / 2, context: (last.top + last.bottom) / 2 };
  });
  expect(Math.abs(geometry.disclosure - geometry.context)).toBeLessThanOrEqual(2);
});

test("same-named phone records expose their next priority context without author-hidden fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const columns = [{ id: "check", title: "Check", kind: "text", rowHeader: true, width: 180 },
    { id: "outcome", title: "Outcome", kind: "text", priority: 1 },
    { id: "domain", title: "Domain", kind: "text", priority: 2 },
    { id: "area", title: "Area", kind: "text", priority: 3 },
    { id: "evidence", title: "Evidence", kind: "text", priority: "optional" },
    { id: "internal", title: "Not in this view", kind: "text", hidden: true, priority: 0 }];
  const view = { protocol: "canopyx/2", type: "grid", id: "contexts", label: "Checks", rowHeight: 32, pageSize: 100, selection: "none",
    source: { kind: "inline" }, columns, rows: ["first.example.test", "second.example.test"].map((domain, i) => ({ id: "r" + i,
      cells: { check: "EDNS support", outcome: "Error", domain, area: "DNS", evidence: "Observed response", internal: "Hidden detail" } })) };
  await page.route("http://canopyx.test/context", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/context");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  for (const [index, domain] of ["first.example.test", "second.example.test"].entries()) {
    const row = page.locator(`.cx-row[data-cx-id="r${index}"]`);
    await expect(row.locator(".cx-phone-fields")).toContainText(domain);
    await expect(row.locator(".cx-phone-value").first()).toHaveAttribute("title", domain);
    await expect(row.locator(".cx-phone-fields")).not.toContainText("Hidden detail");
    await expect(row.locator(".cx-hidden-fields")).toHaveText("+1 column");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("phone disclosure uses the existing localized plural catalogue", async ({ page }) => {
  await open(page, { extra: 2, lang: "pl", labels: { hiddenColumns: "[one]+{count} kolumna[few]+{count} kolumny[other]+{count} kolumn" } });
  await expect(page.locator('.cx-row[data-cx-id="r0"] .cx-hidden-fields')).toHaveText("+2 kolumny");
});

test("leaving measured phone rows restores the fixed extent and a visible desktop anchor", async ({ page }) => {
  await open(page);
  const grid = page.locator('.cx-grid');
  await grid.evaluate(element => element.scrollTop = element.scrollHeight);
  await nextFrames(page); await nextFrames(page);
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(page.locator('.cx-data-grid')).not.toHaveClass(/cx-phone/);
  await nextFrames(page); await nextFrames(page);
  expect(await page.locator('.cx-canvas').evaluate(element => element.offsetHeight)).toBe(40 * 32);
  await expect(page.locator('.cx-phone-fields')).toHaveCount(0);
  await expect(page.locator('.cx-row[data-cx-id="r39"]')).toBeVisible();
  expect(await page.locator('.cx-row[data-cx-id="r39"]').evaluate(element => element.offsetHeight)).toBe(32);
});

test("a short scalar gives second-line room to a longer essential status pill", async ({ page }) => {
  await open(page, { signal: "Needs investigation" });
  const signal = page.locator('.cx-row[data-cx-id="r0"] .cx-phone-value').nth(1);
  await expect(signal).toHaveText("Needs investigation");
  await expect(signal).not.toHaveAttribute("tabindex");
  await expect(page.locator('.cx-row[data-cx-id="r0"] .cx-phone-value').first()).not.toHaveAttribute("tabindex");
  expect(await signal.evaluate(element => [...element.querySelectorAll('*')].every(child => child.scrollWidth <= child.clientWidth + 1))).toBe(true);
});

test("an essential pill wider than the phone scrolls within its record line without clipping the value", async ({ page }) => {
  await open(page, { signal: "Needs confirmation from the regional operations and service delivery review team" });
  const value = page.locator('.cx-row[data-cx-id="r0"] .cx-phone-value').nth(1);
  const geometry = await value.evaluate(element => { const pill=element.querySelector('.p-pill');return {pillWidth:pill.clientWidth,pillContent:pill.scrollWidth,viewport:element.clientWidth,content:element.scrollWidth,page:document.documentElement.scrollWidth}; });
  expect(geometry.pillContent).toBeLessThanOrEqual(geometry.pillWidth + 1);
  expect(geometry.content).toBeGreaterThan(geometry.viewport);
  expect(geometry.page).toBeLessThanOrEqual(390);
  await expect(value).toHaveAttribute("tabindex", "0");
  await page.locator('.cx-row[data-cx-id="r0"]').focus();
  await page.keyboard.press("F2");
  await expect(value).toBeFocused();
  await value.press("ArrowRight");
  await expect.poll(() => value.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
  const recycled = page.locator('.cx-row[data-cx-id="r39"] .cx-phone-value').nth(1);
  await expect(recycled).toHaveAttribute("tabindex", "0");
  await page.locator('.cx-row[data-cx-id="r39"]').focus();
  await page.keyboard.press("F2");
  await expect(recycled).toBeFocused();
  await recycled.press("ArrowRight");
  await expect.poll(() => recycled.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});

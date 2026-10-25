import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

// A report host can override the theme through CSS without changing data-cx-theme.
// Body-mounted controls must use that resolved scheme as well as the host's colours.
const view = {
  protocol: "canopyx/2", type: "grid", id: "host-theme", label: "Host-themed records",
  source: { kind: "inline" }, rowHeight: 28, pageSize: 20, selection: "multiple",
  reporting: { headerFilters: true },
  columns: [
    { id: "name", title: "Name", kind: "text", width: 220, sortable: true, rowHeader: true },
    { id: "amount", title: "Amount", kind: "number", width: 140 },
    { id: "notes", title: "Notes", kind: "text", width: 220, presenter: { kind: "longText" } }
  ],
  rows: [{ id: "record", cells: { name: "One record", amount: 10, notes: "Complete report notes that exceed the preview. ".repeat(30) } }]
};

for (const scheme of ["light", "dark"]) {
  test(`body-mounted grid overlays retain the host's resolved ${scheme} scheme`, async ({ page }, testInfo) => {
    const palette = scheme === "dark" ? "--hfx-color-surface:#16181c;--hfx-color-text:#f2f3f5;" : "--hfx-color-surface:#ffffff;--hfx-color-text:#16181c;";
    const html = viewPage(view).replace("</head>", `<style>[data-canopyx-host] { ${palette}color-scheme:${scheme}; }</style></head>`);
    await page.route("http://canopyx.test/host-theme", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://canopyx.test/host-theme");
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
    await expect(page.locator('[data-canopyx-host]')).toHaveAttribute("data-cx-theme", "light");

    await page.getByRole("button", { name: "Menu for Amount", exact: true }).click();
    await page.getByRole("menuitem", { name: "Filter…", exact: true }).click();
    const filter = page.getByRole("dialog", { name: "Amount: Filter…", exact: true });
    const condition = filter.getByRole("combobox", { name: "Condition", exact: true });
    await expect(condition).toHaveValue("eq");
    expect(await condition.evaluate(element => getComputedStyle(element).colorScheme)).toBe(scheme);
    await condition.selectOption("ge");
    await expect(condition).toHaveValue("ge");
    await page.screenshot({ path: testInfo.outputPath(`filter-${scheme}.png`) });
    await condition.press("Escape");

    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.openDetails("record"));
    const record = page.locator(".cx-drawer");
    await expect(record).toBeVisible();
    expect(await record.evaluate(element => getComputedStyle(element).colorScheme)).toBe(scheme);
    await record.press("Escape");

    await page.locator('.cx-row[data-cx-id="record"]').getByRole("button", { name: "Notes: show complete text" }).click();
    const text = page.locator(".cx-text-dialog");
    await expect(text).toBeVisible();
    expect(await text.evaluate(element => getComputedStyle(element).colorScheme)).toBe(scheme);
    await text.getByRole("button", { name: "Close complete text" }).click();
  });
}

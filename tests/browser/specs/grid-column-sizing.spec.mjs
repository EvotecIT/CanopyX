import { test, expect } from "@playwright/test";
import { runtimeAssets, nextFrames } from "./support.mjs";

// Column sizing for values drawn in their own font or fixed format: monospace identifiers with secondary text, and dates
// and numbers that would read wrong if they were cut short.
function hosts(rows = 12) {
  return { protocol: "canopyx/2", type: "grid", id: "hosts", label: "Hosts", rowHeight: 34, pageSize: 250, selection: "single", search: false,
    columns: [
      { id: "host", title: "Host", kind: "text", rowHeader: true, presenter: { kind: "identifier", mono: true, secondaryColumn: "site" } },
      { id: "site", title: "Site", kind: "text", priority: "optional" },
      { id: "seen", title: "Last seen", kind: "datetime" },
      { id: "latency", title: "Latency", kind: "number", format: { maximumFractionDigits: 1, suffix: " ms" } },
      { id: "owner", title: "Owner", kind: "text" },
      { id: "notes", title: "Notes", kind: "text" }
    ], source: { kind: "inline" },
    rows: Array.from({ length: rows }, (_, i) => ({ id: "h" + i, cells: {
      host: "WWWWMMMM-" + String(1000 + i) + ".corp.example.com", site: "Site " + (i % 4) + " (west)", seen: "2026-09-21T01:2" + (i % 10) + ":00Z",
      latency: 12345.6 + i, owner: "Operations team " + i, notes: "Checked by the nightly run; nothing to report for this host." } })) };
}

async function mount(page, view, { width = 1200, height = 480 } = {}) {
  const { script, style } = runtimeAssets("grid");
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  await page.route("http://canopyx.test/sizing", route => route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>" + style + "</style><script>" + script + "</script></head>" +
    "<body style=\"margin:0;padding:16px\"><div id=\"frame\" style=\"width:" + width + "px;max-width:100%\"><div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\"" +
    " style=\"height:" + height + "px\"><script type=\"application/json\" class=\"cx-config\">" + json + "</script></div></div>" +
    "<script>window.api=()=>document.querySelector('[data-canopyx-host]').canopyx;</script></body></html>" }));
  await page.goto("http://canopyx.test/sizing"); await page.evaluate(() => api().ready); await nextFrames(page);
}
const columnIndex = (page, column) => page.locator(`.cx-hcell[data-cx-column="${column}"]`).getAttribute("aria-colindex");
const cells = async (page, column) => page.locator(`.cx-row [aria-colindex="${await columnIndex(page, column)}"]`);

test("a monospace identifier is measured in its own font, with its secondary text", async ({ page }) => {
  await mount(page, hosts(), { width: 1400 });
  const result = await page.evaluate(() => api().autoFitColumn("host"));
  await nextFrames(page);
  const fit = await (await cells(page, "host")).evaluateAll(items => items.map(cell => {
    const mono = cell.querySelector(".p-mono"), sub = cell.querySelector(".p-sub"), style = getComputedStyle(cell);
    const used = mono.getBoundingClientRect().width + (sub ? parseFloat(getComputedStyle(sub).marginLeft) + sub.getBoundingClientRect().width : 0);
    return { used, room: cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), family: getComputedStyle(mono).fontFamily };
  }));
  expect(fit.length).toBeGreaterThan(0);
  expect(fit[0].family).toMatch(/mono|consolas/i);
  for (const item of fit) expect(item.used).toBeLessThanOrEqual(item.room + 1);
  expect(result.width).toBeGreaterThanOrEqual(Math.ceil(Math.max(...fit.map(item => item.used))));
});

for (const width of [720, 420]) test(`dates and numbers keep their whole value when the panel is short of room (${width})`, async ({ page }) => {
  await mount(page, hosts(), { width });
  const shown = await page.locator(".cx-hcell").evaluateAll(items => items.map(item => item.dataset.cxColumn));
  for (const column of ["seen", "latency"]) if (shown.includes(column)) {
    const texts = await (await cells(page, column)).evaluateAll(items => items.map(cell => { const text = cell.querySelector(".cx-text") || cell; return [text.scrollWidth, text.clientWidth, text.textContent]; }));
    expect(texts.length).toBeGreaterThan(0);
    for (const [scroll, client, text] of texts) { expect(text).not.toContain("…"); expect(scroll).toBeLessThanOrEqual(client + 1); }
  }
  // Text columns give way first; the date column is shown whole, or the grid scrolls, but its value is never cut.
  if (width > 640) expect(shown).toContain("seen");
  // On a phone a column that does not fit whole goes behind the "+N" button rather than being cut.
  else if (!shown.includes("seen") || !shown.includes("latency")) await expect(page.locator(".cx-row .cx-hidden-fields").first()).toBeVisible();
});

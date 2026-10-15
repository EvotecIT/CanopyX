// Time to the first grid rows when a 10,000-row HTML table is enhanced (docs/enhance.md, "Fast first rows"). The table is
// shown before the clock starts, as a page shows it while scripts load; the clock covers loading the parts on first use,
// reading the table, building the grid and painting its first page. The median of three fresh pages decides the budget.
import { expect, test } from "@playwright/test";
import { median } from "./support.mjs";
import { servePage } from "./enhance-support.mjs";

const FIRST_ROWS_MS = 1000;
const ROWS = 10000;

async function measure(browser, warm) {
  const page = await browser.newPage();
  await servePage(page, "<div id='place'></div>");
  await page.evaluate(async ([count, warm]) => {
    const sites = ["Warsaw", "Berlin", "Madrid", "Lisbon"];
    let html = "<table id='big'><caption>Servers</caption><thead><tr><th>Name</th><th>Site</th><th>Load</th><th>Memory</th><th>Patched</th><th>Owner</th></tr></thead><tbody>";
    for (let i = 0; i < count; i++) html += "<tr><td>Server " + i + "</td><td>" + sites[i % 4] + "</td><td data-order='" + i * 37 % 101 + "'>" + i * 37 % 101 + " %</td><td>" +
      (i * 1234).toLocaleString("en") + "</td><td>2024-0" + (1 + i % 9) + "-1" + i % 10 + "</td><td>Team " + i % 17 + "</td></tr>";
    document.getElementById("place").innerHTML = html + "</tbody></table>";
    if (warm) { const host = document.createElement("div"); document.body.appendChild(host); (await CanopyX.grid(host, { data: [{ a: 1 }] })).destroy(); host.remove(); }
  }, [ROWS, warm]);
  // The page shows the table and settles first, as it does while its scripts load: the browser's own work after a large
  // table arrives (layout, paint, and in some browsers a scan of the new page text) is not part of the enhancement.
  // WebKit has no requestIdleCallback; a short timeout stands in for the idle moment there.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() =>
    typeof requestIdleCallback === "function" ? requestIdleCallback(resolve, { timeout: 5000 }) : setTimeout(resolve, 100)))));
  const result = await page.evaluate(async () => {
    const started = performance.now();
    const grid = await CanopyX.enhance("#big");
    await grid.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ms: performance.now() - started, rows: document.querySelectorAll(".cx-row[data-cx-id]").length, matched: grid.getPaging().matched };
  });
  await page.close();
  return result;
}

test("a 10,000-row table shows its first grid rows within budget", async ({ browser }) => {
  const cold = [], warm = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await measure(browser, false);
    expect(first).toMatchObject({ rows: 25, matched: ROWS });
    cold.push(first.ms);
    warm.push((await measure(browser, true)).ms);
  }
  console.log("enhance 10,000 rows, first rows: " + median(cold).toFixed(0) + " ms (parts already loaded: " + median(warm).toFixed(0) + " ms)");
  expect(median(cold)).toBeLessThanOrEqual(FIRST_ROWS_MS);
});

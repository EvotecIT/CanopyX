// A matrix from a server-rendered table (docs/matrix.md#a-table-from-the-server): the table works without script, CanopyX.enhance
// and CanopyX.matrix read the document back from it, cell links stay the way to open a cell, and destroy() puts the table back.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");

// A hand-written table: a band row over the columns, group headings, a totals column and footer the matrix draws itself,
// states read from tones, symbols and titles, a declared value, and links in headers and cells.
const HANDWRITTEN = `<table id="checks" data-view="matrix" data-matrix='{"rows":{"attributes":[{"id":"site","title":"Site","facet":true}],"groupBy":"site"},"columns":{"attributes":[{"id":"tier","title":"Tier"}],"groupBy":"tier"}}'>
<caption>Checks by server</caption>
<thead><tr><th rowspan="2">Server</th><th colspan="2">Core</th><th>Edge</th><th rowspan="2" data-total>Total</th></tr>
<tr><th data-id="dns">DNS</th><th id="ntp"><a href="/services/ntp">Time</a></th><th>Proxy</th></tr></thead>
<tbody><tr><th scope="rowgroup" colspan="5">North</th></tr>
<tr id="alpha"><th>Alpha</th><td data-tone="danger" title="Failing"><a href="#alpha-dns">✕ 3 errors</a></td><td title="Healthy">✓</td><td>·</td><td>1</td></tr>
<tr data-id="beta"><th><a href="/servers/beta">Beta</a></th><td>✓</td><td data-state="late" data-tone="warning" data-symbol="clock" title="Late" data-value="12">12 min</td><td>✓</td><td>1</td></tr></tbody>
<tbody><tr><th scope="rowgroup" colspan="5">South</th></tr>
<tr><th>Gamma</th><td title="Degraded">! check</td><td>✓</td><td>✓</td><td>1</td></tr></tbody>
<tfoot><tr><th>Total</th><td>2</td><td>1</td><td>0</td><td>3</td></tr></tfoot>
</table>`;

async function mountPage(page, body, script = "") {
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Matrix table</title><style>" + asset("canopyx-grid.css") + asset("canopyx-matrix.css") +
    "</style><script>" + asset("canopyx-grid.js") + "\n" + asset("canopyx-matrix.js") + "\n" + asset("canopyx-matrix-table.js") + "</script></head><body style=\"margin:0;padding:16px\">" + body +
    "<script>window.events=[];document.addEventListener('canopyx:matrixCell',e=>events.push(e.detail));" + script + "</script></body></html>";
  await page.route("http://canopyx.test/table", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/table");
}

test("the example table works without script, links each cell and carries what the matrix reads", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(exampleUrl("matrix-table.html"));
  const table = page.locator('#services table[data-view="matrix"]');
  await expect(table.locator("caption")).toHaveText("Services by server");
  await expect(table.locator("tbody tr[data-id]")).toHaveCount(24);
  await expect(table.locator('tr[data-id="srv01"] th a')).toHaveAttribute("href", "#server-srv01");
  await expect(table.locator('tr[data-id="srv01"] td[data-state] a').first()).toHaveAttribute("href", /^#probe-srv01-/);
  await context.close();
});

test("enhance reads the example table into the matrix, hands clicks to the page and puts the table back", async ({ page }) => {
  await page.goto(exampleUrl("matrix-table.html"));
  await page.waitForFunction(() => window.exampleMatrix);
  const grid = page.getByRole("grid", { name: "Services by server" });
  await expect(grid).toBeVisible();
  // The document read from the table holds every server, service, group and link the server wrote.
  const read = await page.evaluate(() => {
    const view = exampleMatrix.view, table = exampleMatrix.table, counts = {};
    for (const cell of table.querySelectorAll("td[data-state]")) counts[cell.dataset.state] = (counts[cell.dataset.state] || 0) + 1;
    return { rows: view.rows.items.length, columns: view.columns.items.length, groupBy: [view.rows.groupBy, view.columns.groupBy], states: view.states.map(state => state.id),
      first: view.rows.items.find(item => item.id === "srv01"), links: view.notes.filter(note => note[6]).length, cells: table.querySelectorAll("td[data-state]").length, counts, attached: table.isConnected };
  });
  expect(read).toMatchObject({ rows: 24, columns: 14, groupBy: ["site", "tier"], states: ["critical", "warning", "paused", "ok", "absent"], attached: false,
    first: { id: "srv01", label: "SRV-OSL-01", href: "#server-srv01", values: { site: "Oslo", role: "Domain controller" } } });
  expect(read.links).toBe(read.cells);
  const legend = await page.locator(".cx-mx-key").allTextContents();
  expect(legend.slice(0, 5)).toEqual([["Critical", "critical"], ["Warning", "warning"], ["In maintenance", "paused"], ["Running", "ok"], ["Not installed", "absent"]].map(([label, id]) => label + (read.counts[id] || 0)));

  // details: "host" hands the click to the page with the cell's link; nothing is followed.
  const target = await page.evaluate(() => { const note = exampleMatrix.view.notes[0]; return [exampleMatrix.view.rows.items[note[0]].id, exampleMatrix.view.columns.items[note[1]].id]; });
  await page.evaluate(([row, column]) => exampleMatrix.focusCell(row, column), target);
  await page.keyboard.press("Enter");
  await expect(page.locator("#picked a")).toHaveAttribute("href", "#probe-" + target[0] + "-" + target[1]);
  await expect(page.locator("dialog.cx-mx-dialog")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");

  // destroy() puts the same table element back, and the page can enhance it again.
  const restored = await page.evaluate(() => { const table = exampleMatrix.table; document.getElementById("toggle").click(); return document.querySelector("#services table") === table && !document.querySelector(".cx-matrix"); });
  expect(restored).toBe(true);
  await page.locator("#toggle").click();
  await expect(grid).toBeVisible();
});

test("a hand-written table: bands and headings group, states come from tones and symbols, and a cell link is followed", async ({ page }) => {
  await mountPage(page, HANDWRITTEN, "CanopyX.enhance('#checks').then(api=>{window.api=api;});");
  await page.waitForFunction(() => window.api);
  const view = await page.evaluate(() => api.view);
  expect(view.label).toBe("Checks by server");
  expect(view.rows.title).toBe("Server");
  expect(view.rows.items).toEqual([{ id: "alpha", label: "Alpha", values: { site: "North" } }, { id: "beta", label: "Beta", href: "/servers/beta", values: { site: "North" } },
    { id: "r3", label: "Gamma", values: { site: "South" } }]);
  expect(view.columns.items).toEqual([{ id: "dns", label: "DNS", values: { tier: "Core" } }, { id: "ntp", label: "Time", href: "/services/ntp", values: { tier: "Core" } },
    { id: "c3", label: "Proxy", values: { tier: "Edge" } }]);
  // Read states follow worst first: danger, then the two warnings in the order they appeared, then success.
  expect(view.states).toEqual([{ id: "danger-cross", label: "Failing", symbol: "cross", attention: true, tone: "danger" },
    { id: "late", label: "Late", symbol: "clock", attention: true, tone: "warning" }, { id: "warning-warning", label: "Degraded", symbol: "warning", attention: true, tone: "warning" },
    { id: "success-check", label: "Healthy", symbol: "check", attention: false, tone: "success" }]);
  expect(view.cells).toEqual(["03.", "313", "233"]);
  expect(view.notes).toEqual([[0, 0, null, "3 errors", null, null, "#alpha-dns"], [1, 1, 12], [2, 0, null, "check"]]);
  await nextFrames(page);
  await expect(page.locator(".cx-mx-summary")).toHaveText("3 × 3 · Need attention: 3");

  // Without details "host", Enter on a cell with a link follows it, as the table's link did.
  await page.evaluate(() => api.focusCell("alpha", "dns"));
  await page.keyboard.press("Enter");
  await expect.poll(() => new URL(page.url()).hash).toBe("#alpha-dns");
  expect(await page.evaluate(() => events.map(event => [event.row, event.column, event.href]))).toEqual([["alpha", "dns", "#alpha-dns"]]);
  await expect(page.locator("dialog.cx-mx-dialog")).toHaveCount(0);
  // A cell without a link opens the details.
  await page.evaluate(() => api.focusCell("beta", "ntp"));
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog.cx-mx-dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(await page.evaluate(() => { const table = api.table; api.destroy(); return document.getElementById("checks") === table && !document.querySelector(".cx-matrix-table"); })).toBe(true);
});

test("CanopyX.matrix maps a square table's columns to its rows by id and skips the self cells", async ({ page }) => {
  const square = `<table id="links" data-view="matrix" data-matrix='{"square":true,"columnTitle":"Source"}'><caption>Replication</caption>
<thead><tr><th>Destination</th><th data-id="dc2">DC2</th><th data-id="dc1">DC1</th></tr></thead>
<tbody><tr data-id="dc1"><th>DC1</th><td data-tone="danger" title="Failing">✕</td><td></td></tr><tr data-id="dc2"><th>DC2</th><td>–</td><td title="Healthy">✓</td></tr></tbody></table>`;
  await mountPage(page, square, "CanopyX.matrix('#links').then(api=>{window.api=api;});");
  await page.waitForFunction(() => window.api);
  const view = await page.evaluate(() => api.view);
  expect(view.columns).toBeUndefined();
  expect(view.rows.items.map(item => item.id)).toEqual(["dc1", "dc2"]);
  // The self cell of DC2 (its dash) is never read.
  expect(view.states.map(state => state.id)).toEqual(["danger-cross", "success-check"]);
  expect(view.cells).toEqual([".0", "1."]);
});

test("a table that does not read as a matrix stays in the page and the promise says why", async ({ page }) => {
  const unsafe = `<table id="bad" data-view="matrix"><caption>Bad</caption><thead><tr><th>Server</th><th>DNS</th></tr></thead>
<tbody><tr><th>Alpha</th><td data-tone="danger" data-href="javascript:alert(1)">✕</td></tr></tbody></table>`;
  await mountPage(page, unsafe);
  const message = await page.evaluate(() => CanopyX.enhance("#bad").then(() => "mounted", error => error.message));
  expect(message).toContain("a cell link is not an http, https, mailto or relative address");
  await expect(page.locator("#bad")).toBeVisible();
  await expect(page.locator(".cx-matrix")).toHaveCount(0);
  expect(await page.evaluate(() => CanopyX.matrix("#bad", { pageLength: 10 }).then(() => "mounted", error => error.message))).toContain("no option 'pageLength'");
});

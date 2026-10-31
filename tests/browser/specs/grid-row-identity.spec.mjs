// Row identity order (docs/data-protocol.md, "Row identity order"): canonical integer ids order as numbers and before every
// other id, so a dataset keyed by numbers keeps its natural order without padding. The shared fixture is also read by C#.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { repo, viewPage } from "./support.mjs";

const fixture = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/row-identity-order.json"), "utf8"));
const columns = [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "group", title: "Group", kind: "text", sortable: true }];
const base = extra => Object.assign({ protocol: "canopyx/2", type: "grid", id: "keys", label: "Keys", rowHeight: 32, pageSize: 50, selection: "none", search: true,
  columns, source: { kind: "inline" } }, extra);
const ids = page => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex")).map(row => row.getAttribute("data-cx-id")));

async function open(page, view, name = "keys") {
  await page.route("http://canopyx.test/" + name, route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/" + name);
  await page.waitForSelector(".cx-row[data-cx-id]");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
}

test("without a sort, rows follow identity order: integers as numbers first, then the other ids", async ({ page }) => {
  await open(page, base({ rows: fixture.ids.map(id => ({ id, cells: { name: "Row " + id, group: "All" } })) }));
  expect(await ids(page)).toEqual(fixture.ordered);
  // Ties of a sort key break by identity too.
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.sort([{ column: "group", direction: "desc" }]));
  await expect.poll(() => ids(page)).toEqual(fixture.ordered);
});

test("numeric keys written in identity order load as ordered row data, and older code-unit order still loads", async ({ page }) => {
  const keys = Array.from({ length: 120 }, (_, i) => String(i));
  const row = id => [id, "Item " + id, "G" + (Number(id) % 3)];
  await open(page, base({ rowData: { version: 1, columns: ["name", "group"], count: keys.length, ordered: true, chunks: [keys.map(row)] } }), "numeric");
  expect((await ids(page)).slice(0, 12)).toEqual(keys.slice(0, 12));
  await page.unrouteAll();
  // An older writer sorted the same keys by code unit ("0", "1", "10", "100", ...): the rows load, in identity order.
  const legacy = [...keys].sort();
  await open(page, base({ rowData: { version: 1, columns: ["name", "group"], count: keys.length, ordered: true, chunks: [legacy.map(row)] } }), "legacy");
  await expect.poll(async () => (await ids(page)).slice(0, 12)).toEqual(keys.slice(0, 12));
});

for (const pending of ["page", "query", "page timeout", "query timeout"]) test("legacy row order replaces cached prefixes and retires a pending " + pending, async ({ page }) => {
  const timeout = pending.endsWith("timeout");
  if (timeout) {
    await page.clock.install({ time: new Date("2026-10-31T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-31T00:00:01Z"));
  }
  // Advance the controlled clock only until the observable request/layout condition settles.
  const until = predicate => expect.poll(async () => {
    if (timeout) await page.clock.runFor(16);
    return page.evaluate(predicate);
  }, { intervals: [0] }).toBe(true);
  const prefix = Array.from({ length: 100 }, (_, index) => String(100 + index));
  const suffix = Array.from({ length: 10 }, (_, index) => String(20 + index));
  const rows = keys => keys.map(id => [id, "Item " + id, "All"]);
  const count = timeout ? 120 : 110;
  const view = base({ rowData: { version: 1, columns: ["name", "group"], count, ordered: true, base: "data/", chunks: timeout ? 3 : 2 } });
  let release, finish;
  const gate = new Promise(resolve => { release = resolve; });
  const finalGate = new Promise(resolve => { finish = resolve; });
  await page.route("http://canopyx.test/**", async route => {
    const file = new URL(route.request().url()).pathname;
    if (file === "/") return route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</body>",
      // The held chunk forces the intended timeout; ordinary setup and recovery requests still need room under parallel browser load.
      '<script>CanopyX.configure("keys",{requestTimeoutMs:' + (timeout ? 2000 : 30000) + '});</script></body>') });
    const index = Number(/rows\/(\d)\.js$/.exec(file)?.[1]);
    if (index === 1) await gate;
    if (index === 2) await finalGate;
    const keys = index === 2 ? Array.from({ length: 10 }, (_, index) => String(30 + index)) : index ? suffix : prefix;
    return route.fulfill({ contentType: "text/javascript", body: '(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(["keys","rows/' + index + '",' + JSON.stringify(rows(keys)) + "]);" });
  });
  await page.goto("http://canopyx.test/", { waitUntil: "domcontentloaded" });
  await until(() => !!document.querySelector(".cx-row[data-cx-id]"));
  await page.evaluate(async () => {
    window.api = document.querySelector("[data-canopyx-host]").canopyx;
    window.errors = [];
    api.element.addEventListener("canopyx:error", event => errors.push(event.detail.error.message));
    await api.ready;
  });
  expect((await ids(page))[0]).toBe("100");
  await page.evaluate(() => { window.positioned = false; api.scrollToRow(75).then(() => { window.positioned = true; }); });
  await until(() => window.positioned);
  await page.evaluate(pending => {
    window.navigation = api.scrollToRow(100).then(() => "accepted", error => error.name).then(result => window.navigationResult = result);
    if (pending.startsWith("query")) window.queryResult = api.sort([{ column: "group", direction: "desc" }]).then(() => "accepted", error => error.name);
  }, pending);
  release();
  if (timeout) {
    await until(() => window.errors.length > 0 && window.navigationResult !== undefined);
    if (pending.startsWith("query")) expect(await page.evaluate(() => window.queryResult)).not.toBe("accepted");
    await page.evaluate(() => { window.errors = []; });
    finish();
  }
  await expect.poll(async () => {
    if (timeout) await page.clock.runFor(16);
    return page.evaluate(count => api.view.rows.length === count && document.querySelector(".cx-data-grid .cx-grid").getAttribute("aria-busy") === "false", count);
  }, { intervals: [0] }).toBe(true);
  await until(() => document.querySelector('.cx-row[data-cx-id="20"]') !== null);
  expect((await ids(page))[0]).toBe("20");
  if (pending === "query") expect(await page.evaluate(() => window.queryResult)).toBe("accepted");
  await page.evaluate(() => { window.positioned = false; api.scrollToRow(100).then(() => { window.positioned = true; }); });
  await until(() => window.positioned);
  await expect(page.locator('.cx-row[data-cx-id="' + (timeout ? "180" : "190") + '"]')).toHaveAttribute("aria-rowindex", "102");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

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

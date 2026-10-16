import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const drawer = page => page.locator("dialog.cx-drawer");
const leaf = "Boundary value";
const columns = [{ id: "name", title: "Name", kind: "text" }, { id: "value", title: "Value", kind: "text", presenter: { kind: "structured" } }];
function objects(levels, value = leaf) {
  for (let at = 0; at < levels; at++) value = { fields: [{ name: "Level " + (levels - at), value }] };
  return value;
}
const collection = row => ({ records: { columns, rows: [row] } });
const treeCollection = root => ({ records: { columns, roots: [root] } });
const rowWith = (value, fields = false) => ({ id: "nested", cells: { name: "Nested", ...(!fields && { value }) }, ...(fields && { fields: { value } }) });
function hierarchy(levels, value, fields = false) {
  let node = { ...rowWith(value, fields), label: "Leaf" };
  for (let at = 0; at < levels; at++) node = { id: "ancestor" + at, label: "Ancestor " + at, cells: { name: "Ancestor" }, children: [node] };
  return node;
}

// Exercise the actual gridRecord reader, including the three public provider routes and a tree's loadRecord hook.
async function openPayload(page, doc, mode = "loader", more = null) {
  const tree = mode === "tree", row = { id: "r", cells: { name: "Record" }, ...(tree && { label: "Record" }) };
  const view = { protocol: "canopyx/2", type: tree ? "view" : "grid", id: "depth", label: "Depth", rowHeight: 32, pageSize: 100, selection: "none",
    columns, source: { kind: mode === "hosted" ? "host" : "inline" }, record: { fields: [{ id: "data", title: "Data" }],
      source: mode === "sidecar" ? { kind: "sidecar", base: "records/", shards: 1 } : { kind: "host" } },
    ...(mode === "hosted" ? {} : tree ? { roots: [row] } : { rows: [row] }) };
  const answer = { protocol: "canopyx/2", type: "gridRecord", view: "depth", id: "r", ...doc };
  let setup = `window.recordErrors = []; document.addEventListener("canopyx:error", event => window.recordErrors.push(event.detail.error.message), true);`;
  if (mode !== "sidecar") {
    setup += `const answer = ${JSON.stringify(answer)}, more = ${JSON.stringify(more)};
      const record = request => request.field ? more : answer;
      CanopyX.configure("depth", ${mode === "hosted" ? `{ source: { query: () => ({ protocol: "canopyx/2", type: "gridPage", view: "depth", revision: "r1", offset: 0, total: 1, matched: 1, items: [${JSON.stringify(row)}] }), record } }` : "{ loadRecord: record }"});`;
  } else {
    await page.route("http://canopyx.test/records/r0.js", route => route.fulfill({ contentType: "text/javascript",
      body: `CanopyXSidecar.push(["depth", "r0", ${JSON.stringify({ protocol: "canopyx/2", type: "gridRecordPack", view: "depth", records: [answer] })}]);` }));
  }
  const html = viewPage(view).replace('<body class="cx-page">', '<body class="cx-page"><script>' + setup + '</script>');
  await page.route("http://canopyx.test/depth.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/depth.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('r')");
  await expect(drawer(page).locator(".cx-record-note:not(.cx-record-error)")).toHaveCount(0);
}
async function accepted(page) {
  await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-mounted]")].map(host => host.canopyx?.ready)));
  await expect(drawer(page).locator(".cx-record-error")).toHaveCount(0);
  expect(await page.evaluate("window.recordErrors")).toEqual([]);
}
async function rejected(page) {
  await expect(drawer(page).getByRole("alert")).toContainText("structured values nest at most 8 levels");
  await expect(drawer(page).getByRole("button", { name: "Retry" })).toBeVisible();
  expect(await page.evaluate("window.recordErrors")).toEqual(["CanopyX: structured values nest at most 8 levels."]);
  await expect(drawer(page).getByText(leaf, { exact: true })).toHaveCount(0);
}

for (const mode of ["loader", "hosted", "sidecar", "tree"]) test("record depth: " + mode + " accepts eight levels and rejects nine before rendering", async ({ page }) => {
  const failures = []; page.on("pageerror", error => failures.push(error.message));
  await openPayload(page, { fields: { data: objects(8) } }, mode);
  await accepted(page);
  await expect(drawer(page).getByText(leaf, { exact: true })).toBeVisible();
  await openPayload(page, { fields: { data: objects(9) } }, mode);
  await rejected(page);
  expect(failures).toEqual([]);
});

// Match Core's semantic depth: wrappers and property/table detail do not add levels; collections and grid/tree detail do.
const cases = {
  items: depth => ({ fields: { data: objects(depth - 1, { items: [leaf] }) } }),
  changes: depth => ({ fields: { data: objects(depth - 1, { changes: [{ name: "Changed", before: leaf, after: leaf }] }) } }),
  timeline: depth => ({ fields: { data: objects(depth - 1, { events: [{ time: "2026-10-16T00:00:00Z", summary: "Changed", changes: [{ name: "Changed", before: leaf, after: leaf }] }] }) } }),
  cells: depth => ({ cells: { value: objects(depth) } }),
  rowCells: depth => ({ row: { id: "r", cells: { name: "Record", value: objects(depth) } } }),
  rowFields: depth => ({ row: { id: "r", cells: { name: "Record" }, fields: { data: objects(depth) } } }),
  collectionCells: depth => ({ fields: { data: collection(rowWith(objects(depth - 1))) } }),
  collectionFields: depth => ({ fields: { data: collection(rowWith(objects(depth - 1), true)) } }),
  nodeCells: depth => ({ fields: { data: treeCollection(hierarchy(12, objects(depth - 1))) } }),
  nodeFields: depth => ({ fields: { data: treeCollection(hierarchy(12, objects(depth - 1), true)) } }),
  properties: depth => ({ fields: { data: collection({ ...rowWith(null), detail: { type: "properties", items: [{ name: "Property", value: objects(depth - 1) }] } }) } }),
  table: depth => ({ fields: { data: collection({ ...rowWith(null), detail: { type: "table", columns: ["Value"], rows: [[objects(depth - 1)]] } }) } }),
  gridDetail: depth => ({ fields: { data: collection({ ...rowWith(null), detail: { type: "grid", rows: [rowWith(objects(depth - 2), true)] } }) } }),
  treeDetail: depth => ({ fields: { data: collection({ ...rowWith(null), detail: { type: "tree", roots: [hierarchy(12, objects(depth - 2))] } }) } }),
  loadedRowDetail: depth => ({ row: { ...rowWith(null), id: "r", detail: { type: "properties", items: [{ name: "Property", value: objects(depth) }] } } })
};
for (const [name, payload] of Object.entries(cases)) test("record depth: " + name + " continues the enclosing value depth", async ({ page }) => {
  await openPayload(page, payload(8));
  await accepted(page);
  await openPayload(page, payload(9));
  await rejected(page);
});

test("record depth: a seventy-level tree hierarchy does not consume structured value depth", async ({ page }) => {
  await openPayload(page, { fields: { data: treeCollection(hierarchy(70, objects(7))) } });
  await accepted(page);
  await expect(drawer(page).locator(".cx-record-nested-tree")).toBeVisible();
});

test("record depth: collection paging rejects an over-deep response and preserves the accepted rows", async ({ page }) => {
  const data = collection(rowWith("Initial")); data.records.total = 2;
  const next = { protocol: "canopyx/2", type: "gridRecord", view: "depth", id: "r", fields: { data: collection(rowWith(objects(8))) } };
  await openPayload(page, { fields: { data } }, "loader", next);
  await accepted(page);
  await drawer(page).getByRole("button", { name: "Load more" }).click();
  await expect(drawer(page).locator(".cx-record-live")).toContainText("structured values nest at most 8 levels");
  await expect(drawer(page).getByRole("button", { name: "Load more" })).toBeEnabled();
  await expect(drawer(page).locator(".cx-record-nested .cx-row[data-cx-id]")).toHaveCount(1);
});

async function readableValue(page) {
  const text = drawer(page).getByText(leaf, { exact: true });
  await expect(text).toBeVisible();
  const geometry = await text.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const dialog = element.closest("dialog").getBoundingClientRect();
    return { left: dialog.left, right: dialog.right, lines: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, width: rect.width })) };
  });
  // Two ordinary words fit on at most two lines and stay inside the drawer, rather than one letter per line offscreen.
  expect(geometry.lines.length).toBeLessThanOrEqual(2);
  expect(Math.max(...geometry.lines.map(line => line.width))).toBeGreaterThan(60);
  for (const line of geometry.lines) { expect(line.left).toBeGreaterThanOrEqual(geometry.left + 8); expect(line.right).toBeLessThanOrEqual(geometry.right - 8); }
  for (const name of ["Close record details", "Record actions"]) {
    const control = await drawer(page).getByRole("button", { name, exact: true }).boundingBox();
    expect(control.x).toBeGreaterThanOrEqual(geometry.left); expect(control.x + control.width).toBeLessThanOrEqual(geometry.right);
  }
}
for (const theme of ["light", "dark"]) test("record value layout: nested properties remain readable in " + theme + " wide and narrow drawers and phones", async ({ page }) => {
  await openPayload(page, { fields: { data: objects(2) } });
  await page.locator("[data-canopyx-host]").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
  await accepted(page);
  const first = drawer(page).locator(".cx-record-object").first();
  const term = await first.locator(":scope > dt").boundingBox(), value = await first.locator(":scope > dd").boundingBox();
  expect(value.x).toBeGreaterThan(term.x + 90); expect(Math.abs(term.y - value.y)).toBeLessThan(3);
  await readableValue(page);
  await openPayload(page, { fields: { data: objects(8) } });
  await page.locator("[data-canopyx-host]").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
  await accepted(page); await readableValue(page);
  // A narrow embedded drawer must adapt even while the viewport and mouse layout remain wide.
  await drawer(page).evaluate(dialog => { dialog.style.width = "320px"; dialog.style.maxWidth = "320px"; });
  await readableValue(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPayload(page, { fields: { data: objects(8) } });
  await page.locator("[data-canopyx-host]").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
  await accepted(page); await readableValue(page);
});

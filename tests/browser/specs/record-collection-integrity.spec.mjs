import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const row = id => ({ id, cells: { key: id, name: "Record " + id } });
const columns = [{ id: "key", title: "Key", kind: "text" }, { id: "name", title: "Name", kind: "text" }];
const collection = page => page.locator('dialog.cx-drawer .cx-record-block-b[data-cx-field="related"]');
const entries = page => collection(page).locator('.cx-record-nested .cx-row[data-cx-id], .cx-record-card');
const all = page => collection(page).getByRole("button", { name: "Open all in grid" });
const more = page => collection(page).getByRole("button", { name: "Load more", exact: true });
const runtime = new WeakMap();
test.beforeEach(({ page }) => {
  const events = { console: [], pageErrors: [] }; runtime.set(page, events);
  page.on("console", message => events.console.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", error => events.pageErrors.push(error.message));
});
test.afterEach(async ({ page }, testInfo) => {
  const events = runtime.get(page);
  await testInfo.attach("collection-runtime", { body: JSON.stringify(events), contentType: "application/json" });
  expect(events.pageErrors).toEqual([]);
});

async function openCollection(page, list, pages = [], theme = "light", options = {}) {
  const view = { protocol: "canopyx/2", type: "grid", id: "collection-target", label: "Records", rowHeight: 34,
    pageSize: 100, selection: "none", search: false, columns: [{ id: "key", title: "Key", kind: "text" }, { id: "name", title: "Name", kind: "text" }],
    record: { source: { kind: "host" }, fields: [{ id: "related", title: "Related records" }], hideEmpty: options.hideEmpty ?? true },
    source: { kind: "inline" }, rows: options.targetRows || ["a", "b", "c", "d"].map(row) };
  if (options.tree) {
    view.type = "view";
    view.roots = view.rows.map(item => ({ ...item, label: item.cells.name }));
    delete view.rows;
  }
  const script = `<script>
    window.collectionRequests = []; window.collectionErrors = []; window.collectionOpenAll = [];
    const list = ${JSON.stringify({ columns, ...list })}, pages = ${JSON.stringify(pages)};
    CanopyX.configure("collection-target", { async loadRecord(request) {
      window.collectionRequests.push(request);
      const records = request.field ? pages.shift() : list;
      return { protocol: "canopyx/2", type: "gridRecord", view: request.view, id: request.id,
        fields: { related: { records } } };
    }, onError: ({ error }) => window.collectionErrors.push(error.message),
      onOpenAll: detail => { window.collectionOpenAll.push(detail); ${options.takeOver ? "return false;" : ""} } });
    </script>`;
  const html = viewPage(view).replace('<body class="cx-page">', '<body class="cx-page">' + script)
    .replace('data-cx-theme="light"', `data-cx-theme="${theme}"`);
  await page.route("http://canopyx.test/collection-integrity.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/collection-integrity.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('a')");
  await expect.poll(() => page.evaluate("window.collectionRequests.length"), { message: "The configured record loader must run" }).toBe(1);
  await expect(collection(page)).toBeVisible();
  if (list.roots) await expect(collection(page).locator(".cx-record-nested[data-cx-ready]")).toHaveCount(1);
  else await expect(entries(page), JSON.stringify(await page.evaluate("window.collectionErrors"))).toHaveCount(Math.min(list.rows.length, list.pageLength || 10));
}

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`an incomplete ID-based collection opens all only after its last page (${width}, ${theme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openCollection(page, { rows: [row("b")], total: 3, pageSize: 2,
      target: { view: "collection-target", column: "key" } }, [{ rows: [row("c"), row("d")], total: 3 }], theme);
    await expect(all(page)).toBeDisabled();
    await expect(collection(page).locator(".cx-record-count")).toHaveText("1 of 3");
    expect(await page.evaluate("window.collectionOpenAll")).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("incomplete-collection.png") });
    await more(page).click();
    await expect(entries(page)).toHaveCount(3);
    await expect(all(page)).toBeEnabled();
    await expect(more(page)).toHaveCount(0);
    await all(page).click();
    await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
    await expect(page.locator('[data-canopyx-host] .cx-row[data-cx-id]')).toHaveCount(3);
    expect(await page.evaluate("window.collectionOpenAll[0]")).toMatchObject({ ids: ["b", "c", "d"], total: 3,
      filters: [{ column: "key", operator: "in", values: ["b", "c", "d"] }] });
  });
}

for (const target of [
  { view: "collection-target", column: "key", values: ["b", "c", "d"] },
  { view: "collection-target", filters: [{ column: "key", operator: "in", values: ["b", "c", "d"] }] }
]) test(`an explicit whole-collection ${target.filters ? "filter" : "value list"} opens all before loading more`, async ({ page }) => {
  await openCollection(page, { rows: [row("b")], total: 3, target });
  await expect(all(page)).toBeEnabled();
  await all(page).click();
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
  await expect(page.locator('[data-canopyx-host] .cx-row[data-cx-id]')).toHaveCount(3);
  expect(await page.evaluate("window.collectionOpenAll[0]")).toMatchObject({ ids: ["b"], total: 3,
    filters: [{ column: "key", operator: "in", values: ["b", "c", "d"] }] });
});

for (const empty of [{ values: [] }, { filters: [] }]) test(`an empty target ${Object.keys(empty)[0]} uses complete collection IDs`, async ({ page }) => {
  await openCollection(page, { rows: [row("b")], total: 2, pageSize: 1,
    target: { view: "collection-target", column: "key", ...empty } }, [{ rows: [row("c")], total: 2 }]);
  await expect(all(page)).toBeDisabled();
  await more(page).click();
  await expect(entries(page)).toHaveCount(2);
  await all(page).click();
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
  expect(await page.evaluate("window.collectionOpenAll[0].filters")).toEqual([{ column: "key", operator: "in", values: ["b", "c"] }]);
});

test("a complete tree collection opens every root and inline descendant", async ({ page }) => {
  await openCollection(page, { roots: [{ ...row("b"), label: "Record b", expanded: true,
    children: [{ ...row("c"), label: "Record c" }] }, { ...row("d"), label: "Record d" }], total: 2,
    target: { view: "collection-target", column: "key" } });
  await expect(all(page)).toBeEnabled();
  await all(page).click();
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
  expect(await page.evaluate("window.collectionOpenAll[0]")).toMatchObject({ ids: ["b", "c", "d"], total: 2,
    filters: [{ column: "key", operator: "in", values: ["b", "c", "d"] }] });
});

test("an inline collection without total opens its complete ID set", async ({ page }) => {
  await openCollection(page, { rows: [row("b"), row("c")], target: { view: "collection-target", column: "key" } });
  await expect(all(page)).toBeEnabled();
  await all(page).click();
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
  expect(await page.evaluate("window.collectionOpenAll[0]")).toMatchObject({ ids: ["b", "c"], total: 2 });
});

for (const [name, bad] of [
  ["duplicate IDs in one page", { rows: [row("b"), row("b"), row("c")], total: 4 }],
  ["an ID already loaded", { rows: [row("a"), row("b")], total: 4 }],
  ["an invalid row identity", { rows: [row("b"), { id: "", cells: { name: "Invalid" } }], total: 4 }],
  ["a total below the combined rows", { rows: [row("b"), row("c")], total: 2 }],
  ["an empty page before the known total", { rows: [], total: 4 }],
  ["an empty page with omitted total", { rows: [] }]
]) test(`a collection rejects ${name} atomically and retries the same offset`, async ({ page }) => {
  await openCollection(page, { rows: [row("a")], total: 4, pageSize: 3,
    target: { view: "collection-target", column: "key" } }, [bad, { rows: [row("b"), row("c"), row("d")], total: 4 }]);
  await more(page).click();
  await expect(page.locator("dialog.cx-drawer .cx-record-live")).toContainText("Could not load");
  await expect(more(page)).toBeEnabled();
  await expect(entries(page)).toHaveCount(1);
  await expect(collection(page).locator(".cx-record-count")).toHaveText("1 of 4");
  await expect(all(page)).toBeDisabled();
  await more(page).click();
  await expect(entries(page)).toHaveCount(4);
  await expect(more(page)).toHaveCount(0);
  expect(await page.evaluate("window.collectionRequests.filter(request => request.field).map(request => request.offset)")).toEqual([1, 1]);
  await all(page).click();
  expect(await page.evaluate("window.collectionOpenAll[0].ids")).toEqual(["a", "b", "c", "d"]);
});

test("a valid page retains an omitted total and a later explicit end can complete the collection", async ({ page }) => {
  await openCollection(page, { rows: [row("a")], total: 4, pageSize: 2,
    target: { view: "collection-target", column: "key" } }, [{ rows: [row("b"), row("c")] }, { rows: [], total: 3 }]);
  await more(page).click();
  await expect(entries(page)).toHaveCount(3);
  await expect(collection(page).locator(".cx-record-count")).toHaveText("3 of 4");
  await expect(all(page)).toBeDisabled();
  await more(page).click();
  await expect(more(page)).toHaveCount(0);
  await expect(all(page)).toBeEnabled();
  expect(await page.evaluate("window.collectionRequests.filter(request => request.field).map(request => request.offset)")).toEqual([1, 3]);
  expect(await page.evaluate("window.collectionErrors")).toEqual([]);
});

for (const [name, total] of [["omitted", undefined], ["null", null]]) {
  test(`an overfull page with ${name} total retains the accepted count and retry offset`, async ({ page }) => {
    await openCollection(page, { rows: [row("a")], total: 4, pageSize: 4,
      target: { view: "collection-target", column: "key" } }, [
      { rows: [row("b"), row("c"), row("d"), row("e")], total }, { rows: [row("b"), row("c"), row("d")] }]);
    await more(page).click();
    await expect(page.locator("dialog.cx-drawer .cx-record-live")).toContainText("Could not load");
    await expect(entries(page)).toHaveCount(1);
    await expect(collection(page).locator(".cx-record-count")).toHaveText("1 of 4");
    await expect(all(page)).toBeDisabled();
    await more(page).click();
    await expect(entries(page)).toHaveCount(4);
    await expect(more(page)).toHaveCount(0);
    expect(await page.evaluate("window.collectionRequests.filter(request => request.field).map(request => request.offset)")).toEqual([1, 1]);
  });
}

test("an explicit revised total accepts legitimate collection growth", async ({ page }) => {
  await openCollection(page, { rows: [row("a")], total: 4, pageSize: 4,
    target: { view: "collection-target", column: "key" } }, [{ rows: [row("b"), row("c"), row("d"), row("e")], total: 5 }]);
  await more(page).click();
  await expect(entries(page)).toHaveCount(5);
  await expect(more(page)).toHaveCount(0);
  await expect(all(page)).toBeEnabled();
  expect(await page.evaluate("window.collectionErrors")).toEqual([]);
});

for (const shape of ["rows", "roots"]) for (const length of [1000, 1001]) {
  test(`an implicit ${shape} collection respects the membership boundary at ${length} IDs`, async ({ page }) => {
    const rows = Array.from({ length }, (_, at) => row("r" + at));
    const list = shape === "roots" ? { roots: [{ ...rows[0], label: "Root", children: rows.slice(1).map(item => ({ ...item, label: item.id })) }] } : { rows };
    await openCollection(page, { ...list, target: { view: "collection-target", column: "key" } }, [], "light");
    if (length === 1001) {
      await expect(all(page)).toBeDisabled();
      expect(await page.evaluate("window.collectionOpenAll")).toEqual([]);
      expect(await page.evaluate(api + ".getQuery().filters")).toEqual([]);
    } else {
      await expect(all(page)).toBeEnabled();
      await all(page).click();
      await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
      expect(await page.evaluate("window.collectionOpenAll[0].ids")).toEqual(rows.map(item => item.id));
      expect(await page.evaluate(api + ".getQuery().filters[0].values.length")).toBe(1000);
    }
    expect(await page.evaluate("window.collectionErrors")).toEqual([]);
  });
}

test("an empty visible collection does not offer an empty membership condition", async ({ page }) => {
  await openCollection(page, { rows: [], total: 0, target: { view: "collection-target", column: "key" } }, [], "light", { hideEmpty: false });
  await expect(all(page)).toBeDisabled();
  expect(await page.evaluate("window.collectionOpenAll")).toEqual([]);
  expect(await page.evaluate("window.collectionErrors")).toEqual([]);
});

for (const mode of ["filters", "values", "host"]) {
  test(`an authoritative ${mode} route remains available above the implicit membership bound`, async ({ page }) => {
    const rows = Array.from({ length: 1001 }, (_, at) => ({ ...row("r" + at), cells: { key: "r" + at, name: "Related" } }));
    const target = { view: "collection-target", ...(mode === "filters" ? { filters: [{ column: "name", operator: "eq", values: ["Related"] }] } :
      mode === "values" ? { column: "name", values: ["Related"] } : {}) };
    await openCollection(page, { rows, target }, [], "light", { targetRows: [row("a"), ...rows], takeOver: mode === "host" });
    await expect(all(page)).toBeEnabled();
    await all(page).click();
    if (mode === "host") {
      await expect(page.locator("dialog.cx-drawer")).toBeVisible();
      expect(await page.evaluate("window.collectionOpenAll[0].filters")).toBeNull();
      expect(await page.evaluate(api + ".getQuery().filters")).toEqual([]);
    } else {
      await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
      expect(await page.evaluate(api + ".getQuery().filters[0].values")).toEqual(["Related"]);
    }
    expect(await page.evaluate("window.collectionOpenAll[0].ids.length")).toBe(1001);
    expect(await page.evaluate("window.collectionErrors")).toEqual([]);
  });
}

for (const width of [390, 1440]) for (const [name, malformed] of [
  ["null cells", { id: "c", cells: null }],
  ["array cells", { id: "c", cells: [] }],
  ["an undeclared column", { id: "c", cells: { other: "Invalid" } }],
  ["a malformed cell", { id: "c", cells: { name: { value: "Record c", text: 7 } } }],
  ["an invalid row decoration", { ...row("c"), tone: "INVALID" }]
]) test(`a page containing ${name} is rejected before mutation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openCollection(page, { rows: [row("a")], total: 3, pageSize: 2,
    target: { view: "collection-target", column: "key" } }, [
    { rows: [row("b"), malformed], total: 3 }, { rows: [row("b"), row("c")], total: 3 }]);
  await more(page).click();
  await expect(page.locator("dialog.cx-drawer .cx-record-live")).toContainText("Could not load");
  await expect(entries(page)).toHaveCount(1);
  await expect(collection(page).locator(".cx-record-count")).toHaveText("1 of 3");
  await expect(more(page)).toBeEnabled();
  await expect(all(page)).toBeDisabled();
  await more(page).click();
  await expect(entries(page)).toHaveCount(3);
  await expect(more(page)).toHaveCount(0);
  expect(await page.evaluate("window.collectionRequests.filter(request => request.field).map(request => request.offset)")).toEqual([1, 1]);
});

for (const [name, width, malformed] of [
  ["null cells", 390, { id: "c", cells: null }],
  ["null cells", 1440, { id: "c", cells: null }],
  ["an undeclared column", 1440, { id: "c", cells: { other: "Invalid" } }],
  ["a malformed cell", 1440, { id: "c", cells: { name: { value: "Record c", text: 7 } } }],
  ["an invalid row decoration", 1440, { ...row("c"), tone: "INVALID" }]
]) test(`a tree-only collection rejects ${name} before mutation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openCollection(page, { rows: [row("a")], total: 3, pageSize: 2,
    target: { view: "collection-target", column: "key" } }, [
    { rows: [row("b"), malformed], total: 3 }, { rows: [row("b"), row("c")], total: 3 }], "light", { tree: true });
  await more(page).click();
  await expect(page.locator("dialog.cx-drawer .cx-record-live")).toContainText("Could not load");
  await expect(entries(page)).toHaveCount(1);
  await expect(collection(page).locator(".cx-record-count")).toHaveText("1 of 3");
  await expect(more(page)).toBeEnabled();
  await more(page).click();
  await expect(entries(page)).toHaveCount(3);
  await expect(more(page)).toHaveCount(0);
  expect(await page.evaluate("window.collectionRequests.filter(request => request.field).map(request => request.offset)")).toEqual([1, 1]);
});

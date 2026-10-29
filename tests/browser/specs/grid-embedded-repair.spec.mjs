import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { viewPage, repo } from "./support.mjs";

const columns = [{ id: "name", title: "Name", kind: "text", width: 180 }, { id: "size", title: "Size", kind: "number", width: 100 },
  { id: "seen", title: "Seen", kind: "datetime", width: 200 }];
const grid = rows => ({ protocol: "canopyx/2", type: "grid", id: "repair", label: "Repair", source: { kind: "inline" }, rowHeight: 28, pageSize: 100,
  selection: "single", columns, rows });

async function open(page, view, host = "") {
  const warnings = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.route("http://canopyx.test/grid", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("data-canopyx-host data-cx-theme", "data-canopyx-host" + host + " data-cx-theme") }));
  await page.goto("http://canopyx.test/grid"); await page.waitForSelector("[data-cx-ready]");
  return warnings;
}

test("a mistyped cell is repaired and reported once per column instead of blanking the grid", async ({ page }) => {
  const warnings = await open(page, grid([
    { id: "a", cells: { name: 42, size: "17", seen: "2026-10-16T10:00:00Z" } },
    { id: "b", cells: { name: { value: 7, text: "Seven", tone: "success" }, size: "n/a", seen: "yesterday" } },
    { id: "c", cells: { name: ["not", "a", "cell"], size: 3, extra: "dropped" } },
    { id: "d", cells: { name: "Plain", size: 5 } }]));

  await expect(page.locator(".cx-canvas .cx-row")).toHaveCount(4);
  const rows = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.map(row => row.cells));
  expect(rows[0]).toMatchObject({ name: "42", size: 17 });
  expect(rows[1].name).toEqual({ value: "7", text: "Seven", tone: "success" });
  expect(rows[1].size).toEqual({ value: null, text: "n/a" });
  expect(rows[1].seen).toEqual({ value: null, text: "yesterday" });
  expect(rows[2].name).toBeNull();
  expect(rows[2]).not.toHaveProperty("extra");
  await expect(page.locator(".cx-canvas")).toContainText("Seven");
  await expect(page.locator(".cx-canvas")).toContainText("n/a");

  expect(warnings.filter(text => text.startsWith("CanopyX:")).sort()).toEqual([
    "CanopyX: 1 cell(s) in column extra did not fit the column and were coerced, emptied or dropped (first row c).",
    "CanopyX: 1 cell(s) in column seen did not fit the column and were coerced, emptied or dropped (first row b).",
    "CanopyX: 2 cell(s) in column size did not fit the column and were coerced, emptied or dropped (first row a).",
    "CanopyX: 3 cell(s) in column name did not fit the column and were coerced, emptied or dropped (first row a)."]);
});

test("repair leaves frozen inline rows untouched and keeps unsafe numbers out of text cells", async ({ page }) => {
  const warnings = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  const view = grid([]); delete view.rows;
  // The host keeps its own frozen rows; repair must not write into them, and the grid still opens with the repaired copies.
  const setup = "<script>window.source = Object.freeze([Object.freeze({ id: 'a', cells: Object.freeze({ name: 42, size: '17' }) })," +
    " Object.freeze({ id: 'b', cells: Object.freeze({ name: 2 ** 60, size: 5 }) })]);</script>";
  await page.route("http://canopyx.test/frozen", route => route.fulfill({ contentType: "text/html", body: viewPage(grid([]))
    .replace(/<div class="cx-host"[\s\S]*<\/div><\/body>/, "<div id=\"frozen\"></div></body>").replace("</head>", setup + "</head>") }));
  await page.goto("http://canopyx.test/frozen");
  const result = await page.evaluate(view => {
    const api = CanopyX.createDataGrid(document.getElementById("frozen"), { view: { ...view, rows: window.source } });
    return { rows: api.view.rows.map(row => row.cells), source: window.source.map(row => row.cells) };
  }, view);
  expect(result.source).toEqual([{ name: 42, size: "17" }, { name: 2 ** 60, size: 5 }]);
  expect(result.rows[0]).toEqual({ name: "42", size: 17 });
  expect(result.rows[1].name).toBeNull();
  expect(warnings.filter(text => text.startsWith("CanopyX:")).sort()).toEqual([
    "CanopyX: 1 cell(s) in column size did not fit the column and were coerced, emptied or dropped (first row a).",
    "CanopyX: 2 cell(s) in column name did not fit the column and were coerced, emptied or dropped (first row a)."]);
});

test("a host page with a non-finite number reports its repair", async ({ page }) => {
  const view = { ...grid(undefined), source: { kind: "host" } }; delete view.rows;
  const setup = "<script>CanopyX.configure('repair', { source: { query(query) { const items = [{ id: 'a', cells: { name: 'A', size: NaN } }, { id: 'b', cells: { name: 'B', size: Infinity } }];" +
    " return { protocol: 'canopyx/2', type: 'gridPage', view: 'repair', revision: 'r1', offset: query.offset, total: 2, matched: 2, items }; } } });</script>";
  const warnings = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.route("http://canopyx.test/hosted", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
  await page.goto("http://canopyx.test/hosted"); await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator(".cx-canvas .cx-row")).toHaveCount(2);
  expect(warnings.filter(text => text.startsWith("CanopyX:"))).toEqual([
    "CanopyX: 2 cell(s) in column size did not fit the column and were coerced, emptied or dropped (first row a)."]);
});

test("embedded chrome draws no frame of its own and insets the toolbar by the card padding", async ({ page }) => {
  await open(page, grid([{ id: "a", cells: { name: "Plain", size: 5 } }]), " data-cx-chrome=\"embedded\" style=\"--hfx-card-padding-x:24px\"");
  const embedded = await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), style = getComputedStyle(host), toolbar = getComputedStyle(host.querySelector(".cx-toolbar"));
    const body = getComputedStyle(host.querySelector(".cx-grid")), first = host.querySelector(".cx-hrow > :first-child");
    if (getComputedStyle(first).paddingInlineStart !== "24px") return "the first column does not start at the card inset";
    return { border: style.borderTopWidth, radius: style.borderTopLeftRadius, background: style.backgroundColor, inset: toolbar.paddingLeft,
      gridSides: [body.borderLeftWidth, body.borderRightWidth, body.borderBottomWidth], gridRadius: body.borderTopLeftRadius, gridBackground: body.backgroundColor };
  });
  expect(embedded).toEqual({ border: "0px", radius: "0px", background: "rgba(0, 0, 0, 0)", inset: "24px", gridSides: ["0px", "0px", "0px"], gridRadius: "0px",
    gridBackground: "rgba(0, 0, 0, 0)" });
});

test("embedded pinned cells and headers follow a distinct live card surface", async ({ page }) => {
  const view = grid([{ id: "a", cells: { name: "Plain", size: 5 } }]);
  view.reporting = { layout: { name: { minimum: 100, maximum: 300, pin: "left" } } };
  await open(page, view, ' data-cx-chrome="embedded"');
  await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), card = document.createElement("article");
    card.id = "card"; card.style.cssText = "--hfx-color-surface:#080c10;--hfx-color-surface-raised:#243848;background:var(--hfx-color-surface-raised)";
    host.before(card); card.append(host);
  });
  const pinned = page.locator('.cx-canvas .cx-cell[data-cx-pin="left"]').first();
  for (const surface of ["rgb(36, 56, 72)", "rgb(58, 45, 75)"]) {
    if (surface === "rgb(58, 45, 75)") await page.locator("#card").evaluate(card => card.style.setProperty("--hfx-color-surface-raised", "#3a2d4b"));
    await expect(pinned).toHaveCSS("background-color", surface);
    const header = await page.locator(".cx-hrow").evaluate(element => getComputedStyle(element).backgroundColor);
    await expect(page.locator('.cx-hcell[data-cx-pin="left"]')).toHaveCSS("background-color", header);
    expect(header).not.toBe("rgb(8, 12, 16)");
  }
  expect(await page.locator("[data-canopyx-host]").evaluate(host => [...host.style].some(name => name.startsWith("--hfx-")))).toBe(false);
});

test("an empty embedded grid shows its empty state on the card surface", async ({ page }) => {
  await open(page, grid([]), " data-cx-chrome=\"embedded\"");
  // Every layer between the empty state and the card is see-through, so no panel of another colour shows behind it.
  const layers = await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), notice = host.querySelector(".cx-grid-notice:not([hidden])") ?? host.querySelector(".cx-row.cx-status");
    const colours = []; for (let element = notice; element && element !== host.parentElement; element = element.parentElement) colours.push(getComputedStyle(element).backgroundColor);
    return { found: !!notice, colours };
  });
  expect(layers.found).toBe(true);
  expect(new Set(layers.colours)).toEqual(new Set(["rgba(0, 0, 0, 0)"]));
});

test("embedded rows show the card surface and keep their selected colour", async ({ page }) => {
  await open(page, grid([{ id: "a", cells: { name: "One", size: 1 } }, { id: "b", cells: { name: "Two", size: 2 } }]), " data-cx-chrome=\"embedded\"");
  const row = page.locator(".cx-canvas .cx-row").first();
  expect(await row.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // The transparent rule must not outrank the row states that paint their own colour.
  expect(await row.evaluate(element => { element.setAttribute("aria-selected", "true"); return getComputedStyle(element).backgroundColor; })).not.toBe("rgba(0, 0, 0, 0)");
});

test("an embedded tree insets its header and rows by the card padding", async ({ page }) => {
  const tree = { protocol: "canopyx/2", type: "view", id: "tree", label: "Tree", rowHeight: 28, columns: [{ id: "name", title: "Name", width: 200 }],
    source: { kind: "inline" }, roots: [{ id: "a", label: "Alpha" }] };
  await open(page, tree, " data-cx-chrome=\"embedded\" style=\"--hfx-card-padding-x:24px\"");
  const insets = await page.evaluate(() => [".cx-hrow > :first-child", ".cx-canvas .cx-row > :first-child"]
    .map(selector => getComputedStyle(document.querySelector(selector)).paddingInlineStart));
  expect(insets).toEqual(["24px", "24px"]);
});

test("an embedded matrix scroller draws no frame or surface of its own", async ({ page }) => {
  const css = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-matrix.css"), "utf8");
  await page.setContent("<style>:root{--cx-size-1px:1px}" + css + "</style><div class=\"cx-host\" data-cx-chrome=\"embedded\"><div class=\"cx-matrix\"><div class=\"cx-mx-scroll\">x</div></div></div>" +
    "<div class=\"cx-host\"><div class=\"cx-matrix\"><div class=\"cx-mx-scroll\" id=\"standalone\">x</div></div></div>");
  const frames = await page.evaluate(() => [...document.querySelectorAll(".cx-mx-scroll")].map(element => {
    const style = getComputedStyle(element); return { border: style.borderTopWidth, background: style.backgroundColor };
  }));
  expect(frames[0]).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)" });
  expect(frames[1].border).not.toBe("0px");
});

test("a standalone grid keeps its own frame", async ({ page }) => {
  await open(page, grid([{ id: "a", cells: { name: "Plain", size: 5 } }]));
  const standalone = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector("[data-canopyx-host]"));
    return { border: style.borderTopWidth, radius: parseFloat(style.borderTopLeftRadius) };
  });
  expect(standalone.border).toBe("1px");
  expect(standalone.radius).toBeGreaterThan(0);
});

for (const width of [1440, 390]) for (const autoHeight of [true, false]) for (const initiallyEmpty of [true, false]) {
  test(`embedded empty results fit and recover at ${width}px with autoHeight ${autoHeight} and initiallyEmpty ${initiallyEmpty}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, { ...grid(initiallyEmpty ? [] : [{ id: "a", cells: { name: "Alpha", size: 5 } }, { id: "b", cells: { name: "Bravo", size: 6 } }]), search: true, autoHeight },
      ` data-cx-chrome="embedded" style="height:${autoHeight ? 280 : 520}px;max-height:520px;--hfx-card-padding-x:24px"`);
    const host = page.locator("[data-canopyx-host]"), search = host.locator(".cx-search-input");
    if (initiallyEmpty && autoHeight) await expect.poll(() => host.evaluate(element => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height <= parseFloat(style.maxHeight) + 1;
    })).toBe(true);
    if (initiallyEmpty) await expect.poll(() => host.evaluate(element =>
      element.querySelector(".cx-state").getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1)).toBe(true);
    await search.fill("no matching fixture with a longer query to wrap on the phone");
    await expect(host.locator(".cx-state")).toContainText("no matching fixture");
    const height = () => host.evaluate(element => element.getBoundingClientRect().height);
    if (autoHeight) await expect.poll(height).toBeLessThan(520);
    else await expect.poll(height).toBe(520);
    await expect.poll(() => host.evaluate(element => {
      const end = element.getBoundingClientRect().bottom;
      return [...element.querySelectorAll(".cx-state h4,.cx-state p,.cx-state .acts")].every(item => item.getBoundingClientRect().bottom <= end + 1);
    })).toBe(true);
    await search.fill("");
    await expect(host.locator(".cx-canvas .cx-row")).toHaveCount(initiallyEmpty ? 0 : 2);
    await expect.poll(() => host.evaluate(element => {
      const bounds = element.querySelector(".cx-grid").getBoundingClientRect();
      return [...element.querySelectorAll(".cx-canvas .cx-row")].every(row => row.getBoundingClientRect().bottom <= bounds.bottom + 1);
    })).toBe(true);
    if (autoHeight) await expect.poll(height).toBeLessThan(520);
    else await expect.poll(height).toBe(520);
  });
}

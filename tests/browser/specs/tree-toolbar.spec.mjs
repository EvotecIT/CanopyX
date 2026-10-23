// Tree grids with the flat grid's toolbar, column fitting and auto height, on the generic tree-parity example: an
// organisation chart (many columns, search, a filter, named views, an Excel format), a file system eleven levels deep,
// and nested groups that start collapsed to three rows. The page uses the standard tree runtime with inline assets.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const hosts = page => page.locator("[data-canopyx-host]");
const org = page => hosts(page).nth(0), files = page => hosts(page).nth(1), groups = page => hosts(page).nth(2);

async function open(page, name = "tree-parity.html", width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.goto(exampleUrl(name));
  await page.waitForFunction(() => document.querySelectorAll("[data-cx-ready]").length === 3);
  await nextFrames(page);
}

/** Visible direct toolbar controls and the spread of their vertical centres, in pixels: one row has none. */
const toolbarRows = host => host.locator(".cx-toolbar").evaluate(bar => {
  const centres = [...bar.children].filter(child => child.offsetHeight).map(child => { const box = child.getBoundingClientRect(); return box.top + box.height / 2; });
  return { count: centres.length, spread: Math.max(...centres) - Math.min(...centres), height: bar.offsetHeight };
});

const headers = host => host.locator(".cx-head .cx-hcell").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn));

test.afterEach(({ page }) => { expect(page.errors).toEqual([]); });

test("three trees written into one document share a single embedded tree tools part", async ({ page }) => {
  await open(page);
  // The .NET writer embedded the part with the first fragment only; the runtime found it by type and version for all three.
  expect(await page.locator('script[type="application/x-canopyx-tree-tools"]').count()).toBe(1);
  expect(await page.locator('script[type="application/x-canopyx-tree-tools-style"]').count()).toBe(1);
  for (const host of [org(page), files(page), groups(page)]) {
    await expect(host).toHaveClass(/cx-tree-tools/);
    await expect(host.locator(".cx-grid-columns > summary")).toBeVisible();
  }
  const html = fs.readFileSync(fileURLToPath(exampleUrl("tree-parity.html")), "utf8");
  expect(html.split("application/x-canopyx-tree-tools\"").length - 1).toBe(1);
});

test("the tree toolbar is one row of search, filter, Columns, Views, Export and more, and its controls work", async ({ page }) => {
  await open(page);
  const host = org(page);
  expect(await host.locator(".cx-toolbar > *").evaluateAll(items => items.filter(item => item.offsetParent).map(item => item.className)))
    .toEqual(["cx-search", "cx-switch", "cx-columns cx-grid-columns", "cx-columns cx-grid-views", "cx-spacer", "cx-columns cx-grid-export", "cx-columns cx-grid-overflow"]);
  const rows = await toolbarRows(host);
  expect(rows.spread).toBeLessThanOrEqual(4);
  // Search finds a node and opens its path.
  await host.getByRole("combobox").fill("Director C2");
  await host.getByRole("option").first().click();
  await expect(host.locator('.cx-row[data-cx-id="vp2-d1"]')).toHaveAttribute("aria-selected", "true");
  // Columns hides and shows a column; the tree column cannot be hidden.
  await host.locator(".cx-grid-columns > summary").click();
  const choices = host.locator(".cx-grid-column-choice");
  await expect(choices).toHaveCount(7);
  await expect(choices.first().locator("input")).toBeDisabled();
  await choices.filter({ hasText: "Title" }).locator("input").uncheck();
  expect(await headers(host)).not.toContain("title");
  await choices.filter({ hasText: "Title" }).locator("input").check();
  expect(await headers(host)).toContain("title");
  await page.keyboard.press("Escape");
  // Views saves and lists a named view, and Reset view returns to the declared columns.
  await host.locator(".cx-grid-views > summary").click();
  const views = host.locator(".cx-grid-views .cx-grid-panel");
  await views.getByRole("textbox").fill("Directors");
  await views.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(views.getByRole("combobox")).toContainText("Directors");
  await views.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.keyboard.press("Escape");
  // The more menu prints.
  await host.locator(".cx-grid-overflow > summary").click();
  await expect(host.locator(".cx-grid-overflow .cx-grid-panel").getByRole("button", { name: "Print", exact: true })).toBeVisible();
});

test("the Export menu exports visible, selected and all rows as CSV and through a format provider with level and path", async ({ page }) => {
  await open(page);
  const host = org(page), panel = host.locator(".cx-grid-export .cx-grid-panel");
  const exportWith = async (scope, label) => {
    if (!await panel.isVisible()) await host.locator(".cx-grid-export > summary").click();
    await panel.getByRole("combobox").selectOption(scope);
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: label, exact: true }).click();
    return download;
  };
  await host.locator(".cx-grid-export > summary").click();
  await panel.getByRole("combobox").waitFor();
  expect(await panel.getByRole("combobox").locator("option").evaluateAll(options => options.map(option => [option.value, option.textContent])))
    .toEqual([["visible", "Visible rows"], ["selected", "Selected rows"], ["all", "All rows"]]);
  await expect(panel.locator("button:not([hidden])")).toHaveText(["Download CSV", "Download Excel"]);

  const visible = await host.evaluate(element => element.canopyx.visibleRows().length);
  await exportWith("visible", "Download Excel");
  let written = await page.evaluate(() => window.treeExports.at(-1));
  expect(written.request).toMatchObject({ kind: "tree", scope: "visible", recordCount: visible });
  expect(written.rows[1]).toMatchObject({ id: "vp0", level: 2, path: ["ceo", "vp0"] });

  const all = await exportWith("all", "Download Excel");
  expect((await all).suggestedFilename()).toBe("org-chart.xlsx");
  written = await page.evaluate(() => window.treeExports.at(-1));
  expect(written.rows).toHaveLength(446);
  expect(written.rows.find(row => row.id === "vp4-d3-m2-s5")).toMatchObject({ level: 5, path: ["ceo", "vp4", "vp4-d3", "vp4-d3-m2", "vp4-d3-m2-s5"] });

  await page.keyboard.press("Escape");
  await host.locator('.cx-row[data-cx-id="vp1"]').click();
  await exportWith("selected", "Download Excel");
  written = await page.evaluate(() => window.treeExports.at(-1));
  expect(written.rows.map(row => [row.id, row.level, row.path])).toEqual([["vp1", 2, ["ceo", "vp1"]]]);

  // CSV indents the tree column by level.
  const csv = await exportWith("visible", "Download CSV");
  const lines = fs.readFileSync(await (await csv).path(), "utf8").split("\r\n");
  expect(lines[0]).toBe("Name,Title,Department,Location,Email,Reports,Started");
  expect(lines[1]).toMatch(/^Morgan Avery,Chief Executive Officer,/);
  expect(lines[2]).toMatch(/^ {2}Vice President A,/);

  // A failing writer reports its error in the menu and as an error event; the menu stays usable.
  await page.evaluate(() => CanopyX.registerExportFormat({ id: "broken", label: "Download broken", extension: "txt", write() { throw new Error("Writer failed"); } }));
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.exportFormats.push("broken"));
  await page.keyboard.press("Escape"); await host.locator(".cx-grid-export > summary").click();
  await panel.getByRole("button", { name: "Download broken", exact: true }).click();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("Writer failed");
  await expect(panel.getByRole("button", { name: "Download CSV", exact: true })).toBeEnabled();
});

test("export progress, Cancel and the status line run through the shared menu", async ({ page }) => {
  await open(page);
  const host = org(page), panel = host.locator(".cx-grid-export .cx-grid-panel");
  await page.evaluate(() => {
    CanopyX.registerExportFormat({ id: "slow", label: "Download slow", extension: "txt", async write(capture, { signal, progress }) {
      let count = 0;
      for await (const row of capture.rows({ signal })) { if (++count % 100 === 0) progress(count); }
      await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 60000); signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }); });
      return new Blob(["late"]);
    } });
    document.querySelector("[data-canopyx-host]").canopyx.view.exportFormats.push("slow");
  });
  await host.locator(".cx-grid-export > summary").click();
  await panel.getByRole("combobox").selectOption("all");
  await panel.getByRole("button", { name: "Download slow", exact: true }).click();
  await expect(panel.locator("progress")).toBeVisible();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText(/of 446 records|records/);
  await panel.getByRole("button", { name: "Cancel export", exact: true }).click();
  await expect(panel.locator(".cx-grid-delivery-status")).toHaveText("Export cancelled");
  await expect(panel.locator("progress")).toBeHidden();
});

for (const theme of ["light", "dark"]) test(`columns fill the width and the deep tree column stays whole (${theme})`, async ({ page }) => {
  await open(page, theme === "dark" ? "tree-parity-dark.html" : "tree-parity.html");
  for (const host of [org(page), files(page), groups(page)]) {
    const fill = await host.evaluate(element => {
      const grid = element.querySelector(".cx-grid");
      return { columns: [...element.querySelectorAll(".cx-head .cx-hcell")].reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0), width: grid.clientWidth };
    });
    expect(Math.abs(fill.columns - fill.width)).toBeLessThanOrEqual(1);
  }
  const host = files(page);
  await host.evaluate(element => element.canopyx.expandPath(["fs-root", "fs-0", "fs-1", "fs-2", "fs-3", "fs-4", "fs-5", "fs-6", "fs-7", "fs-8", "fs-9", "fs-deep"], { select: true }));
  await nextFrames(page);
  const deep = await host.locator('.cx-row[data-cx-id="fs-deep"] .cx-tree').evaluate(cell => {
    const text = cell.querySelector(".cx-text"), indent = cell.querySelector(".cx-indent");
    return { clipped: text.scrollWidth > text.clientWidth, right: text.getBoundingClientRect().right, cell: cell.getBoundingClientRect().right, indent: indent.getBoundingClientRect().width };
  });
  expect(deep.indent).toBe(11 * 18);
  expect(deep.clipped).toBe(false);
  expect(deep.right).toBeLessThanOrEqual(deep.cell);
});

test("optional columns give way first at narrow widths and the phone layout keeps the essentials", async ({ page }) => {
  await open(page);
  expect(await headers(org(page))).toEqual(["name", "title", "department", "location", "email", "reports", "started"]);
  // Email gives way first; the platform font may make other optional columns hide at this width too.
  await page.setViewportSize({ width: 700, height: 900 });
  await expect.poll(async () => {
    const shown = await headers(org(page));
    return ["name", "title", "department", "reports"].every(id => shown.includes(id)) && !shown.includes("email") &&
      (shown.includes("location") || !shown.includes("started"));
  }).toBe(true);
  await org(page).locator(".cx-grid-columns > summary").click();
  await expect(org(page).locator('.cx-grid-column-choice[data-cx-column="email"] .cx-grid-column-note')).toHaveText("Hidden at this width");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(async () => { const shown = await headers(org(page)); return ["name", "reports"].every(id => shown.includes(id)) && !shown.some(id => ["email", "location", "started"].includes(id)); }).toBe(true);
});

test("a tree is as tall as its rows, grows to the host height when expanded and shrinks again when collapsed", async ({ page }) => {
  await open(page);
  const host = groups(page);
  const height = () => host.evaluate(element => element.offsetHeight);
  const content = await host.evaluate(element => element.querySelector(".cx-toolbar").offsetHeight + element.querySelector(".cx-head").offsetHeight
    + element.canopyx.visibleRows().length * element.querySelector('.cx-row[data-cx-id]').getBoundingClientRect().height);
  await expect.poll(height).toBeLessThanOrEqual(content + 8);
  expect(await height()).toBeGreaterThanOrEqual(content);
  await host.locator('.cx-row[data-cx-id="g-everyone"] .cx-exp').click();
  await expect(host.locator(".cx-row[data-cx-id]").first()).toBeVisible();
  expect(await host.evaluate(element => element.canopyx.visibleRows().length)).toBe(500);
  await expect.poll(height).toBe(420);
  await host.locator('.cx-row[data-cx-id="g-everyone"] .cx-exp').click();
  await expect.poll(height).toBeLessThanOrEqual(content + 8);
});

for (const theme of ["light", "dark"]) for (const width of [1440, 390]) test(`the tree toolbar and layout fit ${theme} at ${width} pixels`, async ({ page }) => {
  await open(page, theme === "dark" ? "tree-parity-dark.html" : "tree-parity.html", width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const host = org(page);
  if (width === 1440) {
    expect((await toolbarRows(host)).spread).toBeLessThanOrEqual(4);
  } else {
    // Views and Export move into the more menu; the search box takes its own row as on a flat grid.
    await expect(host.locator(".cx-grid-overflow .cx-grid-panel .cx-grid-export")).toHaveCount(1);
    await expect(host.locator(".cx-grid-overflow .cx-grid-panel .cx-grid-views")).toHaveCount(1);
    expect((await toolbarRows(host)).height).toBeLessThanOrEqual(120);
  }
  const colors = await host.evaluate(element => [getComputedStyle(element).backgroundColor, getComputedStyle(element.querySelector(".cx-btn")).color]);
  expect(colors[0]).not.toBe(colors[1]);
  const evidence = process.env.CANOPYX_EVIDENCE_DIR;
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "tree-toolbar-" + theme + "-" + width + ".png"), fullPage: true });
  }
});

test("a tree whose tree tools part cannot load keeps its rows, search and filters and reports the error", async ({ page }) => {
  const read = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
  const view = { protocol: "canopyx/2", type: "view", id: "plain", label: "Plain", rowHeight: 28, columns: [{ id: "name", title: "Name", width: 200 }],
    search: { minLength: 2, maxResults: 10 }, filters: [{ id: "f", label: "Flagged", flag: "x" }], source: { kind: "inline" }, roots: [{ id: "a", label: "Alpha" }] };
  await page.route("https://plain.test/**", route => new URL(route.request().url()).pathname === "/" ?
    route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Plain</title><style>' + read("canopyx.css") + "</style><script>window.errors=[];</script><script src=\"/canopyx.js\"></script></head><body>" +
      '<div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">' + JSON.stringify(view) + "</script></div>" +
      "<script>document.querySelector('[data-canopyx-host]').addEventListener('canopyx:error',e=>errors.push(e.detail.error.message));</script></body></html>" }) :
    route.fulfill(new URL(route.request().url()).pathname === "/canopyx.js" ? { contentType: "text/javascript", body: read("canopyx.js") } : { status: 404, body: "" }));
  page.errors = [];
  await page.goto("https://plain.test/");
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator('.cx-row[data-cx-id="a"]')).toBeVisible();
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(page.locator("[data-cx-filter]")).toBeVisible();
  await expect(page.locator(".cx-grid-columns")).toHaveCount(0);
  const errors = await page.evaluate(() => window.errors);
  expect(errors).toHaveLength(1); expect(errors[0]).toMatch(/^CanopyX: tree tools (script|stylesheet) unavailable\.$/);
  // The part's methods report it: those returning a promise reject it, the others throw.
  expect(await page.evaluate(() => {
    const api = document.querySelector("[data-canopyx-host]").canopyx; let thrown = null;
    try { api.saveView("x"); } catch (error) { thrown = error.message; }
    return api.resetView().then(() => "resolved", error => [thrown, error.message]);
  })).toEqual(["CanopyX: saveView needs the tree tools part.", "CanopyX: resetView needs the tree tools part."]);
  // Without the part there is no outline to print, so the rows on screen print rather than a blank page.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cx-outline")).toBeEmpty();
  await expect(page.locator('.cx-row[data-cx-id="a"]')).toBeVisible();
});

// The tools part loaded from files arrives after the roots; remembered order, user widths and an unpinned tree column still apply.
test("remembered column order, user widths and the pin survive a reload with file-loaded tree tools", async ({ page }) => {
  const read = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
  const view = { protocol: "canopyx/2", type: "view", id: "remembered", label: "Remembered", rowHeight: 28, stateKey: "remembered-tools",
    columns: [{ id: "name", title: "Name", width: 160, autoWidth: true }, { id: "a", title: "Alpha", width: 120 }, { id: "b", title: "Beta", width: 120 }],
    source: { kind: "inline" }, roots: [{ id: "n", label: "Node", cells: { a: "one", b: "two" } }] };
  await page.route("https://remember.test/**", async route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Remembered</title><style>' + read("canopyx.css") +
      '</style><script defer src="/canopyx.js"></script></head><body><div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">' + JSON.stringify(view) + "</script></div></body></html>" });
    // The part arrives late, after the roots and the remembered state could have been applied.
    if (file.startsWith("canopyx-tree-tools")) await new Promise(resolve => setTimeout(resolve, 300));
    return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) });
  });
  page.errors = [];
  await page.goto("https://remember.test/"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => { const api = document.querySelector("[data-canopyx-host]").canopyx;
    api.setColumnOrder(["name", "b", "a"]); api.setColumnWidth("a", 222); api.setTreeColumnPinned(false); });
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
  const host = page.locator("[data-canopyx-host]");
  expect(await headers(host)).toEqual(["name", "b", "a"]);
  expect(await host.locator('.cx-hcell[data-cx-column="a"]').evaluate(cell => cell.getBoundingClientRect().width)).toBe(222);
  expect(await host.evaluate(element => element.classList.contains("cx-pin-tree"))).toBe(false);
});

test("an invalid host action or tree column layout is reported while the tree stays ready", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.createElement("div"), errors = []; document.body.appendChild(host);
    host.addEventListener("canopyx:error", event => errors.push(event.detail.error.message));
    const view = { protocol: "canopyx/2", type: "view", id: "invalid-tools", label: "Invalid", rowHeight: 28, columns: [{ id: "name", title: "Name", width: 200 }, { id: "x", title: "X", width: 90, flex: -1 }],
      source: { kind: "inline" }, roots: [{ id: "r", label: "Root" }] };
    const layout = CanopyX.createTreeGrid(host, { view }); await layout.ready;
    const second = document.createElement("div"); document.body.appendChild(second);
    second.addEventListener("canopyx:error", event => errors.push(event.detail.error.message));
    const actions = CanopyX.createTreeGrid(second, { view: { ...view, id: "invalid-actions", columns: [view.columns[0]] }, actions: [{ label: "No handler" }] }); await actions.ready;
    return { errors, rows: [layout, actions].map(api => api.visibleRows().length) };
  });
  expect(result.errors).toEqual(["CanopyX: invalid tree column layout.", "CanopyX: actions need a label and handler."]);
  expect(result.rows).toEqual([1, 1]);
});

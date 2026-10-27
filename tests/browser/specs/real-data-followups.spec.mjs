// Follow-ups from real report data: column menus without reserved header room, column tooltips on truncated cells, and the
// flat grid's sizing model on wide trees (content fit, flex, priority hiding and pins on both edges), cell sort keys, and part
// stylesheets that leave the other components on a page alone.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames, openExample, openGridControl } from "./support.mjs";
import { requiredParts } from "./part-fixture-support.mjs";

async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }
async function open(page, document, width = 1100, script = "") {
  await page.setViewportSize({ width, height: 700 });
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const html = viewPage(document).replace("</head>", script ? "<script>" + script + "</script></head>" : "</head>");
  await page.route("http://canopyx.test/followups", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/followups");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page); await nextFrames(page);
}
const grid = patch => ({ protocol: "canopyx/2", type: "grid", id: "followups", label: "Hosts", pageSize: 20, selection: "single", search: false, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "review", title: "Review state of the benchmark", kind: "text" }, { id: "site", title: "Site", kind: "text" }],
  rows: Array.from({ length: 4 }, (_, i) => ({ id: "h" + i, cells: { name: "host-" + i, review: "Ok", site: "Site " + i } })), ...patch });

test("overlaid column menus cost no measured header width", async ({ page }) => {
  // The header need auto-fit measures: the title, padding and controls (spare width goes elsewhere, so not the width on screen).
  const width = () => page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.autoFitColumn("review").head);
  await open(page, grid());
  await expect(page.locator(".cx-grid-column-menu")).toHaveCount(3);
  const withMenus = await width();
  await page.unrouteAll();
  await open(page, grid({ toolbar: { columnMenus: false } }));
  await expect(page.locator(".cx-grid-column-menu")).toHaveCount(0);
  const without = await width();
  expect(withMenus).toBe(without);
  // The header title still shows in full without the menu's room.
  expect(await page.locator('.cx-hcell[data-cx-column="review"] .cx-htext, .cx-hcell[data-cx-column="review"] .cx-sort').first().evaluate(item => item.scrollWidth <= item.clientWidth + 1)).toBe(true);
  expect(page.errors).toEqual([]);
});

/** The title a cell shows after hovering it. */
const hoverTitle = async (page, selector) => { await page.locator(selector).hover(); return page.locator(selector).evaluate(cell => cell.getAttribute("title") || ""); };

test("a column tooltip shows the full value of truncated cells, or another column's text, on grids and trees", async ({ page }) => {
  const long = "A description far too long for the narrow column it sits in, so the cell cuts it off with an ellipsis";
  await open(page, grid({ columns: [{ id: "name", title: "Name", kind: "text", tooltip: "note" }, { id: "note", title: "Note", kind: "text", width: 120, fixed: true, tooltip: "auto" },
    { id: "site", title: "Site", kind: "text", width: 160, fixed: true, tooltip: "auto" }],
    rows: [{ id: "h0", cells: { name: "host-0", note: long, site: "Site 0" } }, { id: "h1", cells: { name: "host-1", note: { value: long, title: "Own title" }, site: "Site 1" } }] }));
  expect(await hoverTitle(page, '.cx-row[data-cx-id="h0"] .cx-cell:nth-child(2)')).toBe(long);
  // Not cut off: no tooltip.
  expect(await hoverTitle(page, '.cx-row[data-cx-id="h0"] .cx-cell:nth-child(3)')).toBe("");
  // A named column shows that column's text; a cell's own title wins.
  expect(await hoverTitle(page, '.cx-row[data-cx-id="h0"] .cx-cell:nth-child(1)')).toBe(long);
  expect(await hoverTitle(page, '.cx-row[data-cx-id="h1"] .cx-cell:nth-child(2)')).toBe("Own title");
  await page.unrouteAll();
  const tree = { protocol: "canopyx/2", type: "view", id: "followups", label: "Tree", pageSize: 50, selection: "single", source: { kind: "inline" },
    columns: [{ id: "name", title: "Name", width: 150, tooltip: "auto" }, { id: "path", title: "Path", width: 140, autoSize: "none", tooltip: "auto" }],
    roots: [{ id: "a", label: "A node whose label is longer than its column", cells: { path: "/library/finance/policies/a-very-long-file-name.docx" } },
      { id: "b", label: "Short", cells: { path: "/b" } }] };
  await open(page, tree);
  expect(await hoverTitle(page, '.cx-row[data-cx-id="a"] .cx-cell:nth-child(2)')).toBe("/library/finance/policies/a-very-long-file-name.docx");
  expect(await hoverTitle(page, '.cx-row[data-cx-id="b"] .cx-cell:nth-child(2)')).toBe("");
  expect(page.errors).toEqual([]);
});

/** Header geometry of the wide tree: what the grid shows of each column, and where the pinned ones are. */
const layout = page => page.evaluate(() => {
  const grid = document.querySelector(".cx-grid"), box = grid.getBoundingClientRect();
  return { client: grid.clientWidth, scroll: grid.scrollWidth, head: parseFloat(document.querySelector(".cx-hrow").style.width), columns: [...document.querySelectorAll(".cx-hcell")].map(cell => {
    const rect = cell.getBoundingClientRect();
    return { id: cell.dataset.cxColumn, pin: cell.dataset.cxPin || (cell.parentNode.firstElementChild === cell && document.querySelector(".cx-pin-tree") ? "tree" : null),
      left: Math.round(rect.left - box.left), right: Math.round(box.right - rect.right) };
  }) };
});

for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test("a wide tree fits, fills, hides by priority and pins both edges (" + theme + ", " + width + ")", async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await openExample(page, theme === "dark" ? "wide-tree-dark.html" : "wide-tree.html");
    await nextFrames(page);
    let result = await layout(page);
    const ids = result.columns.map(column => column.id);
    // Pinned columns sit next to their edge: the tree column, then the owner (on desktops); the status at the right.
    expect(ids[0]).toBe("name"); expect(ids.at(-1)).toBe("status");
    if (width === 1440) expect(ids[1]).toBe("owner");
    // The rows reach the right edge: rounding the fitted widths down leaves no band after the last column.
    expect(result.head).toBeGreaterThanOrEqual(result.client);
    if (width === 1440) {
      // Optional columns hide before anything scrolls at desktop width only when needed; the last header is fully in view.
      const status = result.columns.at(-1);
      expect(status.pin).toBe("right");
      expect(status.right).toBeGreaterThanOrEqual(-1);
      await capture(page, "wide-tree-" + theme + "-1440");
      // Scrolled sideways, the pinned columns stay at their edges.
      await page.locator(".cx-grid").evaluate(grid => { grid.scrollLeft = grid.scrollWidth; });
      await nextFrames(page);
      result = await layout(page);
      if (result.scroll > result.client) {
        expect(result.columns.find(column => column.id === "owner").left).toBeGreaterThan(0);
        expect(Math.abs(result.columns.at(-1).right)).toBeLessThanOrEqual(1);
      }
    } else {
      // On a phone the tree column keeps its room: the other columns hide, the pinned owner too, and the essential status
      // stays. The tree column holds the "+N" button of the hidden fields, which opens the row's record drawer.
      expect(ids).toEqual(["name", "status"]);
      const name = result.columns[0];
      expect(result.columns[1].left - name.left).toBeGreaterThanOrEqual(200);
      const top = page.locator('.cx-row[data-cx-id="team-0"] .cx-cell').first();
      await expect(top.locator(".cx-text")).toHaveText("Finance documents");
      expect(await top.locator(".cx-text").evaluate(text => text.scrollWidth <= text.clientWidth)).toBe(true);
      const more = top.locator(".cx-hidden-fields");
      await expect(more).toHaveText("+7");
      await capture(page, "wide-tree-" + theme + "-390");
      await more.click();
      const drawer = page.locator("dialog.cx-drawer");
      await expect(drawer.locator("h4")).toHaveText("Finance documents");
      await expect(drawer.locator("dt").first()).toHaveText("Owner");
      await expect(drawer.locator("dd").first()).toHaveText("Finance team");
      await capture(page, "wide-tree-drawer-" + theme + "-390");
      await page.keyboard.press("ArrowDown");
      await expect(drawer.locator("h4")).toHaveText("Policies 2024");
      // After the keyboard, the title shows the accent focus ring of the flat grid's drawer, not the browser's.
      await expect(drawer.locator("h4")).toHaveCSS("outline-style", "solid");
      await expect(drawer.locator("h4")).toHaveCSS("outline-width", "2px");
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    }
  });
}

test("a tree pins and unpins columns at run time, remembers the pins, and fills a wide page", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 800 });
  await openExample(page, "wide-tree.html");
  const api = "document.querySelector('[data-canopyx-host]').canopyx";
  // Wider than its content: no column is cut off and the flex description takes the spare width.
  const wide = await layout(page);
  expect(wide.scroll).toBeLessThanOrEqual(wide.client + 1);
  expect(wide.columns.at(-1).right).toBeLessThanOrEqual(1);
  await page.evaluate(`${api}.setColumnPinned("type", "right")`);
  await nextFrames(page);
  let ids = (await layout(page)).columns.map(column => column.id);
  expect(ids.slice(-2)).toEqual(["type", "status"]);
  expect(await page.evaluate(`${api}.getState().columns.filter(column => column.pin && column.pin !== "none").map(column => column.id + ":" + column.pin)`)).toEqual(["owner:left", "type:right", "status:right"]);
  await page.evaluate(`${api}.setColumnPinned("owner", "none")`);
  await nextFrames(page);
  await expect(page.locator('.cx-hcell[data-cx-column="owner"]')).not.toHaveAttribute("data-cx-pin", /./);
  // Reset columns returns to the declared pins.
  await page.evaluate(`${api}.resetColumns()`);
  await nextFrames(page);
  ids = (await layout(page)).columns.map(column => column.id);
  expect(ids[1]).toBe("owner"); expect(ids.at(-1)).toBe("status");
  await expect(page.evaluate(`${api}.setColumnPinned("name", "right")`)).rejects.toThrow(/invalid column pin/);
});

test("a cell's sort key orders the column while its value list and search read the visible names", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openExample(page, "runs-grid.html");
  const ids = () => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(row => row.dataset.cxId));
  // Descending by start time (the sort key), not by name: the latest run first.
  expect((await ids()).slice(0, 3)).toEqual(["run-23", "run-22", "run-21"]);
  await page.locator('.cx-hcell[data-cx-column="run"] .cx-sort').click();
  await expect.poll(async () => (await ids())[0]).toBe("run-0");
  // The column filter lists the names.
  await page.locator('[data-cx-column-menu="run"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.locator(".cx-column-menu").getByRole("menuitem", { name: "Filter…" }).click();
  const labels = await page.locator(".cx-grid-overlay label").allTextContents();
  expect(labels.some(text => text.includes("Nightly build #100"))).toBe(true);
  expect(labels.some(text => /\d{4}-\d\d-\d\dT/.test(text))).toBe(false);
  await capture(page, "runs-grid-value-list");
  await page.keyboard.press("Escape");
  // Search reads the names too.
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("Security");
  await expect.poll(async () => (await ids()).length).toBe(6);
});
for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test("a tree's group rows keep their height beside a grid whose filter builder nests groups (" + theme + ", " + width + ")", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
    await openExample(page, "runs-board.html");
    const groupRows = () => page.evaluate(() => [...document.querySelectorAll('[data-canopyx-host] .cx-row.cx-group')].map(row => {
      const style = getComputedStyle(row);
      return { height: row.getBoundingClientRect().height, border: style.borderLeftWidth, margin: style.marginLeft, display: style.display };
    }));
    const before = await groupRows();
    expect(before.length).toBe(4);
    const rowHeight = await page.locator('[data-canopyx-host] .cx-row[data-cx-id="pipeline-0-run-0"]').evaluate(row => row.getBoundingClientRect().height);
    expect(before.every(row => row.height === rowHeight && row.height >= 20)).toBe(true);
    // Opening the filter builder loads the filter editor part and its stylesheet; a nested group draws its rule.
    await openGridControl(page, "filters");
    const form = page.locator(".cx-grid-filter-form");
    await form.getByRole("button", { name: "+ Group", exact: true }).first().click();
    const group = form.locator(".cx-grid-filter-group").first();
    await expect(group).toBeVisible();
    expect(await group.evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe("2px");
    expect(await page.locator(".cx-group").count()).toBe(4);
    expect(await groupRows()).toEqual(before);
    await capture(page, "runs-board-filters-" + theme + "-" + width);
    // Closed again (a phone sheet covers the page), the part's stylesheet stays and the tree keeps its rows.
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
    expect(await groupRows()).toEqual(before);
    await capture(page, "runs-board-closed-" + theme + "-" + width);
    expect(page.errors).toEqual([]);
  });
}
test("a grouped grid keeps each group whole when its cells carry sort keys, and mixed key types order numbers first", async ({ page }) => {
  // Category cells carry keys that interleave the two categories; grouping orders by the values, so each group is one run.
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: "r" + String(i).padStart(2, "0"),
    cells: { name: i % 3 === 0 ? { value: "Item " + i, sort: i } : "Item " + i, category: { value: i % 2 ? "Odd" : "Even", sort: 100 - i } } }));
  await open(page, grid({ id: "keyed", pageSize: 50, rows, reporting: { grouping: { column: "category", direction: "asc" } },
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "category", title: "Category", kind: "text", sortable: true }] }));
  const groups = await page.locator("[data-cx-group]").evaluateAll(items => items.map(item => item.getAttribute("data-cx-group")));
  expect(groups.length).toBe(2);
  expect(new Set(groups).size).toBe(2);
  // Without grouping, numeric keys (items 0, 3, 6, 9) keep their rank before text in both directions.
  await open(page, grid({ id: "mixed", pageSize: 50, rows: rows.map(row => ({ id: row.id, cells: { name: row.cells.name } })), columns: [{ id: "name", title: "Name", kind: "text", sortable: true }] }));
  const order = () => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(row => row.dataset.cxId));
  await page.locator('.cx-hcell[data-cx-column="name"] .cx-sort').click();
  await expect.poll(async () => (await order()).slice(0, 4)).toEqual(["r00", "r03", "r06", "r09"]);
  const ascending = await order();
  await page.locator('.cx-hcell[data-cx-column="name"] .cx-sort').click();
  await expect.poll(order).toEqual([...ascending.slice(0, 4).reverse(), ...ascending.slice(4).reverse()]);
  expect(page.errors).toEqual([]);
});
// Localized numeric captions keep their full layout width and remain complete beneath an opaque trailing menu chip.
const numberHeader = page => page.locator('.cx-hcell[data-cx-column="overall"]').evaluate(cell => {
  const box = element => element.getBoundingClientRect(), own = box(cell), title = box(cell.querySelector(".cx-sort")), menu = box(cell.querySelector(".cx-grid-column-menu"));
  const label = cell.querySelector('.cx-htext');
  return { cellLeft: own.left, cellRight: own.right, titleRight: title.right, menuLeft: menu.left, menuRight: menu.right,
    fade: getComputedStyle(cell.querySelector(".cx-grid-column-menu"),"::before").backgroundImage, clipped: label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1 };
});
for (const language of ["en", "pl"]) for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test("a numeric caption stays readable with an overlaid menu (" + [language, theme, width].join(", ") + ")", async ({ browser, browserName }) => {
    // hasTouch makes any-pointer:coarse match in Chromium; the touch layout is checked there.
    for (const touch of width === 1440 && browserName === "chromium" ? [false, true] : [false]) {
      const context = await browser.newContext({ viewport: { width, height: 700 }, hasTouch: touch, colorScheme: theme });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await openExample(page, "scores-grid-" + language + (theme === "dark" ? "-dark" : "") + ".html");
        await nextFrames(page);
        const coarse = await page.evaluate(() => matchMedia("(any-pointer:coarse)").matches);
        if (touch) expect(coarse).toBe(true);
        const menu = page.locator('.cx-hcell[data-cx-column="overall"] .cx-grid-column-menu');
        await menu.focus(); await expect(menu).toHaveCSS('opacity', '1'); await expect(menu).toHaveCSS('position', 'absolute');
        if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "number-header-" + [language, theme, width].join("-") + (touch ? "-touch" : "") + ".png") });
        const header = await numberHeader(page);
        expect(header.clipped).toBe(false); expect(header.fade).toContain('linear-gradient');
        expect(header.cellRight - header.menuRight).toBeLessThanOrEqual(5);
        expect(header.menuLeft).toBeGreaterThanOrEqual(header.cellLeft); expect(header.menuRight).toBeLessThanOrEqual(header.cellRight);
        if (width === 1440 && !coarse) {
          // The caption remains aligned with the numbers while its menu is open.
          const value = await page.locator('.cx-row[data-cx-id="team-0"] .cx-cell').nth(2).evaluate(cell => {
            const range = document.createRange(); range.selectNodeContents(cell); return range.getBoundingClientRect().right;
          });
          expect(Math.abs(header.titleRight - value)).toBeLessThanOrEqual(2);
        }
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
}
// A deep tree on a phone: the tree column keeps every level's indent and its labels, and the "+N" button opens the rest.
for (const theme of ["light", "dark"]) {
  test("a deep tree on a phone keeps its tree column readable and offers its hidden fields (" + theme + ")", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
    await openExample(page, theme === "dark" ? "tree-parity-dark.html" : "tree-parity.html");
    const tree = page.locator("[data-canopyx-host]").nth(1);
    await tree.scrollIntoViewIfNeeded();
    await nextFrames(page);
    // Storage, then nine folders down: every label shows in full beside its indent.
    const labels = await tree.locator(".cx-row[data-cx-id] .cx-cell.cx-tree").evaluateAll(cells => cells.slice(0, 10).map(cell => {
      const text = cell.querySelector(".cx-text");
      return { level: Number(cell.parentNode.getAttribute("aria-level")), full: text.scrollWidth <= text.clientWidth, hidden: cell.querySelector(".cx-hidden-fields")?.textContent };
    }));
    expect(labels.length).toBe(10);
    expect(Math.max(...labels.map(item => item.level))).toBeGreaterThanOrEqual(4);
    expect(labels.every(item => item.full && item.hidden === "+3")).toBe(true);
    await tree.screenshot({ path: process.env.CANOPYX_EVIDENCE ? path.join(process.env.CANOPYX_EVIDENCE, "deep-tree-" + theme + "-390.png") : undefined });
    // Record details in the more menu opens the focused row's drawer, for keyboard readers.
    await tree.locator('.cx-row[data-cx-id="fs-2"]').click();
    // A centered row click can hit the phone's hidden-fields button; close its modal before reaching the toolbar.
    const drawer = page.locator("dialog.cx-drawer");
    if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await tree.locator(".cx-grid-overflow > summary").click();
    await tree.locator(".cx-grid-details").click();
    await expect(drawer.locator("h4")).toHaveText("Projects");
    await expect(drawer.locator("dt")).toHaveText(["Size", "Modified", "Type"]);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    expect(page.errors).toEqual([]);
  });
}
test("a tree loads the export part on first use and offers its Export menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  // Records the parts whose embedded payloads run (the loader runs a payload as a script without a type, while the page's
  // inert payloads keep theirs): each registers itself with CanopyXParts.push(["<name>", part]).
  await page.addInitScript(() => {
    window.__canopyxParts = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        const match = node.nodeName === "SCRIPT" && !node.type && /\.push\(\["([a-z-]+)",part\]\)/.exec(node.textContent || "");
        if (match) window.__canopyxParts.push(match[1]);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await openExample(page, "wide-tree.html");
  // The tree tools part is installed; the export part is not, until the menu opens.
  const initialParts = requiredParts("tree-tools").map(part => part.name);
  expect(await page.evaluate(() => window.__canopyxParts.slice().sort())).toEqual(initialParts.slice().sort());
  expect(await page.evaluate(() => window.__canopyxParts)).not.toContain("export");
  await page.locator(".cx-grid-export > summary").click();
  await expect(page.locator(".cx-grid-export").getByRole("button", { name: "Download CSV" })).toBeVisible();
  const exportParts = requiredParts("tree-tools", "export").map(part => part.name);
  expect(await page.evaluate(() => window.__canopyxParts.slice().sort())).toEqual(exportParts.slice().sort());
  expect(page.errors).toEqual([]);
});
// Auto height on trees, as on flat grids: a short tree is as tall as its toolbar, header and rows inside the host's height
// cap, and follows expanding, collapsing and a toolbar that wraps differently at another width.
for (const width of [1440, 390]) {
  test("a short tree follows its rows through expanding, collapsing and resizing (" + width + ")", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openExample(page, "tree-parity.html");
    const host = page.locator("[data-canopyx-host]").nth(2);
    await host.scrollIntoViewIfNeeded();
    // The gap between the host's height and its content: toolbar, header and rows (and the host's borders and padding).
    const gap = () => host.evaluate(element => {
      const grid = element.querySelector(".cx-grid"), rows = [...element.querySelectorAll(".cx-row[data-cx-id]")];
      const bottom = Math.max(...rows.map(row => row.getBoundingClientRect().bottom), grid.querySelector(".cx-head").getBoundingClientRect().bottom);
      return { gap: Math.round(element.getBoundingClientRect().bottom - bottom), height: element.offsetHeight, rows: rows.length };
    });
    const fits = () => expect.poll(async () => { const { gap: value } = await gap(); return value >= 0 && value <= 16 ? "fits" : value; }).toBe("fits");
    await fits();
    const collapsed = (await gap()).height;
    // Administrators opens two rows: the tree grows by them and stays fitted.
    // The height follows after a short debounce, so wait for it to grow before checking the fit (the old height still fits).
    await host.locator('.cx-row[data-cx-id="g-admins"] .cx-exp').click();
    await expect.poll(async () => (await gap()).height).toBeGreaterThan(collapsed);
    await fits();
    // Everyone opens 497 rows: the tree reaches the host's cap (420 pixels) and scrolls inside it.
    await host.locator('.cx-row[data-cx-id="g-everyone"] .cx-exp').click();
    await expect.poll(async () => (await gap()).height).toBe(420);
    await host.locator('.cx-row[data-cx-id="g-everyone"] .cx-exp').click();
    await host.locator('.cx-row[data-cx-id="g-admins"] .cx-exp').click();
    await expect.poll(async () => (await gap()).height).toBe(collapsed);
    await fits();
    // Across the phone breakpoint the toolbar wraps differently; the height is measured again both ways.
    await page.setViewportSize({ width: width === 1440 ? 390 : 1440, height: 900 });
    await fits();
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await gap()).height).toBe(collapsed);
    await fits();
  });
}

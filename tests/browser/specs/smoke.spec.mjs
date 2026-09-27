// One pass over every Must of the tree grid, on the generated inline and bundle examples and a remote source.
import { expect, test } from "@playwright/test";
import { focusedId, nextFrames, openExample, renderedIds, row, viewPage } from "./support.mjs";

const api = (page) => "document.querySelector('.cx-host').canopyx";

/** Finds the id path of the first node matching a predicate in the inline view document. */
function findPath(page, predicate) {
  return page.evaluate((source) => {
    const match = new Function("node", "return (" + source + ")(node);");
    const view = JSON.parse(document.querySelector("script.cx-config").textContent);
    const stack = view.roots.map((node) => [node, [node.id]]).reverse();
    while (stack.length) {
      const [node, path] = stack.pop();
      if (match(node)) {
        return path;
      }
      (node.children || []).slice().reverse().forEach((child) => stack.push([child, path.concat(child.id)]));
    }
    return null;
  }, predicate.toString());
}

test.describe("inline source", () => {
  test.beforeEach(async ({ page }) => {
    await openExample(page, "inline.html");
  });

  test("renders an ARIA tree grid with the first share expanded", async ({ page }) => {
    const grid = page.getByRole("treegrid", { name: "File shares" });
    await expect(grid).toHaveAttribute("aria-multiselectable", "true");
    await expect(row(page, "share-a")).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "share-a/d0")).toHaveAttribute("aria-level", "2");
    await expect(page.getByRole("columnheader", { name: "Size" })).toHaveAttribute("aria-sort", "none");
  });

  test("renders only the rows near the viewport", async ({ page }) => {
    await page.evaluate(`(async () => { const api = ${api(page)}; await api.expandPath(["share-a", "share-a/d0", "share-a/d0/p0"], { expandLast: true, select: false, focus: false }); await api.loadMore("share-a/d0/p0"); await api.loadMore("share-a/d0/p0"); })()`);
    await nextFrames(page);
    const rowCount = Number(await page.getByRole("treegrid").getAttribute("aria-rowcount"));
    const rendered = await page.locator(".cx-row").count();
    expect(rowCount).toBeGreaterThan(250);
    expect(rendered).toBeLessThan(80);
  });

  test("shows host badges and rollups as supplied", async ({ page }) => {
    const share = await page.evaluate(`${api(page)}.visibleRows().find((r) => r.node.id === "share-a").node`);
    const children = await page.evaluate(`${api(page)}.visibleRows().filter((r) => r.level === 2).map((r) => r.node.cells.size.value)`);
    // The host computed the share's size as the sum of its departments and its "N changed" badge.
    expect(share.cells.size.value).toBe(children.reduce((a, b) => a + b, 0));
    await expect(row(page, "share-a").locator(".cx-badge")).toHaveText(share.badges[0].text);
    await expect(row(page, "share-a").locator(".cx-badge")).toHaveText(/^\d+ changed$/);
    await expect(row(page, "share-a").locator(".cx-cell").nth(1)).toHaveText(share.cells.size.text);
  });

  test("expands with the expander and collapses with the keyboard", async ({ page }) => {
    await row(page, "share-a/d0").locator(".cx-exp").click();
    await expect(row(page, "share-a/d0")).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "share-a/d0/p0")).toBeVisible();
    await row(page, "share-a/d0").click();
    await page.keyboard.press("ArrowLeft");
    await expect(row(page, "share-a/d0")).toHaveAttribute("aria-expanded", "false");
    await expect(row(page, "share-a/d0/p0")).toHaveCount(0);
  });

  test("pages a long child list behind show more", async ({ page }) => {
    // Inline children are already in the page, so opening the folder shows the first 100 without a load.
    // Focusing the last loaded file scrolls the virtual list so the "show more" row below it is rendered.
    await page.evaluate(`${api(page)}.expandPath(["share-a", "share-a/d0", "share-a/d0/p0", "share-a/d0/p0/f99"], { select: false })`);
    const more = page.locator(".cx-row[data-cx-status=more]");
    await expect(more).toContainText("Show more (100 of 240 loaded)");
    await more.click();
    await expect(page.locator(".cx-live")).toHaveText("200 of 240 loaded");
  });

  test("sorts siblings by a column, per level", async ({ page }) => {
    await page.getByRole("button", { name: "Size" }).click();
    await expect(page.getByRole("columnheader", { name: "Size" })).toHaveAttribute("aria-sort", "ascending");
    const sizes = await page.evaluate(`${api(page)}.visibleRows().filter((r) => r.level === 2).map((r) => r.node.cells.size.value)`);
    expect(sizes.length).toBeGreaterThan(2);
    expect(sizes).toEqual(sizes.slice().sort((a, b) => a - b));
  });

  test("the only-changed filter keeps matches and their ancestors", async ({ page }) => {
    await page.getByLabel("Only changed in the last 7 days").check();
    const rows = await page.evaluate(`${api(page)}.visibleRows().map((r) => r.node.flags || [])`);
    expect(rows.length).toBeGreaterThan(3);
    for (const flags of rows) {
      expect(flags.includes("changed") || flags.includes("changed-below")).toBeTruthy();
    }
  });

  test("search expands the tree to a hit and selects it", async ({ page }) => {
    await page.getByRole("combobox", { name: "Search files and folders" }).fill("Łódź");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(`${api(page)}.getSelected().map((n) => n.label).join("|")`)).toContain("Łódź");
    expect(await page.evaluate(`${api(page)}.getSelected().length`)).toBe(1);
    await expect(page.locator(".cx-row[aria-selected=true]")).toBeFocused();
  });

  test("detail rows host a before and after table", async ({ page }) => {
    const path = await findPath(page, (node) => !!node.detail);
    await page.evaluate(`${api(page)}.expandPath(${JSON.stringify(path.slice(0, -1))}, { expandLast: true })`);
    const detail = row(page, path[path.length - 1]);
    await expect(detail).toHaveClass(/cx-detail/);
    await expect(detail.locator("table caption")).toContainText("Changes in version");
    await expect(detail.getByRole("columnheader", { name: "Before" })).toBeVisible();
  });

  test("selection raises an event, and Shift extends a multi-select", async ({ page }) => {
    await page.evaluate(() => { window.__selected = []; document.querySelector(".cx-host").addEventListener("canopyx:select", (e) => window.__selected.push(e.detail.nodes.length)); });
    await row(page, "share-a/d0").click();
    await row(page, "share-a/d2").click({ modifiers: ["Shift"] });
    await expect(page.locator(".cx-row[aria-selected=true]")).toHaveCount(3);
    expect(await page.evaluate(() => window.__selected)).toEqual([1, 3]);
  });

  test("a deep link expands and selects its node, and selecting writes the link", async ({ page }) => {
    await page.goto("about:blank");
    await openExample(page, "inline.html", "#cx.files-inline=share-b/share-b%2Fd1");
    await expect(row(page, "share-b/d1")).toHaveAttribute("aria-selected", "true");
    await row(page, "share-b/d0").click();
    expect(await page.evaluate(() => location.hash)).toBe("#cx.files-inline=share-b/share-b%2Fd0");
  });

  test("remembers expanded folders for the session", async ({ page }) => {
    await row(page, "share-a/d1").locator(".cx-exp").click();
    await expect(row(page, "share-a/d1")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("canopyx:files-inline") || "")).toContain("share-a/d1");
    await page.reload();
    await page.waitForSelector("[data-cx-ready]");
    await expect(row(page, "share-a/d1")).toHaveAttribute("aria-expanded", "true");
  });

  test("hides and shows columns from the column chooser", async ({ page }) => {
    const grid = page.getByRole("treegrid");
    await expect(page.getByRole("columnheader", { name: "Items" })).toHaveCount(0);
    await page.getByText("Columns", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Owner" }).uncheck();
    await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
    await expect(grid).toHaveAttribute("aria-colcount", "4");
    await page.getByRole("checkbox", { name: "Items" }).check();
    await expect(page.getByRole("columnheader", { name: "Items" })).toBeVisible();
  });

  test("prints an outline of the rows that are open", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const outline = page.locator(".cx-outline-table");
    await expect(outline).toBeVisible();
    await expect(page.getByRole("treegrid")).toBeHidden();
    const visible = await page.evaluate(`${api(page)}.visibleRows().length`);
    await expect(outline.locator("tbody tr")).toHaveCount(visible);
  });
});

test.describe("sidecar bundle", () => {
  test("loads from file:// and loads children when a folder opens", async ({ page }) => {
    // Record the sidecar scripts the runtime injects (resource timing does not list file:// scripts).
    await page.addInitScript(() => {
      window.__scripts = [];
      const append = Node.prototype.appendChild;
      Node.prototype.appendChild = function (child) {
        if (child && child.tagName === "SCRIPT" && child.src) {
          window.__scripts.push(child.src);
        }
        return append.call(this, child);
      };
    });
    await openExample(page, "bundle/index.html");
    await expect(row(page, "share-a/d0")).toBeVisible();
    const before = await page.evaluate(() => window.__scripts.length);
    await row(page, "share-b").locator(".cx-exp").click();
    await expect(row(page, "share-b/d0")).toBeVisible();
    // Opening the share loaded exactly its first children page, a hashed sidecar script.
    const loaded = await page.evaluate((from) => window.__scripts.slice(from), before);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatch(/\/data\/files\/c\/[0-9a-f]{2}\/[0-9a-f]{16}-0\.js$/);
  });

  test("pages 3,000 files 250 at a time", async ({ page }) => {
    await openExample(page, "bundle/index.html");
    await page.evaluate(`${api(page)}.expandPath(["share-a", "share-a/d0", "share-a/d0/p0"], { expandLast: true, select: false, focus: false })`);
    await expect(page.locator(".cx-live")).toHaveText("250 of 3,000 loaded");
    await page.evaluate(`${api(page)}.expandPath(["share-a", "share-a/d0", "share-a/d0/p0", "share-a/d0/p0/f249"], { select: false })`);
    await expect(page.locator(".cx-row[data-cx-status=more]")).toContainText("Show more (250 of 3,000 loaded)");
  });

  test("searches the sharded index, including non-ASCII names", async ({ page }) => {
    await openExample(page, "bundle/index.html");
    await page.getByRole("combobox").fill("İstanbul lau");
    await expect(page.getByRole("option").first()).toContainText("İstanbul launch");
    await page.keyboard.press("Enter");
    // Expanding to the hit loads sidecar pages first, so wait for the selection.
    await expect.poll(() => page.evaluate(`${api(page)}.getSelected().map((n) => n.label).join()`)).toContain("İstanbul launch");
    expect(await focusedId(page)).toBeTruthy();
  });
});

test.describe("remote source", () => {
  /** A remote tree: 3 roots with 120 children each, served 50 at a time. */
  function children(ref) {
    if (!ref) {
      return ["r0", "r1", "r2"].map((id) => ({ id, label: "Root " + id, hasChildren: true, childCount: 120, cells: { size: 120 } }));
    }
    return Array.from({ length: 120 }, (_, i) => ({ id: ref + "/" + i, label: "Item " + i + " of " + ref, cells: { size: i } }));
  }

  test("pages children, searches, and refreshes counts through the endpoint templates", async ({ page }) => {
    const requests = [];
    const view = {
      protocol: "canopyx/1", type: "view", id: "remote", label: "Remote tree", rowHeight: 28, pageSize: 100, selection: "single",
      columns: [{ id: "name", title: "Name", width: 300, kind: "text" }, { id: "size", title: "Size", width: 100, kind: "number" }],
      search: { minLength: 2, maxResults: 20, placeholder: "Search" },
      source: { kind: "remote", children: "api/children?ref={ref}&cursor={cursor}", search: "api/search?q={query}&limit={limit}", counts: "api/counts?ids={ids}" }
    };
    await page.route("http://canopyx.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/index.html") {
        return route.fulfill({ contentType: "text/html", body: viewPage(view) });
      }
      requests.push(url.pathname + url.search);
      let body;
      if (url.pathname === "/api/children") {
        const all = children(url.searchParams.get("ref"));
        const offset = Number(url.searchParams.get("cursor") || 0);
        const items = all.slice(offset, offset + 50);
        body = { protocol: "canopyx/1", type: "page", parent: url.searchParams.get("ref") || null, offset, total: all.length, items, next: offset + 50 < all.length ? String(offset + 50) : null };
      } else if (url.pathname === "/api/search") {
        body = { protocol: "canopyx/1", type: "search", query: url.searchParams.get("q"), truncated: false, hits: [{ path: ["r1", "r1/110"], label: "Item 110 of r1" }] };
      } else {
        body = { protocol: "canopyx/1", type: "counts", items: url.searchParams.get("ids").split(",").map((id) => ({ id, cells: { size: 999 } })) };
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("http://canopyx.test/index.html");
    await page.waitForSelector("[data-cx-ready]");
    await row(page, "r0").locator(".cx-exp").click();
    await expect(page.locator(".cx-live")).toHaveText("50 of 120 loaded");
    await page.getByRole("combobox").fill("item 110");
    await page.getByRole("option").first().click();
    await expect(row(page, "r1/110")).toHaveAttribute("aria-selected", "true");
    expect(requests).toContain("/api/children?ref=r1&cursor=100");
    await page.evaluate(`${api(page)}.refreshCounts(["r0", "r1"])`);
    await nextFrames(page);
    const sizes = await page.evaluate(`${api(page)}.visibleRows().filter((r) => r.level === 1).map((r) => r.node.cells.size)`);
    expect(sizes.slice(0, 2)).toEqual([999, 999]);
    expect(requests.some((r) => r === "/api/counts?ids=r0,r1")).toBeTruthy();
    expect(await renderedIds(page)).toContain("r1/110");
  });
});

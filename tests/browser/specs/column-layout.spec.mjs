// On a narrow screen only one or two columns fit. The tree column can stay pinned while the others scroll, and a
// host can set a column's width.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

test.use({ viewport: { width: 390, height: 700 } });

const view = (extra) => ({ protocol: "canopyx/2", type: "view", id: "layout", label: "Layout", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 220, kind: "text" }].concat(Array.from({ length: 5 }, (_, i) => ({ id: "c" + i, title: "Column " + i, width: 200, kind: "text" }))),
  source: { kind: "inline" },
  roots: Array.from({ length: 30 }, (_, i) => ({ id: "n" + i, label: "Node " + i, cells: { c0: "zero " + i, c4: "four " + i } })), ...extra });

async function open(page, data) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

/** Left edges relative to the grid, after scrolling the grid as far right as it goes. */
async function scrolledRight(page) {
  await page.locator(".cx-grid").evaluate((grid) => { grid.scrollLeft = 100000; });
  await nextFrames(page);
  return page.evaluate(() => {
    const left = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().left - document.querySelector(".cx-grid").getBoundingClientRect().left);
    const tree = document.querySelector('[data-cx-id="n1"] .cx-tree');
    const top = document.elementFromPoint(tree.getBoundingClientRect().left + 30, tree.getBoundingClientRect().top + 10);
    return { scrolled: document.querySelector(".cx-grid").scrollLeft, head: left(".cx-hcell"), tree: left('[data-cx-id="n1"] .cx-tree'),
      background: getComputedStyle(tree).backgroundColor, hit: !!top && top.closest(".cx-cell") === tree };
  });
}

const api = "document.querySelector('.cx-host').canopyx";

test("a pinned tree column stays at the left edge, opaque and on top, while the other columns scroll", async ({ page }) => {
  await open(page, view({ pinTreeColumn: true }));
  const pinned = await scrolledRight(page);
  expect(pinned.scrolled).toBeGreaterThan(500);
  expect(pinned.head).toBeLessThanOrEqual(1);
  expect(pinned.tree).toBeLessThanOrEqual(1);
  expect(pinned.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(pinned.hit).toBe(true);
  await expect(page.locator('[data-cx-id="n1"] [aria-colindex="6"]')).toBeInViewport();
  // The pinned header wins over the resize grips of the columns under it, and the pinned cell shows the focus ring.
  expect(await page.evaluate(() => {
    const head = document.querySelector(".cx-hcell").getBoundingClientRect();
    return [10, 60, 110, 160, 210].every((x) => document.elementFromPoint(head.left + x, head.top + 10).closest(".cx-hcell") === document.querySelector(".cx-hcell"));
  })).toBe(true);
  await page.locator('[data-cx-id="n1"]').focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator('[data-cx-id="n2"] .cx-tree').evaluate((cell) => getComputedStyle(cell).outlineStyle)).toBe("solid");
  // The host lets it go again, for example on a wide screen.
  await page.evaluate(`${api}.setTreeColumnPinned(false)`);
  const free = await scrolledRight(page);
  expect(free.tree).toBeLessThan(-400);
  expect(free.head).toBeLessThan(-400);
});

test("without the option the tree column scrolls away with the rest", async ({ page }) => {
  await open(page, view());
  expect((await scrolledRight(page)).tree).toBeLessThan(-400);
});

test("the host sets a column width, within the limits of dragging", async ({ page }) => {
  await open(page, view());
  const widths = () => page.evaluate(() => [document.querySelector(".cx-hcell").getBoundingClientRect().width, document.querySelector('[data-cx-id="n0"] .cx-tree').getBoundingClientRect().width]);
  await page.evaluate(`${api}.setColumnWidth("name", 150)`);
  expect(await widths()).toEqual([150, 150]);
  await page.evaluate(`${api}.setColumnWidth("name", 3)`);
  expect(await widths()).toEqual([40, 40]);
  await expect(page.getByRole("separator", { name: "Resize Name" })).toHaveAttribute("aria-valuenow", "40");
  expect(await page.evaluate(`(() => { try { ${api}.setColumnWidth("nope", 100); return "accepted"; } catch (e) { return e.message; } })()`)).not.toBe("accepted");
});

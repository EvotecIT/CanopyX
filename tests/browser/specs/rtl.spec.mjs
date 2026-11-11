// Right to left: a tree and a flat grid on a dir="rtl" page mirror. The tree column (and the grid's first column) stays
// pinned at the right edge and a column pinned to the end edge at the left, the arrow keys follow the reading direction
// (Left opens and moves on, Right closes and moves back), and cell focus scrolls the grid the right way, where
// scrollLeft is 0 at the start and negative towards the end.
import { expect, test } from "@playwright/test";
import { focusedId, nextFrames, openExample, row, viewPage } from "./support.mjs";

test.use({ viewport: { width: 1000, height: 700 } });

/** The left and right edges of the grid's visible area, its scroll position and how far it can scroll. */
const frame = (page) => page.locator(".cx-grid").evaluate((grid) => {
  const box = grid.getBoundingClientRect(), left = box.left + grid.clientLeft;
  return { left, right: left + grid.clientWidth, scrollLeft: grid.scrollLeft, range: grid.scrollWidth - grid.clientWidth };
});
const edges = (locator) => locator.evaluate((element) => {
  const box = element.getBoundingClientRect();
  return { left: Math.round(box.left), right: Math.round(box.right) };
});
const header = (page, id) => page.locator('.cx-hcell[data-cx-column="' + id + '"]');
const scrollTo = async (page, x) => {
  await page.locator(".cx-grid").evaluate((grid, value) => { grid.scrollLeft = value; }, x);
  await nextFrames(page);
};

test("an RTL tree mirrors its columns and keeps the tree column pinned at the right edge", async ({ page }) => {
  await openExample(page, "rtl-tree.html");
  const view = await frame(page);
  expect(view.range).toBeGreaterThan(300);
  expect(view.scrollLeft).toBe(0);
  // The tree column starts at the right; the next column lies to its left; the column pinned "right" (the end) sits at the left.
  const tree = await edges(header(page, "name")), owner = await edges(header(page, "owner")), status = await edges(header(page, "status"));
  expect(Math.abs(tree.right - view.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(owner.right - tree.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(status.left - view.left)).toBeLessThanOrEqual(1);
  // Scrolling towards the end moves the other columns right, under the pinned ones, which stay where they were.
  await scrollTo(page, -300);
  expect((await frame(page)).scrollLeft).toBe(-300);
  expect(await edges(header(page, "name"))).toEqual(tree);
  expect(await edges(row(page, "team-1").locator(".cx-tree"))).toEqual(tree);
  expect(await edges(header(page, "status"))).toEqual(status);
  expect((await edges(header(page, "owner"))).left).toBe(owner.left + 300);
  // A closed expander points to the end of the line (left), an open one down; the indent grows towards the left.
  const turn = (id) => row(page, id).locator(".cx-exp").evaluate((exp) => new DOMMatrix(getComputedStyle(exp, "::before").transform).a);
  expect(await turn("team-1")).toBeLessThan(0);
  expect(await turn("team-0")).toBeGreaterThan(0);
  const label = async (id) => (await edges(row(page, id).locator(".cx-text").first())).right;
  expect(await label("doc-0-0-0")).toBeLessThan(await label("team-0-0"));
  expect(await label("team-0-0")).toBeLessThan(await label("team-0"));
});

test("in an RTL tree Left opens and enters a row, Right goes back to the parent and closes it", async ({ page }) => {
  await openExample(page, "rtl-tree.html");
  await row(page, "team-1").locator(".cx-text").first().click();
  expect(await focusedId(page)).toBe("team-1");
  await expect(row(page, "team-1")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "team-1")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  expect(await focusedId(page)).toBe("team-1-0");
  await page.keyboard.press("ArrowRight");
  expect(await focusedId(page)).toBe("team-1");
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "team-1")).toHaveAttribute("aria-expanded", "false");
  // A column's resize grip sits on its left edge, so Left widens the column and Right narrows it.
  const grip = header(page, "owner").locator(".cx-resize");
  const width = Number(await grip.getAttribute("aria-valuenow"));
  const gripBox = await edges(grip), cell = await edges(header(page, "owner"));
  expect(Math.abs(gripBox.left + (gripBox.right - gripBox.left) / 2 - cell.left)).toBeLessThanOrEqual(4);
  await grip.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grip).toHaveAttribute("aria-valuenow", String(width + 10));
  await page.keyboard.press("ArrowRight");
  await expect(grip).toHaveAttribute("aria-valuenow", String(width));
});

test("in an RTL grid Left moves to the next column and focus scrolls each cell clear of the pinned columns", async ({ page }) => {
  await openExample(page, "rtl-grid.html");
  await page.locator('.cx-row[data-cx-id="doc-0"]').focus();
  await page.keyboard.press("F2");
  const column = () => page.evaluate(() => Number(document.activeElement.getAttribute("aria-colindex")));
  expect(await column()).toBe(1);
  const pinnedStart = await edges(header(page, "name")), pinnedEnd = await edges(header(page, "status"));
  /** The focused cell lies between the pinned columns, or is one of them. */
  const visible = async () => {
    const cell = await page.evaluate(() => { const box = document.activeElement.getBoundingClientRect(); return { left: Math.round(box.left), right: Math.round(box.right), pin: document.activeElement.dataset.cxPin || "" }; });
    if (cell.pin) return true;
    return cell.left >= pinnedEnd.right - 1 && cell.right <= pinnedStart.left + 1;
  };
  for (let index = 2; index <= 8; index++) {
    await page.keyboard.press("ArrowLeft");
    expect(await column()).toBe(index);
    expect(await visible(), "column " + index + " in view").toBe(true);
  }
  // The description column lies past the visible width at the start: reaching it scrolled towards the end (negative).
  expect((await frame(page)).scrollLeft).toBeLessThan(0);
  for (let index = 7; index >= 2; index--) {
    await page.keyboard.press("ArrowRight");
    expect(await column()).toBe(index);
    expect(await visible(), "column " + index + " in view").toBe(true);
  }
  expect((await frame(page)).scrollLeft).toBe(0);
});

// A tree whose cells hold host controls, on a right-to-left page: the cell half of the tree grid pattern mirrors too.
const view = { protocol: "canopyx/2", type: "view", id: "rtl-cells", label: "רשומות", rowHeight: 28, pageSize: 100, pinTreeColumn: true,
  columns: [{ id: "name", title: "שם", width: 200, kind: "text" }, ...["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: id, width: 220, minWidth: 220, kind: "text" }))],
  source: { kind: "inline" },
  roots: [{ id: "group", label: "קבוצה", expanded: true, children: ["r1", "r2"].map((id) => ({ id, label: "רשומה " + id, cells: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 } })) }] };
const hostScript = `CanopyX.configure("rtl-cells", { renderers: Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id) => [id, (node, el) => {
  if (!node.cells) return false; const b = document.createElement("button"); b.type = "button"; b.textContent = id + " " + node.id; el.appendChild(b); return true; }])) });`;

test("in an RTL tree Left walks into a row's cells and focus scrolls the grid towards the end", async ({ page }) => {
  const html = viewPage(view).replace('<html lang="en">', '<html lang="he" dir="rtl">').replace("</head>", () => "<script>" + hostScript + "</script></head>");
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await row(page, "r1").locator(".cx-text").first().click();
  const tree = await edges(row(page, "r1").locator(".cx-tree"));
  const text = () => page.evaluate(() => document.activeElement.textContent.trim() || document.activeElement.getAttribute("data-cx-id"));
  const clear = async () => {
    const box = await page.evaluate(() => { const b = document.activeElement.getBoundingClientRect(); return { left: b.left, right: b.right }; });
    const grid = await frame(page);
    return box.left >= grid.left - 1 && box.right <= tree.left + 1;
  };
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    await page.keyboard.press("ArrowLeft");
    expect(await text()).toBe(id + " r1");
    expect(await clear(), id + " clear of the pinned tree column").toBe(true);
  }
  expect((await frame(page)).scrollLeft).toBeLessThan(0);
  for (const id of ["e", "d", "c", "b", "a"]) {
    await page.keyboard.press("ArrowRight");
    expect(await text()).toBe(id + " r1");
    expect(await clear(), id + " clear of the pinned tree column").toBe(true);
  }
  // Right from the first cell's control goes back to the row (via the first cell).
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await focusedId(page)).toBe("r1");
});

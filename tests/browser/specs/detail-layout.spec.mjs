// Detail rows: as tall as their content unless they declare a height, inside the visible width however wide the
// columns are, with table text that wraps and optional column width shares.
import { expect, test } from "@playwright/test";
import { nextFrames, row, viewPage } from "./support.mjs";

const long = "A value long enough to wrap onto several lines inside one column of the table. ".repeat(3).trim();
const columns = [{ id: "name", title: "Name", width: 300, kind: "text" }]
  .concat(Array.from({ length: 8 }, (_, i) => ({ id: "c" + i, title: "Column " + i, width: 260, kind: "text" })));
const view = (roots) => ({ protocol: "canopyx/1", type: "view", id: "details", label: "Details", rowHeight: 28, pageSize: 100,
  selection: "single", columns, source: { kind: "inline" }, roots });
const table = (rows, more) => ({ type: "table", columns: ["Setting", "Before", "After"],
  rows: Array.from({ length: rows }, (_, i) => ["Setting " + i, long, "After " + i]), ...more });
const parent = (id, detail) => ({ id, label: "Parent " + id, expanded: true, children: [{ id: id + "/detail", label: "Detail", detail }] });

async function open(page, roots) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view(roots)) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

/** Geometry of a detail row: its box, its body's box and scroll size, and the box of the row after it. */
function measure(page, id, nextId) {
  return page.evaluate(([id, nextId]) => {
    const rect = (element) => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }; };
    const rowEl = document.querySelector(".cx-row[data-cx-id=\"" + id + "\"]");
    const body = rowEl.querySelector(".cx-detail-body");
    const next = document.querySelector(".cx-row[data-cx-id=\"" + nextId + "\"]");
    const grid = document.querySelector(".cx-grid");
    return { row: rect(rowEl), body: rect(body), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, next: next && rect(next),
      grid: { left: grid.getBoundingClientRect().left, right: grid.getBoundingClientRect().left + grid.clientWidth } };
  }, [id, nextId]);
}

test("a detail row without a height is as tall as its content, and the next row follows it", async ({ page }) => {
  await open(page, [parent("a", table(6)), { id: "b", label: "B" }]);
  const box = await measure(page, "a/detail", "b");
  // Six rows of wrapped text need far more than the seven slots an estimate from the row count gives.
  expect(box.row.height).toBeGreaterThan(7 * 28);
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
  expect(Math.abs(box.next.top - box.row.bottom)).toBeLessThanOrEqual(1);
  // The text wraps instead of being cut: no cell is wider than its column.
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".cx-detail-table td")].filter((td) => td.scrollWidth > td.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

test("a narrower grid wraps more text, and the row and the rows below follow", async ({ page }) => {
  await open(page, [parent("a", table(4)), { id: "b", label: "B" }]);
  const wide = await measure(page, "a/detail", "b");
  await page.setViewportSize({ width: 520, height: 900 });
  await expect.poll(async () => (await measure(page, "a/detail", "b")).row.height).toBeGreaterThan(wide.row.height + 28);
  // The row grows at once; the runtime measures it in the next frame and moves the rows below.
  await expect.poll(async () => { const box = await measure(page, "a/detail", "b"); return Math.abs(box.next.top - box.row.bottom); }).toBeLessThanOrEqual(1);
  const narrow = await measure(page, "a/detail", "b");
  expect(narrow.scrollHeight).toBeLessThanOrEqual(narrow.clientHeight + 1);
});

test("a declared height keeps the row at that many slots and scrolls inside it", async ({ page }) => {
  await open(page, [parent("a", table(30, { height: 4 })), { id: "b", label: "B" }]);
  const box = await measure(page, "a/detail", "b");
  expect(Math.round(box.row.height)).toBe(4 * 28);
  expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  expect(Math.abs(box.next.top - box.row.bottom)).toBeLessThanOrEqual(1);
});

for (const host of [false, true]) {
  test(`detail content ${host ? "drawn by the host " : ""}stays inside the visible width while the grid scrolls sideways`, async ({ page }) => {
    await open(page, [parent("a", table(3)), { id: "b", label: "B" }]);
    if (host) {
      await page.evaluate(() => {
        const element = document.querySelector(".cx-host");
        const data = element.canopyx.view;
        element.canopyx.destroy();
        window.api = CanopyX.createTreeGrid(element, { view: data, renderDetail(node, body) {
          const block = document.createElement("p");
          block.textContent = "Host content ".repeat(80);
          body.appendChild(block);
          return true;
        } });
        return window.api.ready;
      });
      await nextFrames(page);
    }
    // Nine columns are about 2,400 px wide; the viewport is 1,400 px.
    for (const left of [0, 100000]) {
      await page.locator(".cx-grid").evaluate((grid, x) => { grid.scrollLeft = x; }, left);
      await nextFrames(page);
      const box = await measure(page, "a/detail", "b");
      expect(box.body.left).toBeGreaterThanOrEqual(box.grid.left);
      expect(box.body.right).toBeLessThanOrEqual(box.grid.right + 1);
      expect(box.body.width).toBeGreaterThan((box.grid.right - box.grid.left) * 0.9);
      expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
    }
    expect(await page.locator(".cx-grid").evaluate((grid) => grid.scrollLeft)).toBeGreaterThan(500);
  });
}

test("column widths are shares of the table width", async ({ page }) => {
  await open(page, [parent("a", table(2, { widths: [3, 1, 1] }))]);
  const widths = await page.evaluate(() => [...document.querySelectorAll(".cx-detail-table th")].map((th) => th.getBoundingClientRect().width));
  expect(widths[0] / widths[1]).toBeCloseTo(3, 1);
  expect(widths[1] / widths[2]).toBeCloseTo(1, 1);
});

test("the focused row is in view after a jump across detail rows that were not measured yet", async ({ page }) => {
  await open(page, Array.from({ length: 60 }, (_, i) => parent("p" + i, table(1 + (i * 7) % 11))).concat([{ id: "last", label: "Last" }]));
  await row(page, "p0").click();
  await page.keyboard.press("End");
  await nextFrames(page);
  const place = await page.evaluate(() => {
    const grid = document.querySelector(".cx-grid");
    const focused = document.activeElement.getBoundingClientRect();
    const box = grid.getBoundingClientRect();
    return { id: document.activeElement.getAttribute("data-cx-id"), top: focused.top - box.top - document.querySelector(".cx-head").offsetHeight, below: box.top + grid.clientHeight - focused.bottom };
  });
  expect(place.id).toBe("last");
  expect(place.top).toBeGreaterThanOrEqual(0);
  expect(place.below).toBeGreaterThanOrEqual(-1);
});

test("the print outline lays a detail out in the outline's own width", async ({ page }) => {
  await open(page, [parent("a", table(3))]);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const body = await page.locator(".cx-outline .cx-detail-body").evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, width: element.getBoundingClientRect().width, cell: element.parentElement.getBoundingClientRect().width };
  });
  expect(body.position).toBe("static");
  expect(body.width).toBeGreaterThan(100);
  expect(body.width).toBeLessThanOrEqual(body.cell);
});

test("rows keep their place and never overlap while detail rows of unknown height scroll into view", async ({ page }) => {
  await open(page, Array.from({ length: 60 }, (_, i) => parent("p" + i, table(1 + (i * 7) % 11))));
  const rows = () => page.evaluate(() => {
    const grid = document.querySelector(".cx-grid");
    const top = grid.getBoundingClientRect().top + document.querySelector(".cx-head").offsetHeight;
    return [...document.querySelectorAll(".cx-row")].sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
      .map((el) => ({ id: el.getAttribute("data-cx-id"), index: Number(el.getAttribute("aria-rowindex")), top: el.getBoundingClientRect().top - top, bottom: el.getBoundingClientRect().bottom - top }));
  });
  const consecutive = (list) => list.slice(1).map((r, i) => [list[i], r]).filter(([a, b]) => b.index === a.index + 1);
  const check = (list) => {
    for (const [a, b] of consecutive(list)) {
      expect(Math.abs(b.top - a.bottom), a.id + " then " + b.id).toBeLessThanOrEqual(1);
    }
  };
  check(await rows());
  // Jump to the end: every row above is still at its estimated height. Scrolling back up measures them one by one.
  await page.locator(".cx-grid").evaluate((grid) => { grid.scrollTop = grid.scrollHeight; });
  await nextFrames(page);
  check(await rows());
  for (let step = 0; step < 25; step++) {
    const before = (await rows()).find((r) => r.top >= 0);
    await page.locator(".cx-grid").evaluate((grid) => { grid.scrollTop -= 150; });
    await nextFrames(page);
    const after = await rows();
    check(after);
    const same = after.find((r) => r.id === before.id);
    // A row measured above the viewport changes the total height; what the reader sees must only move by the scroll.
    if (same) expect(Math.abs(same.top - (before.top + 150)), "row " + before.id + " at step " + step).toBeLessThanOrEqual(2);
  }
});

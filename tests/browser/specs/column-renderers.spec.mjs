// Host renderers are per column: the host draws the columns it names, and every other column keeps the default
// painter and its cell reuse, which is what keeps scrolling smooth under CPU pressure.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "renderers", label: "Renderers", rowHeight: 28, pageSize: 1000, selection: "single",
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }, { id: "state", title: "State", width: 140, kind: "text" },
    { id: "size", title: "Size", width: 120, kind: "number" }, { id: "spare", title: "Spare", width: 120, kind: "text", hidden: true }],
  source: { kind: "inline" },
  roots: Array.from({ length: 600 }, (_, i) => ({ id: "n" + i, label: "Node " + i, cells: { state: { value: i % 3 ? "ok" : "late", tone: i % 3 ? "success" : "warning" }, size: i * 10 } })) };

async function open(page) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

/** Replaces the auto-mounted grid with one the test configures; options is the source of an object literal. */
function remount(page, options) {
  return page.evaluate((source) => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, new Function("data", "return (" + source + ");")(data));
    return window.api.ready;
  }, options);
}

test("a host draws the column it names, and the other columns reuse their cells while rows are recycled", async ({ page }) => {
  await open(page);
  await remount(page, `{ view: data, renderers: { state(node, element, context) {
    (window.calls = window.calls || []).push(context.column + ":" + context.index + ":" + context.level);
    const chip = document.createElement("span");
    chip.className = "host-chip";
    chip.textContent = node.cells.state.value.toUpperCase();
    element.appendChild(chip);
    return true;
  } } }`);
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n0"] .host-chip')).toHaveText("LATE");
  await expect(page.locator('[data-cx-id="n0"] [aria-colindex="1"]')).toHaveText("Node 0");
  await expect(page.locator('[data-cx-id="n1"] [aria-colindex="3"]')).toHaveText("10");
  // Remember every cell on screen, then scroll far enough that every row shows another node.
  await page.evaluate(() => {
    window.seen = new WeakSet(document.querySelectorAll(".cx-row .cx-cell"));
    window.before = document.querySelectorAll(".cx-row").length;
    window.calls = [];
    document.querySelector(".cx-grid").scrollTop = 6000;
  });
  await nextFrames(page);
  const after = await page.evaluate(() => {
    const cells = (index) => [...document.querySelectorAll(".cx-row [aria-colindex=\"" + index + "\"]")];
    const reused = (list) => list.filter((cell) => window.seen.has(cell)).length;
    return { first: document.querySelector(".cx-row").getAttribute("data-cx-id"), rows: document.querySelectorAll(".cx-row").length, before: window.before,
      name: reused(cells(1)), state: reused(cells(2)), size: reused(cells(3)), calls: [...new Set(window.calls)], callCount: window.calls.length,
      chips: cells(2).every((cell) => cell.querySelector(".host-chip")) };
  });
  expect(after.first).not.toBe("n0");
  expect(after.rows).toBeGreaterThan(20);
  // Every row element from before shows another node now (the window also grew by the rows above it). The default
  // columns kept their cell elements; the host's column was rebuilt for each row it was painted for.
  expect(after.before).toBeGreaterThan(20);
  expect(after.name).toBe(after.before);
  expect(after.size).toBe(after.before);
  expect(after.state).toBe(0);
  expect(after.chips).toBe(true);
  // The renderer ran for its own column only, once per painted row, with the column's place in view.columns.
  expect(after.calls).toEqual(["state:1:1"]);
  expect(after.callCount).toBe(after.rows);
});

test("a renderer that returns false leaves the default painting, tone included", async ({ page }) => {
  await open(page);
  await remount(page, "{ view: data, renderers: { state(node, element) { element.classList.add('host-mark'); return node.id === 'n1'; } } }");
  await nextFrames(page);
  const late = page.locator('[data-cx-id="n0"] [aria-colindex="2"]');
  await expect(late).toHaveText("late");
  await expect(late).toHaveClass(/host-mark/);
  await expect(late).toHaveClass(/cx-tone-warning/);
  await expect(page.locator('[data-cx-id="n1"] [aria-colindex="2"]')).toHaveText("");
});

for (const [name, options, message] of [
  ["the single renderCell callback", "{ view: data, renderCell() { return false; } }", "renderCell was replaced by renderers"],
  ["a renderer for a column the view does not have", "{ view: data, renderers: { nope() { return true; } } }", "not for 'nope'"],
  ["a renderer that is not a function", "{ view: data, renderers: { state: true } }", "not for 'state'"],
  ["renderers that are not a plain object", "{ view: data, renderers: new Map([['state', () => true]]) }", "plain object"]
]) {
  test(`${name} is rejected when the grid is created`, async ({ page }) => {
    await open(page);
    const error = await remount(page, options).then(() => null, (failure) => failure.message);
    expect(error).toContain(message);
  });
}

test("a hidden column can have a renderer, which draws it once the column is shown", async ({ page }) => {
  await open(page);
  await remount(page, "{ view: data, renderers: { spare(node, element, context) { element.textContent = 'spare ' + context.index; return true; } } }");
  await page.evaluate(() => window.api.setColumnVisible("spare", true));
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n0"] [aria-colindex="4"]')).toHaveText("spare 3");
});

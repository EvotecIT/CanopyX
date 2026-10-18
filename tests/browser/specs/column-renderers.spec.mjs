// Host renderers are per column: the host draws the columns it names, and every other column keeps the default
// painter and its cell reuse, which is what keeps scrolling smooth under CPU pressure.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "renderers", label: "Renderers", rowHeight: 28, pageSize: 1000, selection: "single",
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

test("rows a renderer leaves to the default keep their cells while rows are recycled", async ({ page }) => {
  await open(page);
  // The renderer draws one node and leaves the element it gets untouched for every other node.
  await remount(page, `{ view: data, renderers: { state(node, element) {
    if (node.id !== "n0") return false;
    const chip = document.createElement("span");
    chip.className = "host-chip";
    chip.textContent = "DRAWN";
    element.appendChild(chip);
    return true;
  } } }`);
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n0"] .host-chip')).toHaveText("DRAWN");
  await expect(page.locator('[data-cx-id="n1"] [aria-colindex="2"]')).toHaveText("ok");
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".cx-row [aria-colindex=\"2\"]")];
    window.seen = new WeakSet(cells);
    window.before = cells.length;
    document.querySelector(".cx-grid").scrollTop = 6000;
  });
  await nextFrames(page);
  const after = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".cx-row [aria-colindex=\"2\"]")];
    const late = cells.find((cell) => Number(cell.closest(".cx-row").getAttribute("data-cx-id").slice(1)) % 3 === 0);
    return { reused: cells.filter((cell) => window.seen.has(cell)).length, before: window.before, chips: document.querySelectorAll(".host-chip").length,
      texts: cells.every((cell) => /^(ok|late)$/.test(cell.textContent)), late: late && late.textContent, lateTone: late && late.classList.contains("cx-tone-warning") };
  });
  // Every cell that showed a default painting before is still there; only the row that showed n0 got a new cell.
  expect(after.before).toBeGreaterThan(20);
  expect(after.reused).toBe(after.before - 1);
  expect(after.chips).toBe(0);
  expect(after.texts).toBe(true);
  expect(after.late).toBe("late");
  expect(after.lateTone).toBe(true);
  // Back at the top the renderer draws n0 again, without the default text, and its neighbours keep the default.
  await page.evaluate(() => { document.querySelector(".cx-grid").scrollTop = 0; });
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n0"] [aria-colindex="2"]')).toHaveText("DRAWN");
  await expect(page.locator('[data-cx-id="n0"] [aria-colindex="2"]')).not.toHaveClass(/cx-tone-warning/);
  await expect(page.locator('[data-cx-id="n3"] [aria-colindex="2"]')).toHaveText("late");
});

test("the tree column keeps its content for rows its renderer leaves to the default, and is cleaned when the host draws", async ({ page }) => {
  await open(page);
  await remount(page, `{ view: data, renderers: { name(node, element) {
    if (node.id !== "n0") return false;
    element.textContent = "HOST";
    return true;
  } } }`);
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n0"] [aria-colindex="1"] .cx-content')).toHaveText("HOST");
  await page.evaluate(() => {
    window.seen = new WeakSet(document.querySelectorAll(".cx-row [aria-colindex=\"1\"] .cx-content"));
    window.before = document.querySelectorAll(".cx-row").length;
    document.querySelector(".cx-grid").scrollTop = 6000;
  });
  await nextFrames(page);
  const after = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".cx-row [aria-colindex=\"1\"]")];
    return { reused: cells.filter((cell) => window.seen.has(cell.querySelector(".cx-content"))).length, before: window.before,
      labels: cells.every((cell) => /^Node \d+$/.test(cell.querySelector(".cx-content").textContent)),
      shape: cells.every((cell) => cell.querySelector(".cx-indent") && cell.querySelector(".cx-exp") && cell.querySelectorAll(".cx-content").length === 1) };
  });
  expect(after.reused).toBe(after.before - 1);
  expect(after.labels).toBe(true);
  expect(after.shape).toBe(true);
});

test("a renderer that throws once leaves the cell as it was for the next nodes", async ({ page }) => {
  await open(page);
  await remount(page, `{ view: data, renderers: { state(node) {
    if (window.failNext) { window.failNext = false; throw new Error("host failure"); }
    return false;
  } } }`);
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="n1"] [aria-colindex="2"]')).toHaveText("ok");
  // One paint fails; the rows painted after it, recycled for other nodes, still show their default text.
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => { window.failNext = true; window.api.refresh(); });
  await nextFrames(page);
  await page.evaluate(() => { document.querySelector(".cx-grid").scrollTop = 6000; });
  await nextFrames(page);
  const texts = await page.evaluate(() => [...document.querySelectorAll(".cx-row [aria-colindex=\"2\"]")].map((cell) => cell.textContent));
  expect(texts.length).toBeGreaterThan(20);
  expect(texts.every((text) => text === "ok" || text === "late")).toBe(true);
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
  ["a renderer for a column the view does not have", "{ view: data, renderers: { nope() { return true; } } }", "renderers"],
  ["a renderer that is not a function", "{ view: data, renderers: { state: true } }", "renderers"],
  ["renderers that are not a plain object", "{ view: data, renderers: new Map([['state', () => true]]) }", "renderers"]
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

test("host renderer cells keep fitted geometry after refresh, state restoration and resize", async ({ page }) => {
  await open(page);
  await remount(page, `{ view: { ...data, columns: data.columns.map(({ width, ...column }) => ({ ...column, autoWidth: true })) },
    renderers: { state(node, element) { element.textContent = node.cells.state.value; return true; },
      size(node, element) { element.textContent = String(node.cells.size); return true; } } }`);
  await page.evaluate(() => { document.querySelector(".cx-host").style.width = "520px"; });
  await expect.poll(() => page.locator('.cx-hcell[data-cx-column="state"]').evaluate(cell => cell.getBoundingClientRect().width)).toBeLessThan(140);
  const mismatches = () => page.evaluate(() => {
    const row = document.querySelector('.cx-row[data-cx-id="n0"]');
    const headers = [...document.querySelectorAll('.cx-head .cx-hcell')];
    if (headers.length < 2) return ["missing headers"];
    return headers.flatMap(head => {
      const cell = row?.querySelector('[aria-colindex="' + head.getAttribute("aria-colindex") + '"]');
      if (!cell) return ["missing cell"];
      const h = head.getBoundingClientRect(), c = cell.getBoundingClientRect();
      return Math.abs(h.left - c.left) > 1 || Math.abs(h.width - c.width) > 1 ? [head.dataset.cxColumn + ":" + Math.round(h.width) + "/" + Math.round(c.width)] : [];
    });
  });
  await page.evaluate(() => window.api.refresh());
  await nextFrames(page);
  await expect.poll(mismatches).toEqual([]);
  await page.evaluate(() => window.api.setState(window.api.getState()));
  await expect.poll(mismatches).toEqual([]);
  await page.evaluate(() => { document.querySelector(".cx-host").style.width = "440px"; window.api.refresh(); });
  await expect.poll(mismatches).toEqual([]);
});

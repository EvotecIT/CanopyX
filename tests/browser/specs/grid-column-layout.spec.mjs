import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "grid", id: "layout", label: "Column layout", source: { kind: "inline" },
  rowHeight: 28, pageSize: 100, selection: "multiple", search: true,
  columns: [
    { id: "name", title: "Name", kind: "text", width: 160, sortable: true },
    { id: "hidden", title: "Hidden", kind: "text", width: 120, hidden: true },
    { id: "amount", title: "Amount", kind: "number", width: 140, sortable: true },
    { id: "notes", title: "Notes", kind: "text", width: 180 }
  ], reporting: { columnReorder: true, layout: { name: { minimum: 100, maximum: 240 }, notes: { minimum: 120, maximum: 900, flex: 2 } } },
  rows: Array.from({ length: 350 }, (_, index) => ({ id: "r" + index, cells: { name: "Name " + index,
    hidden: "Hidden " + index, amount: index, notes: index === 349 ? "Very long uncached value ".repeat(1000) : "Notes " + index } })) };
async function open(page, patch = {}) {
  await page.route("http://canopyx.test/layout", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, ...patch })
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Column layout</h1>').replace('</body>', '</main></body>') }));
  await page.goto("http://canopyx.test/layout"); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
}
const header = (page, id) => page.locator('.cx-hcell[data-cx-column="' + id + '"]');
const ids = page => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.map(column => column.id));

test("column-owned bounds and retention policies govern reporting without a separate layout map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, { reporting: { responsive: true }, columns: [
    { id: "name", title: "Name", kind: "text", width: 160, minWidth: 140, maxWidth: 220, priority: 0, alwaysVisible: true },
    view.columns[1],
    { id: "amount", title: "Amount", kind: "number", width: 140, priority: 1, pinned: "right" },
    { id: "notes", title: "Notes", kind: "text", width: 180, minWidth: 120, maxWidth: 900, flex: 2, priority: 2 }
  ] });
  await expect(header(page, "name")).toBeVisible(); await expect(header(page, "amount")).toBeVisible();
  await expect(header(page, "notes")).toHaveCount(0);
  const widths = await page.evaluate(() => {
    const api = document.querySelector('[data-canopyx-host]').canopyx, width = () => api.getState().columns.find(column => column.id === "name").width;
    api.setColumnWidth("name", 500); const maximum = width(); api.setColumnWidth("name", 40);
    return { maximum, minimum: width() };
  });
  expect(widths).toEqual({ maximum: 220, minimum: 140 });
  await expect(header(page, "name").getByRole("separator")).toHaveAttribute("aria-valuemin", "140");
  await expect(header(page, "name").getByRole("separator")).toHaveAttribute("aria-valuemax", "220");
});

test("column-owned flex weights share spare width and survive saved-state restoration", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await open(page, { reporting: {}, columns: [
    { ...view.columns[0], fixed: true, minWidth: 160, maxWidth: 160 }, view.columns[1],
    { ...view.columns[2], width: 100, minWidth: 100, maxWidth: 900, flex: 1, autoSize: "none" },
    { ...view.columns[3], width: 100, minWidth: 100, maxWidth: 900, flex: 3, autoSize: "none" }
  ] });
  const widths = async () => [(await header(page, "amount").boundingBox()).width, (await header(page, "notes").boundingBox()).width];
  const initial = await widths(); expect(initial[0]).toBeGreaterThan(200);
  expect((initial[1] - 100) / (initial[0] - 100)).toBeCloseTo(3, 1);
  const state = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState());
  expect(state.columns.find(column => column.id === "amount")).toMatchObject({ width: 100, flex: true });
  expect(state.columns.find(column => column.id === "notes")).toMatchObject({ width: 100, flex: true });
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("notes", 180));
  await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), state); await nextFrames(page);
  const restored = await widths(); expect(restored[0]).toBeCloseTo(initial[0], 0); expect(restored[1]).toBeCloseTo(initial[1], 0);
});

test("width constraints apply to API and keyboard; flex sizing keeps base widths and survives state restoration", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 }); await open(page);
  const notes = header(page, "notes"), initial = (await notes.boundingBox()).width; expect(initial).toBeGreaterThan(500);
  const state = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState());
  expect(state.columns.find(column => column.id === "notes")).toMatchObject({ width: 180, flex: true });
  await page.setViewportSize({ width: 700, height: 700 }); await nextFrames(page); expect((await notes.boundingBox()).width).toBeLessThan(initial);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("name", 500));
  expect((await header(page, "name").boundingBox()).width).toBe(240);
  const grip = header(page, "name").getByRole("separator"); await grip.press("Home");
  await expect(grip).toHaveAttribute("aria-valuemin", "100"); await expect(grip).toHaveAttribute("aria-valuenow", "100");
  expect(await page.locator('.cx-row[data-cx-id="r0"] [role=gridcell]').first().evaluate(cell => cell.getBoundingClientRect().width)).toBe(100);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("notes", 220)); expect((await notes.boundingBox()).width).toBe(220);
  expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.find(c => c.id === "notes").flex)).toBe(false);
  await page.evaluate(saved => document.querySelector('[data-canopyx-host]').canopyx.setState(saved), state); await nextFrames(page);
  expect((await notes.boundingBox()).width).toBeGreaterThan(220);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.resetView()); await nextFrames(page);
  expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.find(c => c.id === "notes").flex)).toBe(true);
});

test("keyboard moves preserve hidden columns, sort priority, focus and export column order", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.sort([{ column: "amount", direction: "desc" }, { column: "name", direction: "asc" }]));
  const move = header(page, "amount").getByRole("button", { name: /drag to move/ }); await move.press("ArrowLeft");
  expect(await ids(page)).toEqual(["amount", "name", "hidden", "notes"]); await expect(move).toBeFocused();
  await expect(header(page, "amount")).toHaveAttribute("data-cx-sort-priority", "1");
  const request = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "filtered" }).request);
  expect(request.columns.map(column => column.id)).toEqual(["amount", "name", "notes"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("API reordering returns focus to the same record and column", async ({ page }) => {
  await open(page); await page.locator('.cx-row[data-cx-id="r0"]').press("F2"); await page.keyboard.press("ArrowRight");
  await expect(page.locator('.cx-row[data-cx-id="r0"] [role=gridcell]').nth(1)).toBeFocused();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnOrder(["notes", "amount", "name", "hidden"])); await nextFrames(page);
  expect(await page.evaluate(() => ({ text: document.activeElement.textContent, row: document.activeElement.closest('[data-cx-id]')?.getAttribute('data-cx-id') })))
    .toEqual({ text: "0", row: "r0" });
});

test("pointer moves show feedback and commit at release; Escape cancels without changing order", async ({ page }) => {
  await open(page); const start = await header(page, "name").locator(".cx-column-move").boundingBox(), target = await header(page, "amount").boundingBox();
  for (const cancel of [true, false]) {
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + target.width - 15, target.y + target.height / 2, { steps: 4 });
    await expect(page.locator(".cx-column-drag")).toBeVisible(); expect(await ids(page)).toEqual(["name", "hidden", "amount", "notes"]);
    if (cancel) await page.keyboard.press("Escape"); await page.mouse.up(); await expect(page.locator(".cx-column-drag")).toHaveCount(0);
    expect(await ids(page)).toEqual(cancel ? ["name", "hidden", "amount", "notes"] : ["hidden", "amount", "name", "notes"]);
  }
  await expect(header(page, "name").locator(".cx-column-move")).toBeFocused();
});

test("auto-fit samples at most 200 accepted cached values and ignores custom mounted DOM", async ({ page }) => {
  await open(page); const result = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.autoFitColumn("notes"));
  expect(result.scope).toBe("loaded"); expect(result.sampled).toBeGreaterThan(0); expect(result.sampled).toBeLessThanOrEqual(200); expect(result.width).toBeLessThan(800);
  const grip = header(page, "notes").getByRole("separator"); await grip.press("Enter"); await expect(grip).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.find(c => c.id === "notes").flex)).toBe(false);
  await page.evaluate(() => {
    const host = document.querySelector('[data-canopyx-host]'), definition = host.canopyx.view; host.canopyx.destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view: definition, renderers: { name: (_, element) => { element.textContent = "Large host markup ".repeat(1000); return true; } } });
    return host.canopyx.ready;
  });
  expect((await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.autoFitColumn("name"))).width).toBeLessThan(240);
});

test("invalid policies and saved flex intent reject before accepted state is changed", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => { const api = document.querySelector('[data-canopyx-host]').canopyx, state = api.getState(); state.columns[0].flex = "yes";
    return api.setState(state).then(() => false, () => true); })).toBe(true);
  expect(await ids(page)).toEqual(["name", "hidden", "amount", "notes"]);
  expect(await page.evaluate(() => { const definition = document.querySelector('[data-canopyx-host]').canopyx.view; definition.reporting.layout.name.minimum = 200;
    try { CanopyX.createDataGrid(document.createElement("div"), { view: definition }); return false; } catch { return true; } })).toBe(true);
});

async function expectHeaderFocusVisible(page) {
  await expect.poll(() => page.evaluate(() => {
    const focused = document.activeElement, frame = document.querySelector(".cx-grid"), box = focused.getBoundingClientRect(), outer = frame.getBoundingClientRect();
    return box.left >= outer.left + frame.clientLeft - 1 && box.right <= outer.left + frame.clientLeft + frame.clientWidth + 1;
  })).toBe(true);
}

test("moving a non-sortable header reveals its focused move control without moving the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page, { columns: ["a", "b", "c"].map(id => ({ id, title: id, kind: "text", width: 160, fixed: true, priority: "essential" })),
    reporting: { columnReorder: true }, rows: [{ id: "r0", cells: { a: "A", b: "B", c: "C" } }] });
  await header(page, "a").locator(".cx-column-move").press("ArrowRight");
  await page.keyboard.press("ArrowRight"); await nextFrames(page);
  await expect(header(page, "a").locator(".cx-column-move")).toBeFocused(); await expectHeaderFocusVisible(page);
  expect(await page.evaluate(() => ({ grid: document.querySelector(".cx-grid").scrollLeft, page: scrollX }))).toMatchObject({ page: 0 });
  expect(await page.locator(".cx-grid").evaluate(grid => grid.scrollLeft)).toBeGreaterThan(0);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnOrder(["a", "b", "c"]));
  await nextFrames(page); await expectHeaderFocusVisible(page);
});

test("auto-fit keeps a widened column's focused resize control visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, { columns: view.columns.map(column => column.id === "notes" ? { ...column, priority: "essential", alwaysVisible: true } : column), rows: [{ id: "r0", cells: { name: "Name", notes: "Long report notes ".repeat(60) } }] });
  const grip = header(page, "notes").getByRole("separator"); await grip.press("Enter"); await nextFrames(page);
  await expect(grip).toBeFocused(); await expectHeaderFocusVisible(page);
  expect(await grip.getAttribute("aria-valuenow")).toBe("420");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnOrder(["notes", "name", "hidden", "amount"]));
  await nextFrames(page); await expect(grip).toBeFocused(); await expectHeaderFocusVisible(page);
});

for (const control of ["button", "input"]) test("API reordering retains the entered host " + control + " despite unreachable siblings", async ({ page }) => {
  await open(page);
  await page.evaluate(control => {
    const host = document.querySelector('[data-canopyx-host]'), definition = host.canopyx.view; host.canopyx.destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view: definition, renderers: { name: (_, cell) => {
      const hidden = document.createElement("button"); hidden.hidden = true; hidden.textContent = "Hidden"; cell.append(hidden);
      const disabled = document.createElement("button"); disabled.disabled = true; disabled.textContent = "Disabled"; cell.append(disabled);
      for (const name of ["A", "B"]) {
        const item = document.createElement(control); item.setAttribute("aria-label", name); item.textContent = name;
        if (control === "button") { item.type = "button"; item.onclick = () => { window.activated = name; }; }
        else item.value = name;
        cell.append(item);
      }
      return true;
    } } }); return host.canopyx.ready;
  }, control);
  const entered = page.locator('.cx-row[data-cx-id="r0"]').getByLabel("A", { exact: true }); await entered.focus();
  if (control === "input") await entered.evaluate(input => input.setSelectionRange(input.value.length, input.value.length));
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnOrder(["notes", "amount", "name", "hidden"])); await nextFrames(page);
  await expect(entered).toBeFocused();
  if (control === "button") { await page.keyboard.press("Enter"); expect(await page.evaluate(() => window.activated)).toBe("A"); }
  else { await page.keyboard.type("x"); await expect(entered).toHaveValue("Ax"); }
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames, openExample } from "./support.mjs";

const columns = ["name", "region", "owner", "notes", "action"].map(id => ({ id, title: id, kind: "text", width: 160, sortable: true }));
const view = { protocol: "canopyx/2", type: "grid", id: "placement", label: "Responsive inventory", rowHeight: 28,
  pageSize: 100, selection: "multiple", search: true, source: { kind: "inline" }, columns,
  reporting: { columnReorder: true, layout: { name: { minimum: 100, maximum: 300, pin: "left", priority: 0, alwaysVisible: true },
    notes: { minimum: 40, maximum: 600, priority: 20 }, action: { minimum: 80, maximum: 240, pin: "right", priority: 1 } } },
  rows: Array.from({ length: 100 }, (_, i) => ({ id: "r" + i, cells: { name: "Record " + i, region: "West", owner: "Alex",
    notes: "Find this hidden field " + i, action: "Inspect" } })) };
async function open(page, patch = {}) {
  await page.route("http://canopyx.test/placement", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, ...patch })
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Responsive inventory</h1>').replace('</body>', '</main></body>') }));
  await page.goto("http://canopyx.test/placement"); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
}
const api = (page, run) => page.evaluate(run);
const header = (page, id) => page.locator('.cx-hcell[data-cx-column="' + id + '"]');
const layout = page => api(page, () => document.querySelector('[data-canopyx-host]').canopyx.getColumnLayout());
const headerOrder = page => page.locator(".cx-hcell").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn));

test("left and right cells stay aligned with headers while the center scrolls and receives keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 700 }); await open(page);
  const start = await header(page, "name").boundingBox(), end = await header(page, "action").boundingBox();
  await page.locator(".cx-grid").evaluate(grid => grid.scrollLeft = 200); await nextFrames(page);
  expect((await header(page, "name").boundingBox()).x).toBeCloseTo(start.x, 0);
  expect((await header(page, "action").boundingBox()).x).toBeCloseTo(end.x, 0);
  const row = page.locator('.cx-row[data-cx-id="r0"]');
  for (const [id, index] of [["name", 0], ["action", 4]]) {
    expect((await row.getByRole("gridcell").nth(index).boundingBox()).x).toBeCloseTo((await header(page, id).boundingBox()).x, 0);
  }
  await row.press("Enter"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  const box = await page.evaluate(() => ({ cell: document.activeElement.getBoundingClientRect().toJSON(),
    left: document.querySelector('.cx-hcell[data-cx-column=name]').getBoundingClientRect().right,
    right: document.querySelector('.cx-hcell[data-cx-column=action]').getBoundingClientRect().left }));
  expect(box.cell.left).toBeGreaterThanOrEqual(box.left - 1); expect(box.cell.right).toBeLessThanOrEqual(box.right + 1);
  await expect(page.locator(".cx-grid")).toHaveAttribute("aria-colcount", "5");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("responsive hiding retains searchable and exported fields while user hiding remains separate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await open(page, { reporting: { ...view.reporting, responsive: true } });
  expect(await headerOrder(page)).toEqual(["name", "action"]);
  const current = await layout(page); expect(current.find(column => column.id === "notes")).toMatchObject({ visible: false, responsiveHidden: true });
  await page.getByRole("searchbox").fill("hidden field 17"); await page.getByRole("searchbox").press("Enter");
  await expect(page.locator('.cx-row[data-cx-id="r17"]')).toBeVisible();
  const request = await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "filtered" }).request);
  expect(request.columns.map(column => column.id)).toEqual(["name", "region", "owner", "notes", "action"]);
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.setColumnVisible("owner", false));
  await page.setViewportSize({ width: 1200, height: 700 }); await nextFrames(page);
  expect(await headerOrder(page)).toEqual(["name", "region", "notes", "action"]);
  expect((await layout(page)).find(column => column.id === "owner")).toMatchObject({ visible: false, responsiveHidden: false });
  await page.locator(".cx-grid-columns > summary").click();
  await expect(page.getByLabel("owner: pinned region")).toBeVisible();
});

test("pin intent and widths survive compact suspension, state restoration and reset", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await open(page);
  const saved = await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.getState());
  let placement = await layout(page); expect(placement.find(c => c.id === "name")).toMatchObject({ requestedPin: "left", pin: "left" });
  expect(placement.find(c => c.id === "action")).toMatchObject({ requestedPin: "right", pin: "none", width: 160 });
  await page.setViewportSize({ width: 1200, height: 700 }); await nextFrames(page);
  expect((await layout(page)).find(c => c.id === "action").pin).toBe("right");
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.setColumnPinned("owner", "left"));
  expect(await headerOrder(page)).toEqual(["name", "owner", "region", "notes", "action"]);
  await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), saved); await nextFrames(page);
  expect(await headerOrder(page)).toEqual(["name", "region", "owner", "notes", "action"]);
  const rejected = await api(page, () => { const grid = document.querySelector('[data-canopyx-host]').canopyx, state = grid.getState();
    state.columns[0].pin = "elsewhere"; return grid.setState(state).then(() => false, () => true); });
  expect(rejected).toBe(true); expect((await layout(page))[0].requestedPin).toBe("left");
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.resetView()); await nextFrames(page);
  expect((await layout(page)).find(c => c.id === "owner").requestedPin).toBe("none");
});

test("header moves cross pinned groups and the column chooser preserves its own focused control", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 }); await open(page);
  await header(page, "region").locator(".cx-column-move").press("ArrowLeft");
  expect((await layout(page)).find(c => c.id === "region").requestedPin).toBe("left");
  expect(await headerOrder(page)).toEqual(["region", "name", "owner", "notes", "action"]);
  await expect(header(page, "region").locator(".cx-column-move")).toBeFocused();
  await page.locator(".cx-grid-columns > summary").click();
  const chooser = page.getByLabel("owner: pinned region"); await chooser.focus(); await chooser.selectOption("right"); await expect(chooser).toBeFocused();
  expect(await headerOrder(page)).toEqual(["region", "name", "notes", "owner", "action"]);
  const earlier = page.getByRole("button", { name: "Move owner earlier", exact: true }); await earlier.press("Enter");
  await expect(earlier).toBeFocused(); expect((await layout(page)).find(c => c.id === "owner").requestedPin).toBe("none");
});

test("responsive layout returns focus to the record when its entered field disappears", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 }); await open(page, { reporting: { ...view.reporting, responsive: true } });
  await page.locator('.cx-row[data-cx-id="r0"]').press("Enter"); await page.keyboard.press("End"); await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => document.activeElement.textContent)).toContain("hidden field 0");
  await page.setViewportSize({ width: 390, height: 700 }); await nextFrames(page);
  await expect(page.locator('.cx-row[data-cx-id="r0"]')).toBeFocused();
  expect(await page.evaluate(() => ({ x: scrollX, width: document.body.scrollWidth, viewport: innerWidth }))).toEqual({ x: 0, width: 390, viewport: 390 });
});

test("an oversized outer pin suspends its whole edge prefix and leaves center navigation available", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 700 });
  await open(page, { columns: columns.map(c => c.id === "name" ? { ...c, width: 550 } : c), reporting: { layout: {
    name: { minimum: 100, maximum: 800, pin: "left" }, region: { minimum: 40, maximum: 400, pin: "left" },
    action: { minimum: 40, maximum: 400, pin: "right" } } } });
  expect((await layout(page)).filter(c => c.requestedPin === "left").map(c => c.pin)).toEqual(["none", "none"]);
  expect((await layout(page)).find(c => c.id === "action").pin).toBe("right");
  await page.locator('.cx-row[data-cx-id="r0"]').press("Enter"); await page.keyboard.press("ArrowRight");
  const frame = await page.locator(".cx-grid").boundingBox(), focused = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON());
  expect(focused.left).toBeGreaterThanOrEqual(frame.x - 1); expect(focused.right).toBeLessThanOrEqual(frame.x + frame.width - 160 + 1);
});

test("growing a pinned edge leaves the focused center header control uncovered", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 700 }); await open(page);
  const grip = header(page, "notes").getByRole("separator"); await grip.focus(); await grip.press("ArrowLeft");
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("action", 240)); await nextFrames(page);
  await expect(grip).toBeFocused();
  const focused = await grip.boundingBox(), edge = await header(page, "action").boundingBox();
  expect(focused.x + focused.width).toBeLessThanOrEqual(edge.x + 1);
});

test("growing a pinned edge also reveals the entered center cell", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 700 }); await open(page);
  await page.locator('.cx-row[data-cx-id="r0"]').press("Enter"); await page.keyboard.press("End"); await page.keyboard.press("ArrowLeft");
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("action", 240)); await nextFrames(page);
  const focused = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON()), edge = await header(page, "action").boundingBox();
  expect(focused.right).toBeLessThanOrEqual(edge.x + 1);
  expect(await page.evaluate(() => document.activeElement.textContent)).toContain("hidden field 0");
});

test("pin changes preserve the same reachable host control and reject after disposal", async ({ page }) => {
  await open(page);
  await api(page, () => {
    const host = document.querySelector('[data-canopyx-host]'), definition = host.canopyx.view;
    host.canopyx.destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view: definition, renderers: { owner: (_, cell) => {
      const hidden = document.createElement("button"); hidden.hidden = true; cell.append(hidden);
      const input = document.createElement("input"); input.setAttribute("aria-label", "Owner note"); input.value = "Alex"; cell.append(input); return true;
    } } }); return host.canopyx.ready;
  });
  const note = page.locator('.cx-row[data-cx-id="r0"]').getByLabel("Owner note"); await note.focus();
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.setColumnPinned("owner", "right"));
  await expect(note).toBeFocused(); await note.press("End"); await note.press("x"); await expect(note).toHaveValue("Alexx");
  expect(await api(page, () => { const grid = document.querySelector('[data-canopyx-host]').canopyx; grid.destroy();
    try { grid.setColumnPinned("owner", "none"); return false; } catch { return true; } })).toBe(true);
});

test("responsive record details receive complete immutable cells, including fields absent from the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await open(page, { reporting: { ...view.reporting, responsive: true } });
  await api(page, () => {
    const host = document.querySelector('[data-canopyx-host]'), definition = host.canopyx.view;
    host.canopyx.destroy(); host.replaceChildren();
    host.canopyx = CanopyX.createDataGrid(host, { view: definition, onDetails({ row, query, returnFocus }) {
      window.detailProof = { row, query, frozen: Object.isFrozen(row.cells), connected: returnFocus.isConnected };
    } }); return host.canopyx.ready;
  });
  await page.locator('.cx-row[data-cx-id="r0"]').press("Control+Enter");
  await expect.poll(() => page.evaluate(() => window.detailProof)).toMatchObject({ row: { id: "r0", cells: {
    owner: "Alex", notes: "Find this hidden field 0" } }, frozen: true, connected: true });
});

test("row keyboard focus stays visible on pinned cells in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" }); await open(page);
  await page.locator('.cx-row[data-cx-id="r0"]').press("ArrowDown");
  const row = page.locator('.cx-row[data-cx-id="r1"]'); await expect(row).toBeFocused();
  const focus = await row.evaluate(element => ({ visible: element.matches(":focus-visible"),
    outlines: [...element.querySelectorAll("[data-cx-pin]")].map(cell => getComputedStyle(cell).outlineStyle) }));
  expect(focus.visible).toBe(true); expect(focus.outlines).toEqual(["solid", "solid"]);
});

for (const mode of ["", "-continuous"]) for (const theme of ["", "-dark"]) test("responsive example retains identity/status and exposes complete details " + mode + theme, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await openExample(page, "responsive-grid" + mode + theme + ".html");
  expect(await headerOrder(page)).toEqual(["name", "status"]);
  const row = page.locator('.cx-row[data-cx-id="record-000"]'); await row.press("Control+Enter");
  await expect(page.locator("#record-details")).toBeVisible();
  await expect(page.locator("#record-fields")).toContainText("Alex, Sam, Kim, Pat");
  await expect(page.locator("#record-fields")).toContainText("without interpreting markup");
  const colors = await page.locator("#record-details").evaluate(dialog => ({ background: getComputedStyle(dialog).backgroundColor,
    foreground: getComputedStyle(dialog).color }));
  expect(colors).toEqual(theme ? { background: "rgb(13, 17, 23)", foreground: "rgb(230, 237, 243)" } :
    { background: "rgb(255, 255, 255)", foreground: "rgb(31, 35, 40)" });
  await page.keyboard.press("Escape"); await expect(row).toBeFocused();
  await page.locator(".cx-grid-columns > summary").click();
  await expect(page.getByText("Hidden at this width", { exact: true })).toHaveCount(4);
});

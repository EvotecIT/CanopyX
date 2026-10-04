import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

const columns = ["name", "region", "owner", "notes", "action"].map(id => ({ id, title: id, kind: "text", width: 160, sortable: true }));
const view = { protocol: "canopyx/2", type: "grid", id: "placement", label: "Responsive inventory", rowHeight: 28,
  pageSize: 100, selection: "multiple", search: true, source: { kind: "inline" }, columns,
  reporting: { columnReorder: true, layout: { name: { minimum: 100, maximum: 300, pin: "left", priority: 0, alwaysVisible: true },
    notes: { minimum: 40, maximum: 600, priority: 20 }, action: { minimum: 80, maximum: 240, pin: "right", priority: 1 } } },
  rows: Array.from({ length: 100 }, (_, i) => ({ id: "r" + i, cells: { name: "Record " + i, region: "West", owner: "Alex",
    notes: "Find this hidden field " + i, action: "Inspect" } })) };
async function open(page, patch = {}) {
  await page.route("http://canopyx.test/placement", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, ...patch }) }));
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
  await api(page, () => document.querySelector('[data-canopyx-host]').canopyx.search("hidden field 17"));
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
  const chooser = page.getByLabel("owner: pinned region"); await chooser.selectOption("right"); await expect(chooser).toBeFocused();
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

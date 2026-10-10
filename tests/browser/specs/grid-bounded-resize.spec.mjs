import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

for (const reporting of [false, true]) for (const fixed of [false, true]) {
  test(`${reporting ? "reporting" : "ordinary"} grid keeps ${fixed ? "fixed" : "preferred"} resize bounds in controls and saved state`, async ({ page }, testInfo) => {
    const view = { protocol: "canopyx/2", type: "grid", id: "bounded", label: "Bounded columns", stateKey: "resize-contract",
      source: { kind: "inline" }, rowHeight: 28, pageSize: 20, selection: "single", ...(reporting ? { reporting: {} } : {}),
      columns: [{ id: "name", title: "Name", kind: "text", width: 180, minWidth: 120, maxWidth: 240, ...(fixed ? { fixed: true, autoSize: "none" } : {}) },
        { id: "amount", title: "Amount", kind: "number", width: 100 },
        { id: "automatic", title: "Content width", kind: "text", minWidth: 200, maxWidth: 240 }],
      rows: [{ id: "record", cells: { name: "Record", amount: 10, automatic: "Content" } }] };
    await page.route("http://canopyx.test/bounded", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/bounded");
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
    const grip = page.locator('.cx-hcell[data-cx-column="name"]').getByRole("separator");
    const width = () => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.find(column => column.id === "name").width);
    await expect(grip).toHaveAttribute("aria-valuemin", "120");
    await expect(grip).toHaveAttribute("aria-valuemax", "240");
    expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState().columns.find(column => column.id === "automatic").width)).toBe(200);
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("name", 500));
    expect(await width()).toBe(240);
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("name", 80));
    expect(await width()).toBe(120);
    await grip.press("Home");
    await expect(grip).toHaveAttribute("aria-valuenow", "120");
    for (let index = 0; index < 4; index++) await grip.press("Shift+ArrowRight");
    expect(await width()).toBe(240);
    for (const delta of [-200, 500]) {
      const bounds = await grip.boundingBox(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + delta, y); await page.mouse.up();
      expect(await width()).toBe(delta < 0 ? 120 : 240);
    }
    const state = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState());
    state.columns.find(column => column.id === "name").width = 80;
    await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), state);
    expect(await width()).toBe(120);
    state.columns.find(column => column.id === "name").width = 500;
    await page.evaluate(state => document.querySelector('[data-canopyx-host]').canopyx.setState(state), state);
    expect(await width()).toBe(240);
    await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.saveView("Bounded"));
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("cx:grid:resize-contract:bounded")).views[0].state.columns.find(column => column.id === "name").width)).toBe(240);
    await page.reload(); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
    expect(await width()).toBe(240);
    await expect(grip).toHaveAttribute("aria-valuenow", "240");
    await page.screenshot({ path: testInfo.outputPath("bounded-resize.png") });
  });
}

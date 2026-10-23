import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl, nextFrames } from "./support.mjs";

async function open(page, name) {
  await page.goto(exampleUrl(name));
  await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx.ready)));
  await nextFrames(page);
}

function anchor(grid) {
  return grid.evaluate(element => {
    // Include the sticky header's bottom border. Probe the first body pixel's centre to exclude a covered
    // preceding row and subpixel overlaps between measured rows.
    const top = element.querySelector(".cx-head").getBoundingClientRect().bottom;
    const row = [...element.querySelectorAll(".cx-row[data-cx-id]")].find(row => row.getBoundingClientRect().bottom > top + 0.5);
    return row ? { id: row.dataset.cxId, offset: Math.round(top - row.getBoundingClientRect().top) } : null;
  });
}

test("hidden tabs, accordion and details defer row rendering until their first size", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, "contained-grids.html");
  await expect(page.locator(".cx-canvas .cx-row")).toHaveCount(0);
  for (const [selector, opener] of [["#records-panel", "#records-tab"], ["#accordion-panel", "#accordion-toggle"], ["#record-details", "#record-details > summary"]]) {
    await page.locator(opener).click();
    const container = page.locator(selector);
    await expect(container.locator('.cx-row[data-cx-id="record-0"]')).toBeVisible();
    const width = await container.locator(".cx-hrow").evaluate(element => element.offsetWidth);
    await container.evaluate(element => element.style.width = "320px"); await nextFrames(page);
    await expect.poll(() => container.locator(".cx-hrow").evaluate(element => element.offsetWidth)).toBeLessThan(width);
    await container.evaluate(element => element.style.width = "");
  }
  expect(errors).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const offset of [0, 13, 39]) test(`a hidden restored grid keeps its requested scroll position through reveal and repeated resize (offset ${offset})`, async ({ page }) => {
  await open(page, "contained-grids-dark.html");
  await page.locator("#records-panel [data-canopyx-host]").evaluate(async (host, offset) => {
    const state = host.canopyx.getState(); state.scrollTop = 2800 + offset;
    await host.canopyx.setState(state);
  }, offset);
  await page.locator("#records-tab").click();
  const grid = page.locator("#records-panel .cx-grid");
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBe(2800 + offset);
  // Restoring scrollTop precedes the next virtual-row render; capture an anchor only once that row exists.
  let before;
  await expect.poll(async () => before = await anchor(grid)).not.toBeNull();
  expect(before.offset).toBe(offset);
  for (const width of [390, 1024, 390, 1400]) {
    await page.locator("#intro-tab").click(); await page.setViewportSize({ width, height: 844 });
    await page.locator("#records-tab").click();
    await expect.poll(() => anchor(grid)).toEqual(before);
    await expect(page.locator(`#records-panel .cx-row[data-cx-id="${before.id}"]`)).toBeVisible();
  }
});

test("a hidden density and font change retains a tall row's intra-row pixel offset", async ({ page }) => {
  await open(page, "contained-grids-dark.html");
  const host = page.locator("#records-panel [data-canopyx-host]");
  await host.evaluate(async host => {
    const view = host.canopyx.view; host.canopyx.destroy(); view.autoRowHeight = true;
    await CanopyX.createDataGrid(host, { view, renderers: { name(row, cell) {
      if (row.id !== "record-0") return false;
      cell.textContent = "A tall host-rendered record"; cell.style.height = "1600px"; return true;
    } } }).ready;
  });
  await page.locator("#records-tab").click();
  await expect.poll(() => host.locator('[data-cx-id="record-0"]').evaluate(row => row.offsetHeight)).toBeGreaterThan(1000);
  const grid = host.locator(".cx-grid");
  await grid.evaluate(element => element.scrollTop = 400); await nextFrames(page);
  const before = { id: "record-0", offset: 400 };
  await expect.poll(() => anchor(grid)).toEqual(before);
  for (const [width, density, font] of [[390, "compact", "20px"], [1024, "comfortable", "14px"]]) {
    await page.locator("#intro-tab").click(); await page.setViewportSize({ width, height: 844 });
    await host.evaluate((host, { density, font }) => { host.dataset.hfxDensity = density; host.style.fontSize = font; }, { density, font });
    await page.locator("#records-tab").click();
    await expect.poll(() => anchor(grid)).toEqual(before);
    expect(await host.evaluate(host => host.canopyx.getState().scrollTop)).toBe(400);
  }
  // An explicit host scroll request while hidden takes precedence over the remembered visible position.
  await page.locator("#intro-tab").click();
  await host.evaluate(async host => {
    const state = host.canopyx.getState(); state.scrollTop = 600; await host.canopyx.setState(state);
  });
  expect(await host.evaluate(host => host.canopyx.getState().scrollTop)).toBe(600);
  await page.locator("#records-tab").click();
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBe(600);
});

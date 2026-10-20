// Scroll budgets for the matrix view (docs/matrix.md#performance), with the CPU slowed four times through the Chromium DevTools
// protocol: the 150 by 150 and 400 by 400 example matrices become ready, then scroll down, sideways and diagonally with
// mouse-wheel steps while an animation-frame loop counts frames over 50 ms. The medians of three cold runs are printed for pull
// requests; bench/matrix-benchmark.mjs measures the same at 1x and 4x with more detail.
import { expect, test } from "@playwright/test";
import { exampleUrl, median } from "./support.mjs";

const CPU = 4, STEPS = 40;
// Measured at 4x on a workstation (docs/matrix.md#performance): ready in about 0.6 s; at most 7 frames over 50 ms in 40
// steps down, 2 sideways and 13 diagonally on the 400 matrix. The budgets are about one and a half times that, so a regression shows.
const READY_MS = 1500, OVER_50 = { down: 11, sideways: 4, diagonal: 20 };

async function run(browser, size) {
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(exampleUrl("large/matrix-" + size + ".html"));
  await page.waitForSelector("[data-cx-ready]", { timeout: 60000 });
  const ready = await page.evaluate(() => performance.now());
  const box = await page.locator(".cx-mx-scroll").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const result = { ready };
  for (const [name, dx, dy] of [["down", 0, 500], ["sideways", 400, 0], ["diagonal", 300, 300]]) {
    await page.locator(".cx-mx-scroll").evaluate(scroll => { scroll.scrollTop = 0; scroll.scrollLeft = 0; });
    await page.evaluate(() => { window.__frames = []; window.__rec = true; let last = performance.now(); const frame = time => { window.__frames.push(time - last); last = time; if (window.__rec) requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
    for (let step = 0; step < STEPS; step++) { await page.mouse.wheel(dx, dy); await page.waitForTimeout(16); }
    await page.waitForTimeout(300);
    result[name] = await page.evaluate(() => { window.__rec = false; return window.__frames.filter(frame => frame > 50).length; });
  }
  await page.close();
  return result;
}

test.describe("matrix scroll budgets", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling needs the Chromium DevTools protocol.");
  test.setTimeout(300000);
  for (const size of [150, 400]) {
    test("a " + size + " by " + size + " matrix is ready and scrolls within budget at " + CPU + "x CPU", { tag: "@benchmark" }, async ({ browser }) => {
      const runs = [];
      for (let attempt = 0; attempt < 3; attempt++) runs.push(await run(browser, size));
      const pick = name => Math.round(median(runs.map(item => item[name])));
      const summary = { ready: pick("ready"), down: pick("down"), sideways: pick("sideways"), diagonal: pick("diagonal") };
      console.log("matrix " + size + "x" + size + " at " + CPU + "x: ready " + summary.ready + " ms, frames over 50 ms in " + STEPS + " steps: down " + summary.down + ", sideways " + summary.sideways + ", diagonal " + summary.diagonal);
      expect(summary.ready).toBeLessThanOrEqual(READY_MS);
      for (const name of ["down", "sideways", "diagonal"]) expect(summary[name], name).toBeLessThanOrEqual(OVER_50[name]);
    });
  }
});

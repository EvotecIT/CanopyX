import { expect, test } from "@playwright/test";
import { inspectFinishQuality } from "../tools/finish-quality.mjs";

const fixtures = {
  "band-width": '<div data-cx-finish-frame><div data-cx-finish-row style="width:300px;height:32px">Row</div><div data-cx-finish-band style="width:150px">Total</div></div>',
  "minute-precision": '<form class="cx-cal-occurrence-editor"><input type="datetime-local" step="0.001" value="2026-10-16T11:00:00.001"></form>',
  "header-wrap": '<div data-cx-finish-frame style="width:500px"><div data-cx-finish-header style="width:50px;line-height:20px">Monthly cost</div></div>',
  "empty-band": '<div data-cx-finish-frame style="height:160px"><div style="height:32px">Row</div></div>',
  "single-sort-priority": '<div data-cx-finish-frame><div role="columnheader" aria-sort="ascending">Resource <span aria-hidden="true" data-cx-finish-sort-priority>2</span></div></div>',
  "text-clipped": '<span data-cx-finish-text style="display:block;width:40px;white-space:nowrap;overflow:hidden">A long visible label</span>',
  "phone-overflow": '<div style="width:800px">A wide row</div>',
  "phone-chip-wrap": '<div><span style="display:block;height:32px">Record</span><span data-cx-finish-chip style="display:block">+1 column</span></div>'
};
for (const [rule, html] of Object.entries(fixtures)) {
  test(`finish rule ${rule} detects a defect and accepts an explicit local exception`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent('<style>body{margin:0;font:16px/20px sans-serif}</style><main>' + html + '</main>');
    expect((await page.evaluate(inspectFinishQuality)).map(finding => finding.rule)).toContain(rule);
    await page.locator("main").evaluate((element, id) => element.setAttribute("data-cx-finish-allow", id), rule);
    expect((await page.evaluate(inspectFinishQuality)).map(finding => finding.rule)).not.toContain(rule);
  });
}

test("finished content, explicit sub-minute precision, ellipsis and internal scroll do not fail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>body{margin:0}</style><main>
    <input type="time" step="1" value="11:00:15">
    <span data-cx-finish-text style="display:block;width:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A long label</span>
    <div style="overflow:auto"><div style="width:800px">A wide row</div></div>
  </main>`);
  expect(await page.evaluate(inspectFinishQuality)).toEqual([]);
});

test("minute precision also checks rendered date-column values", async ({ page }) => {
  await page.setContent('<div data-canopyx-mounted><div class="cx-cell" data-cx-column="when">16 Oct 2026 11:00:15.123 UTC</div></div>');
  await page.locator('[data-canopyx-mounted]').evaluate(host => {
    host.canopyx = { view: { columns: [{ id: "when", kind: "datetime" }] } };
  });
  expect((await page.evaluate(inspectFinishQuality)).map(finding => finding.rule)).toContain("minute-precision");
  await page.locator('.cx-cell').evaluate(cell => { cell.textContent = "16 Oct 2026 11:00 UTC"; });
  expect(await page.evaluate(inspectFinishQuality)).toEqual([]);
});

test("controls clipped by a fixed-height ancestor fail even with a nonzero layout box", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>body{margin:0}#host{height:440px;overflow:hidden}#body{height:440px}</style>
    <main id="host"><div id="body">Grid</div><section><h3>Preview</h3>
      <button class="cx-btn">Apply</button><p role="status">Ready to apply</p></section></main>`);
  expect(await page.locator('button').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(0);
  expect((await page.evaluate(inspectFinishQuality)).filter(finding => finding.rule === "text-clipped")
    .map(finding => finding.selector)).toHaveLength(2);
  await page.locator('#host').evaluate(host => { host.after(host.querySelector('section')); });
  expect(await page.evaluate(inspectFinishQuality)).toEqual([]);
});

test("ancestor clipping respects scrollable content and explicit local exceptions", async ({ page }) => {
  await page.setContent(`<style>body{margin:0}.frame{height:80px;overflow:hidden}.scroll{height:80px;overflow:auto}
    .space{height:100px}</style><main>
    <div class="frame"><div class="scroll"><div class="space"></div><button class="cx-btn">Scroll to reach</button></div></div>
    <div class="frame" data-cx-finish-allow="text-clipped"><div class="space"></div><button class="cx-btn">Allowed</button></div>
    </main>`);
  expect(await page.evaluate(inspectFinishQuality)).toEqual([]);
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, openExample, nextFrames } from "./support.mjs";

const api = () => document.querySelector("[data-canopyx-host]").canopyx;
const rows = count => Array.from({ length: count }, (_, i) => ({ id: "r" + String(i).padStart(6, "0"), cells: {
  name: "Record " + i, notes: i % 4 === 0 ? "Short" : "An observation with wrapped text. ".repeat(i % 7 + 2)
} }));
async function open(page, count = 400, patch = {}, setup = "") {
  const view = { protocol: "canopyx/2", type: "grid", id: "heights", label: "Measured records", rowHeight: "auto", pageSize: 100,
    selection: "multiple", search: false, columns: [{ id: "name", title: "Record", kind: "text", width: 160 },
      { id: "notes", title: "Notes", kind: "text", width: 220, wrap: true }], source: { kind: "inline" }, rows: rows(count), ...patch };
  await page.route("http://canopyx.test/heights", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace("</head>", "<script>" + setup + "</script></head>").replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Records</h1>')
    .replace("</body>", "</main></body>") }));
  await page.goto("http://canopyx.test/heights"); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  await nextFrames(page);
}
async function anchor(page) {
  return page.locator(".cx-grid").evaluate(grid => {
    const top = grid.querySelector(".cx-head").getBoundingClientRect().bottom;
    const row = [...grid.querySelectorAll(".cx-row[data-cx-id]")].find(row => { const box = row.getBoundingClientRect(); return box.top <= top + 1 && box.bottom > top + 1; });
    return row && { id: row.dataset.cxId, y: row.getBoundingClientRect().top };
  });
}

test("wrapped rows measure content, page by pixels, recycle, and keep ordered accessible rows", async ({ page }) => {
  await open(page, 400, { rowHeight: 32, autoRowHeight: true });
  const short = page.locator('[data-cx-id="r000000"]'), tall = page.locator('[data-cx-id="r000001"]');
  expect((await short.boundingBox()).height).toBe(32);
  expect((await tall.boundingBox()).height).toBeGreaterThan((await short.boundingBox()).height);
  await short.focus(); await page.keyboard.press("PageDown");
  const ordinal = await page.evaluate(() => Number(document.activeElement.getAttribute("aria-rowindex")) - 2);
  expect(ordinal).toBeGreaterThan(0); expect(ordinal).toBeLessThan(25);
  for (const index of [180, 320, 0]) await page.evaluate(index => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(index), index);
  expect((await tall.boundingBox()).height).toBeGreaterThan(28);
  const order = await page.locator(".cx-canvas > .cx-row").evaluateAll(items => items.map(row => Number(row.getAttribute("aria-rowindex"))));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("changing widths and late host content preserve the visible row's pixel anchor", async ({ page }) => {
  await open(page); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(150));
  await page.locator(".cx-grid").evaluate(grid => grid.scrollTop += 12); await nextFrames(page);
  const before = await anchor(page); expect(before).toBeTruthy();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("notes", 180)); await nextFrames(page);
  const after = await anchor(page); expect(after.id).toBe(before.id); expect(after.y).toBeCloseTo(before.y, 0);
  await page.locator('.cx-row[data-cx-id="' + after.id + '"] .cx-text').last().evaluate(text => text.append(" More content. ".repeat(30)));
  await nextFrames(page); const late = await anchor(page); expect(late.id).toBe(after.id); expect(late.y).toBeCloseTo(after.y, 0);
});

test("automatic rows anchor above the bounded-scroll threshold and retain keyboard navigation", async ({ page }) => {
  const setup = `CanopyX.configure('heights',{cachePageLimit:2,source:{query(q){return {protocol:'canopyx/2',type:'gridPage',view:q.view,
    revision:'large',offset:q.offset,total:400000,matched:400000,items:Array.from({length:Math.min(q.limit,400000-q.offset)},(_,i)=>({
      id:'r'+String(q.offset+i).padStart(6,'0'),cells:{name:'Record '+(q.offset+i),notes:'A wrapped observation. '.repeat((q.offset+i)%6+2)}}))};}}});`;
  await open(page, 0, { source: { kind: "host" }, rows: undefined }, setup);
  await expect(page.locator(".cx-canvas")).toHaveAttribute("data-cx-scaled", "");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(350000)); await nextFrames(page);
  const before = await anchor(page); expect(before).toBeTruthy();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setColumnWidth("notes", 190)); await nextFrames(page);
  const after = await anchor(page); expect(after.id).toBe(before.id); expect(after.y).toBeCloseTo(before.y, 0);
  await page.locator('[data-cx-id="r350000"]').focus(); await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => Number(document.activeElement.getAttribute("aria-rowindex")) - 2)).toBeGreaterThan(350000);
  await page.keyboard.press("Control+End"); await expect(page.locator('[data-cx-id="r399999"]')).toBeFocused();
  await page.keyboard.press("ArrowUp"); await expect(page.locator('[data-cx-id="r399998"]')).toBeFocused();
});

for (const mode of ["", "-paged", "-grouped"]) test("wrapped generated example navigates " + (mode || "continuous"), async ({ page }) => {
  await openExample(page, "wrapped-grid" + mode + ".html");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(20)); await nextFrames(page);
  const focused = page.locator('.cx-row[data-cx-id="record-0020"]');
  if (mode === "-grouped") { await page.locator('.cx-row[data-cx-id]').first().focus(); }
  else await focused.focus();
  await page.keyboard.press("PageDown"); await nextFrames(page);
  expect(await page.evaluate(() => document.activeElement.closest(".cx-row")?.getAttribute("aria-rowindex"))).toBeTruthy();
});

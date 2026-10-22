// Automatic bounds follow the decoded compact rows, including cached rows and hidden drawer fields.
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { formattingPage, read } from "./formatting-support.mjs";
import { ORIGIN } from "./enhance-support.mjs";
import { nextFrames } from "./support.mjs";

const chunks = [[["a", "Alpha", 20, 20, "One"], ["b", "Beta", 40, 40, "One"]],
  [["c", "Gamma", -20, -20, "Two"], ["d", "Delta", 100, 100, "Two"]]];
// A field keeps its formatting when phone fitting projects it into the quiet record line.
const cell = async (page, id, column) => {
  const row = page.locator('.cx-row[data-cx-id="' + id + '"]');
  const header = page.locator('.cx-hcell[data-cx-column="' + column + '"]');
  if (await header.count()) return row.locator('.cx-cell[aria-colindex="' + await header.getAttribute("aria-colindex") + '"]');
  const title = { name:"Name:", amount:"Amount:", scale:"Scale:", group:"Group:" }[column];
  return row.locator('.cx-phone-field').filter({ has: page.locator('.cx-phone-field-title', {
    hasText:new RegExp('^' + title + '$') }) }).locator('.cx-phone-value');
};
const drawer = (page, column) => page.locator('.cx-drawer dd[data-cx-field="' + column + '"]');

function compactView(transport, reporting = false) {
  return { protocol: "canopyx/2", type: "grid", id: "compact-format", label: "Compact formatting", pageSize: 2,
    source: { kind: "inline" }, selection: "multiple", search: true, rowHeight: 34,
    ...(!reporting ? { presentation: "paged", pageLength: 2, pager: { lengths: [2, 4] } } : {}),
    columns: [{ id: "name", title: "Name", kind: "text", width: 150 }, { id: "amount", title: "Amount", kind: "number", width: 150, editable: true },
      { id: "scale", title: "Scale", kind: "number", width: 150, ...(reporting ? { hidden: true, editable: true } : {}) },
      { id: "group", title: "Group", kind: "text", width: 100, sortable: true }],
    rowData: { version: 1, columns: ["name", "amount", "scale", "group"], count: 4, ordered: true,
      ...(transport === "inline" ? { chunks } : transport === "scripts-gzip" ? { chunks: 2, encoding: "gzip" } : { chunks: 2, base: "/data/" }) },
    formatRules: [{ id: "bar", column: "amount", style: { bar: {} } },
      { id: "scale", column: "scale", style: { scale: { stops: [{ type: "min", tone: "success" }, { type: "max", tone: "danger" }] } } }],
    ...(reporting ? { reporting: { groupBy: [{ column: "group", direction: "asc" }], groupable: true } } : {}) };
}

async function openCompact(page, transport, reporting = false, editableDrawer = null) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  // Hold the real scheduling boundary between decoded chunks. The first query and drawer can paint a partial prefix.
  await page.addInitScript(() => {
    let release; const hold = new Promise(resolve => { release = resolve; });
    window.releaseDecode = release;
    Object.defineProperty(globalThis, "scheduler", { configurable: true, value: { yield: () => hold } });
  });
  const view = compactView(transport, reporting);
  const setup = reporting || editableDrawer ? 'CanopyX.configure("compact-format",{editing:{' +
    (editableDrawer ? 'drawer:' + JSON.stringify(editableDrawer) + ',' : '') +
    'commit:batch=>({protocol:"canopyx/2",type:"gridCommitResult",view:batch.view,rows:batch.rows.map(row=>({id:row.id,status:"saved"}))})}});' : "";
  let html = formattingPage(view, { script: setup });
  if (transport === "scripts-gzip") {
    const scripts = chunks.map(rows => '<script type="application/x-canopyx-rows">' + gzipSync(JSON.stringify(rows)).toString("base64") + "</script>").join("");
    html = html.replace("</div></main>", scripts + "</div></main>");
  }
  await page.route(ORIGIN + "/canopyx-*", route => {
    const asset = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({ contentType: asset.endsWith(".css") ? "text/css" : "text/javascript", body: read(asset) });
  });
  await page.route(ORIGIN + "/data/rows/*.js", route => {
    const index = Number(/rows\/(\d)\.js$/.exec(new URL(route.request().url()).pathname)[1]);
    return route.fulfill({ contentType: "text/javascript", body: '(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(["compact-format","rows/' + index + '",' + JSON.stringify(chunks[index]) + "]);" });
  });
  await page.route(ORIGIN + "/compact-format", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(ORIGIN + "/compact-format", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]").canopyx?.view.rows.length === 2);
  if (reporting) await page.evaluate(() => releaseDecode());
  await page.evaluate(async () => { window.grid = document.querySelector("[data-canopyx-host]").canopyx; await grid.ready; });
  await nextFrames(page);
  return errors;
}

const barWidth = async target => (await target).locator(".cx-fmt-bar").evaluate(bar => bar.style.getPropertyValue("--cx-fmt-w"));
const scaleColor = async target => (await target).evaluate(element => element.style.getPropertyValue("--cx-fmt-scale"));

for (const transport of ["inline", "scripts-gzip", "sidecar"]) {
  test("compact " + transport + " formatting refreshes automatic bounds and cached drawer rows after later extrema decode", async ({ page }, testInfo) => {
    const errors = await openCompact(page, transport);
    try {
      expect(await barWidth(cell(page, "a", "amount"))).toBe("50.0%");
      expect(await scaleColor(cell(page, "a", "scale"))).toContain("--cx-tone-success");
      await page.evaluate(() => grid.openDetails("a"));
      expect(await barWidth(drawer(page, "amount"))).toBe("50.0%");
      if (transport === "sidecar") await page.screenshot({ path: testInfo.outputPath("partial-bounds.png") });
      const before = await page.evaluate(() => { grid.setSelection(["a"]); return { query: grid.getQuery(), paging: grid.getPaging(), selected: grid.getSelection() }; });
      await page.evaluate(() => releaseDecode());
      await page.waitForFunction(() => grid.view.rows.length === 4);
      await expect.poll(() => barWidth(cell(page, "a", "amount"))).toBe("33.3%");
      await expect.poll(() => barWidth(drawer(page, "amount"))).toBe("33.3%");
      expect(await scaleColor(drawer(page, "scale"))).toContain("33%");
      expect(await page.evaluate(() => ({ query: grid.getQuery(), paging: grid.getPaging(), selected: grid.getSelection() }))).toEqual(before);
      if (transport === "sidecar") await page.screenshot({ path: testInfo.outputPath("complete-bounds.png") });
      expect(await barWidth(cell(page, "a", "amount"))).toBe("33.3%");
      expect(await barWidth(cell(page, "b", "amount"))).toBe("50.0%");
      expect(await scaleColor(cell(page, "b", "scale"))).toContain("50%");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => grid.setPageLength(4));
      await nextFrames(page);
      expect(await barWidth(cell(page, "d", "amount"))).toBe("100.0%");
      expect(await scaleColor(cell(page, "d", "scale"))).toContain("--cx-tone-danger");
      expect(errors).toEqual([]);
    } finally { if (!page.isClosed()) await page.evaluate(() => releaseDecode()).catch(() => {}); }
  });
}

test("grouped compact formatting keeps complete bounds for hidden fields and saved extrema", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openCompact(page, "sidecar", true);
  await expect(await cell(page, "a", "amount")).toBeVisible();
  expect(await barWidth(cell(page, "a", "amount"))).toBe("33.3%");
  await page.evaluate(() => grid.openDetails("a"));
  expect(await scaleColor(drawer(page, "scale"))).toContain("33%");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(async () => {
    await grid.setCellValue("d", "amount", 200); await grid.setCellValue("d", "scale", 200); await grid.commitChanges();
    await grid.collapseAllGroups(); await grid.expandAllGroups();
  });
  await nextFrames(page);
  expect(await barWidth(cell(page, "a", "amount"))).toBe("18.2%");
  await page.evaluate(() => grid.openDetails("a"));
  expect(await scaleColor(drawer(page, "scale"))).toContain("18%");
  const exported = await page.evaluate(async () => (await grid.materializeExport({ scope: "all", columns: ["amount", "scale"] })).rows.find(row => row.id === "a").cells);
  expect(exported.amount.format.bar.fraction).toBe(0.182);
  expect(exported.scale.format.color).toContain("18%");
  expect(errors).toEqual([]);
});

for (const [width, mode] of [[390, "phone"], [1440, "always"]]) {
  test(`compact completion preserves a focused editable drawer (${mode}, ${width})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openCompact(page, "sidecar", false, mode);
    await page.evaluate(() => grid.openDetails("a"));
    const input = drawer(page, "amount").locator("input");
    await input.fill("27");
    const before = await input.evaluate(input => {
      input.focus(); input.setSelectionRange(1, 2);
      return { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input };
    });
    expect(before.focused).toBe(true);
    await page.evaluate(() => releaseDecode());
    await expect.poll(() => barWidth(cell(page, "a", "amount"))).toBe("33.3%");
    await nextFrames(page);
    expect(await input.evaluate(input => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd,
      focused: document.activeElement === input }))).toEqual(before);
    expect(await page.evaluate(() => grid.getChanges())).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`typing-${width}.png`) });
  });
}

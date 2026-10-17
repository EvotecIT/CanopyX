import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { nextFrames, repo, runtimeAssets } from "./support.mjs";

const read = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const range = ["2026-09-01T14:32:48.685Z", "2026-09-04T00:44:31.584Z"];
const input = 'Observed time <release candidate> "September": ' + range.join(" – ");

async function open(page, width, dark, numeric = false) {
  const assets = runtimeAssets("reporting");
  await page.setViewportSize({ width, height: 1000 });
  await page.route("http://127.0.0.1:43218/filter-chips", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Filter chips</title><style>' +
    assets.style + read("canopyx-link.css") + 'body{margin:18px}main{display:grid;gap:18px}.chip-host{height:220px}</style><script>' +
    assets.script + read("canopyx-link.js") + '</script></head><body><main><div id="linked-grid" class="chip-host"></div>' +
    '<div id="linked-tree" class="chip-host"></div><div id="query-grid" class="chip-host"></div></main></body></html>' }));
  await page.goto("http://127.0.0.1:43218/filter-chips");
  await page.evaluate(async ({ dark, range, input, numeric }) => {
    const columns = [{ id: "name", title: "Name", kind: "text", width: 240, sortable: true },
      { id: "observed", title: "Observed time", kind: numeric ? "number" : "datetime", width: 240, sortable: true }];
    const rows = [{ id: "a", cells: { name: "Alpha", observed: numeric ? 1.5 : "2026-09-02T12:00:00.000Z" } },
      { id: "b", cells: { name: "Beta", observed: numeric ? 2.5 : "2026-09-03T12:00:00.000Z" } }];
    const base = { protocol: "canopyx/2", label: "Records", pageSize: 50, selection: "multiple", search: true, source: { kind: "inline" }, columns };
    window.chipViews = {
      linkedGrid: CanopyX.createDataGrid(document.getElementById("linked-grid"), { view: { ...base, type: "grid", id: "linked-grid", rows } }),
      linkedTree: CanopyX.createTreeGrid(document.getElementById("linked-tree"), { view: { ...base, type: "view", id: "linked-tree",
        roots: rows.map(row => ({ ...row, label: row.cells.name })) } }),
      own: CanopyX.createDataGrid(document.getElementById("query-grid"), { view: { ...base, type: "grid", id: "query-grid", rows } })
    };
    for (const api of Object.values(chipViews)) await api.ready;
    for (const host of document.querySelectorAll(".cx-host")) host.setAttribute("data-cx-theme", dark ? "dark" : "light");
    for (const api of [chipViews.linkedGrid, chipViews.linkedTree])
      await api.setExternalFilter("observed", { field: "observed", range: numeric ? [1.25, 2.75] : range, sourceLabel: "Observed time" });
    await chipViews.own.setQuery({ search: input, filters: [{ column: "name", operator: "contains", values: [input] }] });
  }, { dark, range, input, numeric });
  await nextFrames(page);
}

for (const width of [1440, 390]) for (const dark of [false, true]) {
  test(`labelled range chips describe exact bounds at ${width} ${dark ? "dark" : "light"}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const numeric of [false, true]) {
      await open(page, width, dark, numeric);
      const exact = numeric ? [1.25, 2.75] : range;
      const label = numeric ? "≈ Selected band <1–3>" : "≈ September 2–4";
      for (const bounds of [exact, [null, exact[1]], [exact[0], null]]) {
        await page.evaluate(async ({ bounds, label }) => {
          for (const api of [chipViews.linkedGrid, chipViews.linkedTree])
            await api.setExternalFilter("observed", { field: "observed", range: bounds, label, sourceLabel: "Observed time" });
        }, { bounds, label });
        const described = label + " (" + bounds.map(value => value == null ? "…" : String(value)).join(" – ") + ")";
        for (const id of ["linked-grid", "linked-tree"]) {
          const chip = page.locator(`#${id} .cx-link-chip`);
          await expect(chip).toHaveText("Filtered by Observed time: " + label + " ×");
          await expect(chip).toHaveAttribute("title", "Filtered by Observed time: " + described);
          await expect(chip).toHaveAccessibleName("Remove the filter from Observed time: " + described);
        }
        const filters = await page.evaluate(() => [chipViews.linkedGrid.getExternalFilters(), chipViews.linkedTree.getExternalFilters()]);
        for (const [filter] of filters) { expect(filter.range).toEqual(bounds); expect(filter.label).toBe(label); }
        if (bounds === exact) await page.locator("main").screenshot({ path: testInfo.outputPath(numeric ? "labelled-number-range.png" : "labelled-date-range.png") });
      }
      await page.locator("#linked-grid .cx-link-chip").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#linked-grid .cx-link-chip")).toHaveCount(0);
      await expect(page.locator('#linked-grid input[type="search"]')).toBeFocused();
      await page.locator("#linked-tree .cx-link-chip").click();
      await expect(page.locator("#linked-tree .cx-link-chip")).toHaveCount(0);
      await expect(page.locator("#linked-tree .cx-grid")).toBeFocused();
    }
    expect(errors).toEqual([]);
  });

  test(`long filter chips preserve their start and removal control at ${width} ${dark ? "dark" : "light"}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await open(page, width, dark);
    const chips = page.locator(".cx-link-chip, .cx-grid-chip");
    await expect(chips).toHaveCount(4);
    await page.locator("main").screenshot({ path: testInfo.outputPath("filter-chips.png") });
    const layout = await chips.evaluateAll(buttons => buttons.map(button => {
      const label = button.querySelector(".cx-chip-label"), remove = button.querySelector(".cx-chip-remove");
      const text = label?.firstChild || button.firstChild, end = remove?.firstChild || text;
      const startRange = document.createRange(), endRange = document.createRange();
      startRange.setStart(text, 0); startRange.setEnd(text, 2);
      endRange.setStart(end, end.length - 1); endRange.setEnd(end, end.length);
      const box = button.getBoundingClientRect(), style = getComputedStyle(button), labelStyle = getComputedStyle(label || button);
      return { title: button.title, start: startRange.getBoundingClientRect().left, removeRight: endRange.getBoundingClientRect().right,
        left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight),
        labelRight: label?.getBoundingClientRect().right, removeLeft: remove?.getBoundingClientRect().left,
        overflow: (label || button).scrollWidth > (label || button).clientWidth,
        textOverflow: labelStyle.textOverflow, whiteSpace: labelStyle.whiteSpace, hasParts: !!label && !!remove };
    }));
    fs.writeFileSync(testInfo.outputPath("chip-layout.json"), JSON.stringify(layout, null, 2));
    for (const chip of layout) {
      expect(chip.start, chip.title + " must show its first characters").toBeGreaterThanOrEqual(chip.left - 1);
      expect(chip.removeRight, chip.title + " must show its removal control").toBeLessThanOrEqual(chip.right + 1);
      expect(chip.hasParts).toBe(true);
      expect(chip.labelRight).toBeLessThanOrEqual(chip.removeLeft + 1);
      expect(chip.textOverflow).toBe("ellipsis");
      expect(chip.whiteSpace).toBe("nowrap");
      expect(chip.overflow).toBe(width === 390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const linkedText = "Filtered by Observed time: " + range.join(" – ");
    for (const id of ["linked-grid", "linked-tree"]) {
      const chip = page.locator(`#${id} .cx-link-chip`);
      await expect(chip).toHaveText(linkedText + " ×");
      await expect(chip).toHaveAttribute("title", linkedText);
      await expect(chip).toHaveAccessibleName("Remove the filter from Observed time: " + range.join(" – "));
    }
    const search = page.locator('#query-grid [data-cx-condition="search"]');
    await expect(search).toHaveAttribute("title", input);
    await expect(search).toHaveAccessibleName("Clear search: " + input);
    await expect(page.locator('#query-grid [data-cx-condition="filter-0"]')).toHaveAccessibleName("Remove condition: Name contains " + input);
    await page.locator("#linked-grid .cx-link-chip").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#linked-grid .cx-link-chip")).toHaveCount(0);
    await expect(page.locator('#linked-grid input[type="search"]')).toBeFocused();
    await page.locator("#linked-tree .cx-link-chip").click();
    await expect(page.locator("#linked-tree .cx-link-chip")).toHaveCount(0);
    await expect(page.locator("#linked-tree .cx-grid")).toBeFocused();
    await search.focus();
    await page.keyboard.press("Enter");
    await expect(search).toHaveCount(0);
    await expect(page.locator('#query-grid [data-cx-condition="clear"]')).toBeFocused();
    await page.locator('#query-grid [data-cx-condition="filter-0"]').click();
    await expect(page.locator("#query-grid .cx-grid-chip")).toHaveCount(0);
    await expect(page.locator('#query-grid input[type="search"]')).toBeFocused();
    expect(errors).toEqual([]);
  });
}

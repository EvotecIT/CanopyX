import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

for (const composing of [false, true]) test("calculated initialization preserves queued preference search" + (composing ? " during composition" : ""), async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "calculated-preferences", label: "Calculated preferences", source: { kind: "inline" },
    rowHeight: 34, pageSize: 100, selection: "none", search: true, searchDelayMs: 100, stateKey: "calculated-reader", reporting: { viewStorage: "local" },
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "input", title: "Input", kind: "number" },
      { id: "derived", title: "Derived", kind: "number", calculation: "[input] * 2" }],
    rows: [{ id: "source", cells: { name: "Source", input: 2 } }, { id: "archive", cells: { name: "Archive", input: 3 } }] };
  const setup = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-calculations.js"), "utf8") +
    ";CanopyX.configure('calculated-preferences',{viewStore:{load(){return new Promise(resolve=>window.loadResolve=resolve);},save(){}}});";
  await page.route("http://127.0.0.1/calculated-preferences", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://127.0.0.1/calculated-preferences"); await page.waitForFunction(() => typeof window.loadResolve === "function");
  await page.evaluate(composing => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx, current = grid.getState(), search = document.querySelector('.cx-search-input');
    current.query.search = "Archive";
    if (composing) search.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    search.value = "Source"; search.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: composing }));
    window.loadResolve({ version: 1, view: grid.view.id, current, views: [] });
  }, composing);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
  await expect(page.locator('.cx-search-input')).toHaveValue("Source");
  if (composing) {
    expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().search)).toBe("");
    await page.locator('.cx-search-input').dispatchEvent("compositionend");
  }
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getQuery().search)).toBe("Source");
  expect((await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getLoadedRows(["source"])))[0].cells.derived).toBe(4);
});

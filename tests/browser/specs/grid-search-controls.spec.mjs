import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const view = (extra = {}) => Object.assign({ protocol: "canopyx/2", type: "grid", id: "inventory", label: "Inventory",
  source: { kind: "inline" }, rowHeight: 28, pageSize: 10, selection: "multiple", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 200, sortable: true },
    { id: "amount", title: "Amount", kind: "number", width: 100, sortable: true }],
  rows: [{ id: "a", cells: { name: "Alpha 東京", amount: 20 } }, { id: "b", cells: { name: "Beta", amount: 10 } }]
}, extra);
async function open(page, definition, setup = "") {
  await page.route("http://canopyx.test/search-controls", route => route.fulfill({ contentType: "text/html",
    body: viewPage(definition).replace("</head>", "<script>" + setup + "</script></head>") }));
  await page.goto("http://canopyx.test/search-controls"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
const controller = "document.querySelector('[data-canopyx-host]').canopyx";

test("immediate inline search waits for composition and Enter bypasses a configured debounce", async ({ page }) => {
  await open(page, view(), "window.accepted=[];CanopyX.configure('inventory',{onQuery({query}){accepted.push(query.search);}});");
  const search = page.getByRole("searchbox", { name: "Search", exact: true });
  await search.evaluate(input => {
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input.value = "東";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, inputType: "insertCompositionText" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", isComposing: true, keyCode: 229 }));
  });
  await nextFrames(page);
  expect(await page.evaluate(() => accepted)).toEqual([""]);
  await search.evaluate(input => {
    input.value = "東京"; input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "東京" }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: false, inputType: "insertText" }));
  });
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 2 rows");
  expect(await page.evaluate(() => accepted)).toEqual(["", "東京"]);
  await page.evaluate(controller + ".destroy()");
  await page.evaluate(() => { document.querySelector("[data-canopyx-host]").canopyx = CanopyX.createDataGrid(document.querySelector("[data-canopyx-host]"),
    { view: JSON.parse(document.querySelector("script.cx-config").textContent), searchDelayMs: 5000 }); });
  await page.evaluate(controller + ".ready");
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 2 rows");
  await page.clock.install();
  await search.fill("Beta"); await nextFrames(page);
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 2 rows");
  await search.press("Enter"); await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 2 rows");
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Beta");
});

test("accepted chips and counts survive pending or failed host queries and clear all cancels queued text", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, searchDelayMs: 5000 }); delete definition.rows;
  definition.query = { search: "Alpha", filters: [{ column: "amount", operator: "ge", values: [10] }],
    filterGroup: { operator: "or", filters: [{ column: "name", operator: "isNotNull", values: [] }], groups: [] } };
  await open(page, definition, `window.pending=[];window.requests=[];CanopyX.configure('inventory',{source:{query(query){
    requests.push(query);const result={protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:query.offset,total:2,
      matched:query.search?1:2,items:query.search?[{id:'a',cells:{name:'Alpha',amount:20}}]:[{id:'a',cells:{name:'Alpha',amount:20}},{id:'b',cells:{name:'Beta',amount:10}}]};
    if(requests.length===1)return result;return new Promise((resolve,reject)=>pending.push({query,accept:()=>resolve(result),reject}));
  }}});`);
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 2 rows");
  await page.evaluate(() => { document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "Beta" }).catch(() => {}); });
  await expect(page.getByRole("button", { name: "Clear search: Alpha", exact: true })).toBeVisible();
  await page.evaluate(() => pending[0].reject(new Error("Host denied request")));
  await expect(page.getByRole("alert")).toContainText("Host denied request");
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 2 rows");
  await page.clock.install();
  await page.getByRole("searchbox").fill("Queued");
  await page.getByRole("button", { name: "Clear search and filters", exact: true }).click();
  expect(await page.evaluate(() => requests.at(-1).search)).toBe("");
  expect(await page.evaluate(() => requests.at(-1).filters)).toEqual([]);
  expect(await page.evaluate(() => requests.at(-1).filterGroup || null)).toBeNull();
  await page.evaluate(() => pending.at(-1).accept());
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 2 rows");
  await expect(page.locator(".cx-grid-query-chips button")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  // Advance the actual timer past its deadline; the cleared pending text must not send another request.
  await page.clock.fastForward(6000);
  expect(await page.evaluate(() => requests.length)).toBe(3);
});

for (const activation of ["pointer", "unfocused"]) test(`removing a chip by ${activation} preserves other accepted conditions and restores usable focus`, async ({ page }) => {
  const definition = view();
  definition.query = { search: "Alpha", filters: [{ column: "amount", operator: "ge", values: [10] }],
    filterGroup: { operator: "or", filters: [{ column: "name", operator: "isNotNull", values: [] }], groups: [] } };
  await open(page, definition);
  const remove = page.getByRole("button", { name: "Remove condition: Amount ≥ 10", exact: true });
  await remove.focus(); await remove.press("Enter");
  expect(await page.evaluate(controller + ".getQuery().filters")).toEqual([]);
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Alpha");
  expect(await page.evaluate(controller + ".getQuery().filterGroup.operator")).toBe("or");
  await expect(page.getByRole("button", { name: "Clear search and filters", exact: true })).toBeFocused();
  const activate = async button => {
    if (activation === "pointer") await button.click();
    else await button.evaluate(element => { document.activeElement.blur(); element.click(); });
  };
  await activate(page.getByRole("button", { name: "Clear grouped filters", exact: true }));
  expect(await page.evaluate(controller + ".getQuery().filterGroup || null")).toBeNull();
  await activate(page.getByRole("button", { name: "Clear search: Alpha", exact: true }));
  await expect(page.locator(".cx-grid-result-count")).toHaveText("2 of 2 rows");
  await expect(page.getByRole("searchbox")).toBeFocused();
});

test("invalid input timing rejects browser overrides before creating controls", async ({ page }) => {
  await open(page, view());
  const rejected = await page.evaluate(() => {
    const definition = JSON.parse(document.querySelector("script.cx-config").textContent);
    return [-1, 5001, 0.5, "300", null, NaN].map(searchDelayMs => {
      const host = document.createElement("div"); document.body.appendChild(host);
      try { CanopyX.createDataGrid(host, { view: definition, searchDelayMs }); return false; }
      catch (_) { return host.childElementCount === 0; }
      finally { host.remove(); }
    });
  });
  expect(rejected).toEqual(Array(6).fill(true));
});

test("a delayed chip removal respects focus moved outside the conditions", async ({ page }) => {
  const definition = view({ source: { kind: "host" }, query: { search: "Alpha" } }); delete definition.rows;
  await open(page, definition, `window.calls=0;CanopyX.configure('inventory',{source:{query(query){
    const result={protocol:'canopyx/2',type:'gridPage',view:'inventory',revision:'r1',offset:query.offset,total:2,
      matched:query.search?1:2,items:query.search?[{id:'a',cells:{name:'Alpha',amount:20}}]:[{id:'a',cells:{name:'Alpha',amount:20}},{id:'b',cells:{name:'Beta',amount:10}}]};
    if(++calls===1)return result;return new Promise(resolve=>window.finishRemoval=()=>resolve(result));
  }}});`);
  await page.getByRole("button", { name: "Clear search: Alpha", exact: true }).click();
  await page.waitForFunction(() => !!window.finishRemoval);
  await page.evaluate(() => { const button = document.createElement("button"); button.textContent = "Continue report"; document.body.appendChild(button); });
  const outside = page.getByRole("button", { name: "Continue report", exact: true }); await outside.focus();
  await page.evaluate(() => finishRemoval());
  await expect(page.locator(".cx-grid-query-chips button")).toHaveCount(0);
  await expect(outside).toBeFocused();
});

test("incremental controls include queued search text while explicit reset replaces it", async ({ page }) => {
  await open(page, view({ searchDelayMs: 5000, query: { filters: [{ column: "amount", operator: "ge", values: [10] }] } }));
  await page.getByRole("searchbox").fill("Beta");
  await page.getByRole("button", { name: "Amount", exact: true }).click();
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Beta");
  expect(await page.evaluate(controller + ".getQuery().sort")).toEqual([{ column: "amount", direction: "asc" }]);
  await expect(page.locator(".cx-grid-result-count")).toHaveText("1 of 2 rows");
  await page.getByRole("searchbox").fill("Alpha");
  await page.getByRole("button", { name: "Remove condition: Amount ≥ 10", exact: true }).click();
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Alpha");
  expect(await page.evaluate(controller + ".getQuery().filters")).toEqual([]);
  await page.locator(".cx-grid-filters > summary").click();
  await page.getByRole("searchbox").fill("Beta");
  await page.locator(".cx-grid-filters").getByRole("button", { name: "Done", exact: true }).click();
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Beta");
  await page.getByRole("searchbox").fill("Alpha");
  await page.locator(".cx-grid-filters > summary").click();
  await page.locator(".cx-grid-filters").getByRole("button", { name: "Clear all filters", exact: true }).click();
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("Alpha");
  await page.getByRole("searchbox").fill("Beta");
  await page.evaluate(controller + ".resetView()");
  expect(await page.evaluate(controller + ".getQuery().search")).toBe("");
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

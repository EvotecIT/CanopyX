import { test, expect } from "@playwright/test";
import { viewPage, row, nextFrames } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "ownership", label: "Records", rowHeight: 28, pageSize: 50,
  selection: "multiple", dragDrop: true, contextActions: [{ id: "inspect", label: "Inspect" }],
  columns: [{ id: "name", title: "Name", kind: "text", width: 320, sortable: true, editable: true },
    { id: "amount", title: "Amount", kind: "number", width: 120, editable: true }],
  source: { kind: "inline" }, roots: [{ id: "a", label: "Atlas", expanded: true, children: [{ id: "a0", label: "Planning" }] },
    { id: "b", label: "Beacon", cells: { amount: 12 } }] };

async function mount(page, options) {
  const html = viewPage(view).replace("</head>", `<script>CanopyX.configure('ownership',${options});</script></head>`);
  await page.route("https://ownership.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://ownership.test/"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
const countsSource = `Object.assign(CanopyX.sources.inline(${JSON.stringify(view)}),
  {counts:()=>new Promise((resolve,reject)=>{window.finishCounts=resolve;window.failCounts=reject})})`;

for (const kind of ["edit", "drop", "action"]) test(`an affected count read promptly aborts a pending ${kind} hook`, async ({ page }) => {
  await mount(page, `{source:${countsSource},onEdit:window.hook=(proposal,context)=>{
    window.hostSignal=context.signal;return new Promise(resolve=>window.finishHook=resolve)},onDrop:hook,onAction:hook}`);
  const result = await page.evaluate(async kind => {
    const api = document.querySelector(".cx-host").canopyx;
    const operation = kind === "edit" ? api.requestEdit("a", "name", "New label") :
      kind === "drop" ? api.requestDrop(["a0"], "b", "inside") : api.requestAction("a", "inspect");
    const refresh = api.refreshCounts([kind === "drop" ? "b" : "a"]);
    const aborted = window.hostSignal.aborted;
    window.failCounts(new Error("Count read failed"));
    await refresh.catch(() => {});
    window.finishHook(true);
    return { aborted, accepted: await operation };
  }, kind);
  expect(result).toEqual({ aborted: true, accepted: false });
});

test("an unrelated count read preserves the pending hook", async ({ page }) => {
  await mount(page, `{source:${countsSource},onAction(proposal,context){window.hostSignal=context.signal;return new Promise(resolve=>window.finishHook=resolve)}}`);
  expect(await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx, operation = api.requestAction("a", "inspect");
    const refresh = api.refreshCounts(["b"]), aborted = hostSignal.aborted;
    failCounts(new Error("Count read failed")); await refresh.catch(() => {}); finishHook(true);
    return { aborted, accepted: await operation };
  })).toEqual({ aborted: false, accepted: true });
});

test("count-read cancellation hands a reentrant proposal the new request ownership", async ({ page }) => {
  await mount(page, `{source:${countsSource},onAction(proposal,context){
    window.signals||(window.signals=[]);signals.push(context.signal);
    if(signals.length===1) context.signal.addEventListener('abort',()=>{
      window.replacement=document.querySelector('.cx-host').canopyx.requestAction('a','inspect')},{once:true});
    return new Promise(resolve=>window.finishHook=resolve)}}`);
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx, operation = api.requestAction("a", "inspect");
    const refresh = api.refreshCounts(["a"]);
    const aborted = signals[0].aborted;
    if (!aborted) { failCounts(new Error("Count read failed")); await refresh.catch(() => {}); finishHook(false); await operation; return { aborted }; }
    failCounts(new Error("Count read failed")); await refresh.catch(() => {}); finishHook(true);
    return { aborted, oldAccepted: await operation, newAccepted: await replacement, count: signals.length };
  });
  expect(result).toEqual({ aborted: true, oldAccepted: false, newAccepted: true, count: 2 });
});

for (const presentation of ["sort", "filter", "column", "collapse"]) test(`a ${presentation} change closes a stale editor and preserves grid focus`, async ({ page }) => {
  await mount(page, "{onEdit:()=>true}");
  await page.evaluate(presentation => document.querySelector(".cx-host").canopyx.beginEdit(
    presentation === "column" ? "b" : "a0", presentation === "column" ? "amount" : "name"), presentation);
  await expect(page.getByRole("dialog")).toBeVisible();
  if (presentation === "collapse") await row(page, "a").press("ArrowLeft");
  else await page.evaluate(presentation => {
    const api = document.querySelector(".cx-host").canopyx;
    if (presentation === "sort") api.sort("name", "desc");
    if (presentation === "filter") api.setFilter(node => node.id === "b");
    if (presentation === "column") api.setColumnVisible("amount", false);
  }, presentation);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, presentation === "filter" || presentation === "column" ? "b" : presentation === "collapse" ? "a" : "a0")).toBeFocused();
});

test("a filtered action menu closes before its hidden node can execute", async ({ page }) => {
  await mount(page, "{onAction(){window.executions=(window.executions||0)+1;return true}}");
  await row(page, "a0").press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions" })).toBeVisible();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setFilter(node => node.id === "b"));
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(row(page, "b")).toBeFocused();
  expect(await page.evaluate(() => window.executions || 0)).toBe(0);
});

test("an aborted editor can reopen against the committed local sort", async ({ page }) => {
  await mount(page, `{onEdit(proposal,context){context.signal.addEventListener('abort',()=>{
    document.querySelector('.cx-host').canopyx.beginEdit('b','name')},{once:true});return new Promise(()=>{})}}`);
  await row(page, "a0").press("Alt+Enter"); await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit Name" })).toBeDisabled();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.sort("name", "desc"));
  await expect(page.getByRole("textbox", { name: "Edit Name" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Edit Name" })).toHaveValue("Beacon");
  expect(await page.evaluate(() => {
    const panel = document.querySelector(".cx-interaction-panel"), anchor = document.querySelector('[data-cx-id="b"]');
    return Math.abs(Number.parseFloat(panel.style.top) - anchor.getBoundingClientRect().bottom);
  })).toBeLessThanOrEqual(1);
});

import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

for (const type of ["view", "grid"]) test(`${type} renderer lifetimes end on repaint, recycling, layout replacement and destroy`, async ({ page }) => {
  const records = Array.from({ length: 600 }, (_, i) => ({ id: "r" + i, label: "Record " + i, cells: { name: "Record " + i, state: "Ready" } }));
  const view = { protocol: "canopyx/2", type, id: "lifetime", label: "Lifetimes", source: { kind: "inline" }, rowHeight: 28, pageSize: 1000, selection: "single",
    columns: [{ id: "name", title: "Name", kind: "text", width: 180 }, { id: "state", title: "State", kind: "text", width: 100 }],
    ...(type === "view" ? { roots: records } : { rows: records.map(({ label, ...row }) => row) }) };
  await page.route("http://canopyx.test/lifetimes", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/lifetimes"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async type => {
    const host = document.querySelector("[data-canopyx-host]"), view = host.canopyx.view; host.canopyx.destroy();
    window.alive = new Set(); window.created = 0; window.cleaned = 0; window.events = 0; window.unusedContexts = [];
    window.api = CanopyX[type === "view" ? "createTreeGrid" : "createDataGrid"](host, { view, renderers: {
      name(row, element, context) { window.unusedContexts.push(context); return false; },
      state(row, element, context) {
      const token = ++window.created; window.alive.add(token);
      window.addEventListener("host-cell-event", () => window.events++, { signal: context.signal });
      context.onDispose(() => { if (!context.signal.aborted) throw new Error("cleanup before abort"); window.alive.delete(token); window.cleaned++; });
      return false;
    } } }); await window.api.ready;
  }, type);
  await nextFrames(page);
  const before = await page.evaluate(() => ({ created, cleaned, alive: alive.size })); expect(before.alive).toBeGreaterThan(0);
  await page.evaluate(() => { window.api.refresh(); }); await nextFrames(page);
  expect(await page.evaluate(() => cleaned)).toBeGreaterThan(before.cleaned);
  await page.evaluate(() => { document.querySelector(".cx-grid").scrollTop = 8000; }); await nextFrames(page);
  const scrolled = await page.evaluate(() => ({ created, cleaned, alive: alive.size }));
  expect(scrolled.cleaned).toBeGreaterThan(before.created); expect(scrolled.alive).toBeLessThan(100);
  if (type === "view") {
    const outline = await page.evaluate(() => { const count = cleaned; window.api.toOutline(); return cleaned - count; });
    expect(outline).toBe(600);
  }
  await page.evaluate(() => window.api.setColumnVisible("state", false)); await nextFrames(page);
  expect(await page.evaluate(() => alive.size)).toBe(0);
  await page.evaluate(() => window.api.setColumnVisible("state", true)); await nextFrames(page);
  expect(await page.evaluate(() => alive.size)).toBeGreaterThan(0);
  const result = await page.evaluate(() => {
    window.api.destroy(); window.api.destroy(); const previous = events; window.dispatchEvent(new Event("host-cell-event"));
    let lateCleanups = 0;
    const { onDispose } = window.unusedContexts[0]; onDispose(() => lateCleanups++);
    return { created, cleaned, alive: alive.size, eventDelta: events - previous, lateCleanups,
      lateSignalsAborted: window.unusedContexts.every(context => context.signal.aborted) };
  });
  expect(result.cleaned).toBe(result.created); expect(result.alive).toBe(0); expect(result.eventDelta).toBe(0);
  expect(result.lateCleanups).toBe(1); expect(result.lateSignalsAborted).toBe(true);
});

for (const navigation of ["offset", "cursor"]) test(`${navigation} reload restarts accepted navigation with a fresh revision`, async ({ page }) => {
  const cursor = navigation === "cursor";
  const view = { protocol: "canopyx/2", type: "grid", id: "restart", label: "Restart", source: { kind: "host", ...(cursor ? { navigation } : {}) },
    presentation: "paged", pageLength: 5, pageSize: 5, rowHeight: 28, selection: "single", search: true,
    columns: [{ id: "name", title: "Name", kind: "text", width: 180 }] };
  const setup = `<script>window.revision='r1';window.queries=[];CanopyX.configure('restart',{source:{${cursor ? "navigation:'cursor'," : ""}query(q){
    queries.push(q);const offset=${cursor ? "q.cursor?Number(q.cursor):0" : "q.offset"};const items=Array.from({length:5},(_,i)=>({id:'r'+(offset+i),cells:{name:revision}}));
    return {protocol:'canopyx/2',type:'${cursor ? "gridCursorPage" : "gridPage"}',view:'restart',revision,offset,total:15,matched:15,items,
      ...(${cursor ? "offset<10" : "false"}?{nextCursor:String(offset+5)}:{})};}}});</script>`;
  await page.route("http://canopyx.test/restart", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
  await page.goto("http://canopyx.test/restart"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    await api.setQuery({ search: "kept" }); await api.nextPage(); const prior = api.getPaging().first;
    revision = "r2"; await api.reload();
    return { prior, first: api.getPaging().first, query: api.getQuery(), request: queries.at(-1) };
  });
  expect(result.prior).toBe(6); expect(result.first).toBe(1); expect(result.query.revision).toBe("r2");
  expect(result.query.search).toBe("kept"); expect(result.request.revision).toBeUndefined(); expect(result.request.cursor).toBeUndefined();
  if (!cursor) expect(result.request.offset).toBe(0);
});

test("data reload accepts a fresh revision and retains accepted criteria; failed reload keeps the last accepted query", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "reload", label: "Reload", source: { kind: "host" }, rowHeight: 28, pageSize: 10, selection: "single",
    search: true, columns: [{ id: "name", title: "Name", width: 180, kind: "text", sortable: true }] };
  const setup = `<script>window.revision='r1';window.fail=false;window.queries=[];CanopyX.configure('reload',{source:{async query(query){window.queries.push(query);
    if(window.fail)throw new Error('source unavailable');return {protocol:'canopyx/2',type:'gridPage',view:'reload',revision:window.revision,
      offset:query.offset,total:1,matched:1,items:[{id:'record',cells:{name:window.revision}}]};}}});</script>`;
  await page.route("http://canopyx.test/reload", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
  await page.goto("http://canopyx.test/reload"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    await api.setQuery({ search: "record", sort: [{ column: "name", direction: "desc" }] });
    const old = api.prepareExport({ scope: "filtered" }); window.revision = "r2";
    const stale = await (async () => { for await (const row of old.rows()) {} })().then(() => false, () => true);
    await api.reload(); const accepted = api.getQuery(), reloadRequest = window.queries.at(-1);
    window.fail = true; const failed = await api.reload().then(() => false, () => true);
    return { stale, failed, accepted, reloadRequest, preserved: api.getQuery() };
  });
  expect(result.stale).toBe(true); expect(result.failed).toBe(true); expect(result.accepted.revision).toBe("r2");
  expect(result.reloadRequest.revision).toBeUndefined(); expect(result.accepted.search).toBe("record");
  expect(result.accepted.sort).toEqual([{ column: "name", direction: "desc" }]); expect(result.preserved).toEqual(result.accepted);
  await expect(page.locator('.cx-row[data-cx-id="record"]')).toContainText("r2");
});

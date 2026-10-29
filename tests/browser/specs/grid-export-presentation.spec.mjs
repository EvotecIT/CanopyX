import { test, expect } from "@playwright/test";
import { viewPage, runtimeAssets } from "./support.mjs";

test("capture resolves text, links and highlight precedence without losing raw precision or CSS diagnostics", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "capture", label: "Capture", source: { kind: "inline" }, rowHeight: 28, pageSize: 10, selection: "single",
    reporting: {}, columns: [
      { id: "name", title: "Record", kind: "text", width: 180, wrap: true, pinned: "left", presenter: { kind: "link", hrefColumn: "url" } },
      { id: "url", title: "Address", kind: "text", width: 180, hidden: true },
      { id: "size", title: "Size", kind: "number", width: 100, presenter: { kind: "progress", maximum: 100 } },
      { id: "when", title: "When", kind: "datetime", width: 180 }, { id: "host", title: "Host", kind: "text", width: 100 } ],
    highlightRules: [{ column: "size", operator: "gt", values: [10], tone: "warning" },
      { column: "size", operator: "gt", values: [10], tone: "danger" },
      { column: "size", operator: "gt", values: [10], target: "cell", tone: "info" }],
    rows: [{ id: "a", tone: "success", cells: { name: { value: "a", text: "Open A", title: "Record details" }, url: "https://example.com/a",
      size: { value: 12, text: "12 KiB", tone: "danger" }, when: "2026-01-02T03:04:05.1234567Z", host: { value: "x", className: "custom-style" } } },
      { id: "b", cells: { name: "B", url: "javascript:alert(1)", size: 1, when: "2026-01-02T03:04:05Z", host: "y" } }] };
  const setup = `<script>CanopyX.configure('capture',{renderers:{host(row,element){element.textContent='DOM only';return true;}}});</script>`;
  await page.route("http://canopyx.test/capture", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", setup + "</head>") }));
  await page.goto("http://canopyx.test/capture"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx,
      fitted = document.querySelector('.cx-hcell[data-cx-column="name"]').getBoundingClientRect().width,
      exportView = api.prepareExport({ scope: "all", locale: "en-US", timeZone: "utc" });
    const collect = async () => { const rows = []; for await (const row of exportView.rows()) rows.push(row); return rows; };
    const rows = await collect(); api.setTimeZone("local"); api.setColumnWidth("name", 300);
    return { request: exportView.request, fitted, rows, repeated: await collect(), frozen: Object.isFrozen(rows[0].cells.name.link) };
  });
  expect(result.request.recordCount).toBe(2); expect(result.request.columns[0].width).toMatchObject({ unit: "css-px", minimum: 40 });
  expect(result.request.columns[0].width.preferred).toBeCloseTo(result.fitted, 2);
  expect(result.request.columns[0].pinned).toBe("left");
  expect(result.request.columns[0].wrap).toBe(true); expect(result.rows[0].tone).toBe("warning");
  expect(result.rows[0].cells.name).toMatchObject({ value: "a", text: "Open A", link: { target: "https://example.com/a", tooltip: "Record details" } });
  expect(result.rows[0].cells.size).toMatchObject({ value: 12, text: "12 KiB", tone: "info" });
  expect(result.rows[0].cells.when.value).toBe("2026-01-02T03:04:05.1234567Z");
  expect(result.rows[0].cells.host.diagnostics).toEqual(["custom-renderer", "custom-class"]);
  expect(result.rows[1].cells.name.link).toBeUndefined(); expect(result.rows[1].cells.name.diagnostics).toContain("unsafe-link");
  expect(result.repeated).toEqual(result.rows); expect(result.frozen).toBe(true);
});

test("semantic capture respects missing primary values, inverted boolean tone and partial delta presentation", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "semantics", label: "Semantics", source: { kind: "inline" },
    reporting: {}, rowHeight: 28, pageSize: 10, selection: "single", columns: [
      { id: "name", title: "Name", kind: "text", presenter: { kind: "identifier", secondaryColumn: "secondary" } },
      { id: "secondary", title: "Secondary", kind: "text", hidden: true },
      { id: "amount", title: "Amount", kind: "number", presenter: { kind: "change", deltaColumn: "delta" } },
      { id: "delta", title: "Delta", kind: "number", hidden: true },
      { id: "flag", title: "Flag", kind: "text", presenter: { kind: "boolean", inverted: true } }
    ], rows: [{ id: "missing", cells: { name: null, secondary: "Hidden secondary", amount: null, delta: 5, flag: true } },
      { id: "present", cells: { name: "Name", secondary: "Secondary", amount: 7, delta: -2, flag: false } }] };
  await page.route("http://canopyx.test/semantics", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/semantics"); await page.waitForSelector("[data-cx-ready]");
  const rows = await page.evaluate(async () => {
    const rows = [], capture = document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "all", locale: "en-US" });
    for await (const row of capture.rows()) rows.push(row); return rows;
  });
  expect(rows[0].cells.name.text).toBe("—"); expect(rows[0].cells.amount.text).toBe("—");
  expect(rows[0].cells.flag).toMatchObject({ value: true, text: "Yes", tone: "danger" });
  expect(rows[1].cells.name.text).toBe("Name\nSecondary");
  expect(rows[1].cells.amount).toMatchObject({ value: 7, text: "↓ 2 7", diagnostics: ["partial-tone"] });
  expect(rows[1].cells.flag.text).toBe("No");
});

for (const runtime of ["grid", "reporting"]) test(`${runtime} host receives its frozen capture and enumeration cancellation reaches source I/O independently`, async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "handoff", label: "Handoff", source: { kind: "host" },
    ...(runtime === "reporting" ? { reporting: {} } : {}), rowHeight: 28, pageSize: 2, selection: "multiple",
    columns: [{ id: "name", title: "Name", kind: "text", width: 180 }] };
  const setup = `<script>window.calls=[];window.hold=false;CanopyX.configure('handoff',{source:{query(q,{signal}){
    calls.push({offset:q.offset,signal});if(hold&&q.offset===2)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
    return {protocol:'canopyx/2',type:'gridPage',view:'handoff',revision:'r1',offset:q.offset,total:4,matched:4,
      items:Array.from({length:2},(_,i)=>({id:'r'+(q.offset+i),cells:{name:{value:'raw',text:'Shown'}}}))};}},
    onExport(e){window.capture=e.capture;window.sameRequest=e.request===e.capture.request;}});</script>`;
  const html = viewPage(view).replace(/<script>[\s\S]*?<\/script>/, () => '<script>' + runtimeAssets(runtime).script + '</script>')
    .replace("</head>", setup + "</head>");
  await page.route("http://canopyx.test/handoff", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/handoff"); await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    await api.exportToHost("xlsx", { scope: "all" }); hold = true;
    const controller = new AbortController(), iterator = capture.rows({ signal: controller.signal });
    await iterator.next(); await iterator.next(); const pending = iterator.next().catch(error => error.name);
    while (!calls.some(call => call.offset === 2)) await new Promise(resolve => setTimeout(resolve, 0));
    const request = calls.at(-1); controller.abort(); const error = await pending;
    hold = false; const repeated = []; for await (const row of capture.rows()) repeated.push(row);
    return { sameRequest, error, aborted: request.signal.aborted, frozen: Object.isFrozen(capture.request), request: capture.request, repeated };
  });
  expect(result.sameRequest).toBe(true); expect(result.frozen).toBe(true); expect(result.aborted).toBe(true); expect(result.error).toBe("AbortError");
  expect(result.request.recordCount).toBe(4); expect(result.request.presentation).toBe(runtime === "reporting" ? "semantic" : "text");
  expect(result.repeated.map(row => row.id)).toEqual(["r0", "r1", "r2", "r3"]);
  expect(result.repeated[0].cells.name).toMatchObject({ value: "raw", text: "Shown" });
});

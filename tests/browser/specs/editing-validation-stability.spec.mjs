// A save must have completed validation of the same row snapshot it offers to its writer.
import { test, expect } from "@playwright/test";
import { serveGrid } from "./editing-support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const view = { protocol: "canopyx/2", type: "grid", id: "assets", label: "Validated records", pageSize: 10,
  source: { kind: "inline" }, selection: "none", search: false,
  columns: [{ id: "name", title: "Name", kind: "text", editable: true, width: 260 },
    { id: "limit", title: "Limit", kind: "number", width: 100 }],
  rows: [{ id: "a", cells: { name: "Original", limit: 1 } }] };

test.beforeEach(async ({ page }) => {
  page.validationErrors = [];
  page.on("pageerror", error => page.validationErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.validationErrors).toEqual([]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

async function open(page, mode = "batch") {
  if (mode === "drawer") await page.setViewportSize({ width: 390, height: 844 });
  await serveGrid(page, { view, script: `window.rowChecks=[];window.rowCalls=[];window.writes=[];window.holdRows=true;
    CanopyX.configure('assets',{editing:{drawer:'${mode === "drawer" ? "always" : "never"}',
      validators:{name:value=>value==='v6'?new Promise(resolve=>window.releaseLatest=resolve):null},
      validateRow:(row,change)=>{rowCalls.push(change.values.name);return holdRows?new Promise(resolve=>rowChecks.push({value:change.values.name,resolve})):null;}},
      onRowCommit:detail=>{writes.push(detail.values);return {status:'saved'};}});` });
  await page.evaluate(`window.api=${api}`);
}

async function start(page, mode) {
  if (mode === "drawer") {
    await page.evaluate(() => api.openRecord("a"));
    await page.getByRole("textbox", { name: "Edit Name", exact: true }).fill("v1");
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  } else await page.evaluate(async mode => {
    await api.setCellValue("a", "name", "v1");
    window.saving = mode === "batch" ? api.commitChanges() : api.commitRow("a");
  }, mode);
}

for (const mode of ["batch", "row", "drawer"]) test(mode + " save refuses a row that changes through the validation bound and allows a stable retry", async ({ page }, testInfo) => {
  await open(page, mode);
  await start(page, mode);
  for (let round = 1; round <= 5; round++) {
    await page.waitForFunction(round => rowChecks.length === round, round);
    await page.evaluate(round => {
      (window.changing ||= []).push(api.setCellValue("a", "name", "v" + (round + 1)));
      rowChecks[round - 1].resolve(null);
    }, round);
  }
  let result;
  if (mode === "drawer") await page.waitForFunction(() => writes.length ||
    [...document.querySelectorAll(".cx-drawer-summary")].some(summary => !summary.hidden));
  else result = await page.evaluate(() => saving);
  const observed = await page.evaluate(() => ({ writes, changes: api.getChanges(), stored: api.view.rows[0].cells.name,
    latestValidatorPending: typeof releaseLatest === "function", rowCalls }));
  await testInfo.attach(mode + "-validation-bound", { body: Buffer.from(JSON.stringify({ result, ...observed }, null, 2)), contentType: "application/json" });
  await testInfo.attach(mode + "-validation-state", { body: await page.screenshot(), contentType: "image/png" });
  expect(observed.latestValidatorPending).toBe(true);
  expect(observed.writes).toEqual([]);
  expect(observed.stored).toBe("Original");
  expect(observed.changes[0].values).toEqual({ name: "v6" });
  if (mode === "batch") expect(result).toMatchObject({ ok: false, saved: 0, failed: 1, rows: [{ status: "invalid" }] });
  else if (mode === "row") expect(result).toMatchObject({ ok: false, status: "invalid" });
  else {
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Edit Name", exact: true })).toHaveValue("v1");
    await expect(page.locator(".cx-drawer-summary")).toHaveText("Errors: 1");
  }
  await page.evaluate(() => { holdRows = false; releaseLatest("Latest value rejected."); });
  await expect.poll(() => page.evaluate(() => api.getChanges()[0].errors)).toEqual({ name: "Latest value rejected." });
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("Original");
  if (mode === "drawer") {
    await page.getByRole("textbox", { name: "Edit Name", exact: true }).fill("Approved");
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    await page.evaluate(() => api.setCellValue("a", "name", "Approved"));
    const retried = await page.evaluate(mode => mode === "batch" ? api.commitChanges() : api.commitRow("a"), mode);
    expect(retried.ok).toBe(true);
  }
  expect(await page.evaluate(() => api.getChanges())).toEqual([]);
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("Approved");
  expect(await page.evaluate(() => writes)).toEqual(mode === "batch" ? [] : [{ name: "Approved" }]);
});

test("a reloaded row must validate its new read-only fields before saving pending edits", async ({ page }) => {
  const hosted = { ...view, source: { kind: "host" } }; delete hosted.rows;
  await serveGrid(page, { view: hosted, script: `window.limit=1;window.writes=[];window.checked=[];
    CanopyX.configure('assets',{source:{query:q=>({protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'r'+limit,
      offset:q.offset,total:1,matched:1,items:[{id:'a',cells:{name:'Original',limit}}]})},editing:{drawer:'never',
      validators:{name:(value,row)=>{checked.push(row.cells.limit);return row.cells.limit===1?new Promise(resolve=>window.releaseOld=resolve):'Limit is closed.';}},
      commit:batch=>{writes.push(batch);return {protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,rows:[{id:'a',status:'saved'}]};}}});` });
  await page.evaluate(`window.api=${api};window.editing=api.setCellValue('a','name','Changed');window.saving=api.commitChanges();0`);
  await page.waitForFunction(() => typeof releaseOld === "function");
  await page.evaluate(async () => { limit = 0; await api.reload(); releaseOld(null); });
  const result = await page.evaluate(() => saving);
  expect(result).toMatchObject({ ok: false, saved: 0, failed: 1, rows: [{ status: "invalid", errors: { name: "Limit is closed." } }] });
  expect(await page.evaluate(() => checked)).toEqual([1, 0]);
  expect(await page.evaluate(() => writes)).toEqual([]);
  expect(await page.evaluate(() => api.getChanges()[0].values)).toEqual({ name: "Changed" });
});

test("the latest value can be saved unchanged after its pending validator succeeds", async ({ page }) => {
  await open(page);
  await start(page, "batch");
  for (let round = 1; round <= 5; round++) {
    await page.waitForFunction(round => rowChecks.length === round, round);
    await page.evaluate(round => {
      (window.changing ||= []).push(api.setCellValue("a", "name", "v" + (round + 1)));
      rowChecks[round - 1].resolve(null);
    }, round);
  }
  expect(await page.evaluate(() => saving)).toMatchObject({ ok: false, saved: 0, failed: 1 });
  await page.evaluate(async () => { holdRows = false; releaseLatest(null); await Promise.all(changing); });
  expect(await page.evaluate(() => api.getChanges()[0].values)).toEqual({ name: "v6" });
  expect(await page.evaluate(() => api.commitChanges())).toMatchObject({ ok: true, saved: 1, failed: 0 });
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("v6");
  expect(await page.evaluate(() => api.getChanges())).toEqual([]);
});

for (const ending of ["revert", "abort", "destroy"]) test(ending + " during a pending validation cannot save or revive discarded input", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    holdRows = false;
    window.controller = new AbortController();
    window.editing = api.setCellValue("a", "name", "v6");
    window.saving = api.commitChanges({ signal: controller.signal });
  });
  await page.waitForFunction(() => typeof releaseLatest === "function");
  await page.evaluate(ending => {
    if (ending === "revert") api.revertChanges();
    else if (ending === "abort") controller.abort();
    else api.destroy();
    releaseLatest(null);
  }, ending);
  const result = await page.evaluate(() => saving);
  expect(result.saved).toBe(0);
  expect(await page.evaluate(() => writes)).toEqual([]);
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("Original");
  if (ending === "revert") expect(await page.evaluate(() => api.getChanges())).toEqual([]);
  else expect(await page.evaluate(() => api.getChanges()[0].values)).toEqual({ name: "v6" });
  if (ending === "destroy") expect(await page.evaluate(() => rowCalls)).toEqual([]);
});

async function crossRows(page, scenario) {
  const data = { ...view, rows: [{ id: "a", cells: { name: "Original A", limit: 1 } }, { id: "b", cells: { name: "Original B", limit: 1 } }] };
  if (scenario === "reload") { data.source = { kind: "host" }; delete data.rows; }
  await serveGrid(page, { view: data, script: `window.writes=[];window.rowsChecked=[];window.holdA=false;window.denyA=false;
    window.serverRows=[{id:'a',cells:{name:'Original A',limit:1}},{id:'b',cells:{name:'Original B',limit:1}}];window.revision=1;
    CanopyX.configure('assets',{${scenario === "reload" ? `source:{query:q=>({protocol:'canopyx/2',type:'gridPage',view:q.view,revision:'r'+revision,
      offset:q.offset,total:2,matched:2,items:JSON.parse(JSON.stringify(serverRows))})},` : ""}
      editing:{drawer:'never',validators:{name:(value,row)=>{
        if(row.id==='b')return new Promise(resolve=>window.releaseB=resolve);
        if(value==='Unchecked'||holdA)return new Promise(resolve=>window.releaseA=resolve);
        return value==='Invalid'||denyA?'Denied new value.':row.cells.limit===0?'Limit is closed.':null;}},
      validateRow:(row,change)=>{rowsChecked.push({id:row.id,values:change.values,limit:row.cells.limit});return null;},
      commit:batch=>{writes.push(batch);return {protocol:'canopyx/2',type:'gridCommitResult',view:batch.view,rows:batch.rows.map(row=>({id:row.id,status:'saved'}))};}}});` });
  await page.evaluate(`window.api=${api}`);
  await page.evaluate(async scenario => {
    await api.setCellValue("a", "name", "Validated");
    window.editingB = api.setCellValue("b", "name", "Held B");
    window.operation = scenario === "validate" ? api.validate(["a", "b"]) : api.commitChanges();
  }, scenario);
  await page.waitForFunction(() => typeof releaseB === "function" && rowsChecked.some(row => row.id === "a"));
}

for (const scenario of ["pending", "invalid", "pending-same", "invalid-same", "reload", "replace", "validate"]) {
  test("cross-row " + scenario + " changes invalidate an earlier completed verdict before batch admission", async ({ page }) => {
    await crossRows(page, scenario);
    await page.evaluate(async scenario => {
      if (scenario === "pending" || scenario === "validate") window.editingA = api.setCellValue("a", "name", "Unchecked");
      else if (scenario === "invalid") await api.setCellValue("a", "name", "Invalid");
      else if (scenario === "pending-same") { holdA = true; window.rechecking = api.validate(["a"]); }
      else if (scenario === "invalid-same") { denyA = true; await api.validate(["a"]); }
      else if (scenario === "reload") { serverRows[0].cells.limit = 0; revision++; await api.reload(); }
      else { api.revertChanges(["a"]); await api.setCellValue("a", "name", "Validated"); }
      releaseB(null);
    }, scenario);
    const result = await page.evaluate(() => operation);
    if (scenario === "validate") {
      expect(result.valid).toBe(false);
      expect(result.rows.find(row => row.id === "a").valid).toBe(false);
      // The public copy exposes no private completion stamp or retained entry/row references.
      expect(result.rows.every(row => Reflect.ownKeys(row).every(key => ["id", "valid", "errors", "error"].includes(key)))).toBe(true);
      expect(await page.evaluate(() => writes)).toEqual([]);
    } else {
      expect(result).toMatchObject({ ok: false, saved: 1, failed: 1 });
      expect(result.rows.find(row => row.id === "a")).toMatchObject({ ok: false, status: "invalid" });
      expect(await page.evaluate(() => writes[0].rows.map(row => [row.id, row.values.name]))).toEqual([["b", "Held B"]]);
    }
    const expected = scenario === "pending" || scenario === "validate" ? "Unchecked" : scenario === "invalid" ? "Invalid" : "Validated";
    expect(await page.evaluate(() => api.getChanges().find(row => row.id === "a").values.name)).toBe(expected);
    if (scenario !== "reload") expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("Original A");
    if (scenario === "pending" || scenario === "pending-same" || scenario === "validate") await page.evaluate(() => releaseA(null));
  });
}

for (const ending of ["revert", "destroy"]) test("cross-row " + ending + " does not admit an obsolete completed entry", async ({ page }) => {
  await crossRows(page, ending);
  await page.evaluate(ending => { if (ending === "revert") api.revertChanges(["a"]); else api.destroy(); releaseB(null); }, ending);
  const result = await page.evaluate(() => operation);
  expect(result.saved).toBe(ending === "revert" ? 1 : 0);
  expect(await page.evaluate(() => writes.flatMap(batch => batch.rows.map(row => row.id)))).toEqual(ending === "revert" ? ["b"] : []);
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe("Original A");
});

for (const replace of [false, true]) test("row callbacks preserve admitted values when a newer draft " + (replace ? "replaces its entry" : "arrives before save adoption"), async ({ page }) => {
  await serveGrid(page, { view, script: `window.offered=[];CanopyX.configure('assets',{editing:{drawer:'never',validators:{
    name:value=>value==='Newer draft'?new Promise(resolve=>window.releaseDraft=resolve):null}},onRowCommit:detail=>{
      offered.push(detail.values.name);${replace ? "api.revertChanges(['a']);" : ""}
      window.drafting=api.setCellValue('a','name','Newer draft');return {status:'saved'};}});` });
  await page.evaluate(`window.api=${api}`);
  await page.evaluate(() => api.setCellValue("a", "name", "Admitted"));
  const result = await page.evaluate(() => api.commitRow("a"));
  expect(await page.evaluate(() => offered)).toEqual(["Admitted"]);
  expect(result.status).toBe(replace ? "superseded" : "saved");
  expect(await page.evaluate(() => api.view.rows[0].cells.name)).toBe(replace ? "Original" : "Admitted");
  expect(await page.evaluate(() => api.getChanges()[0])).toMatchObject({ values: { name: "Newer draft" }, original: { name: replace ? "Original" : "Admitted" } });
  await page.evaluate(() => releaseDraft("Newer draft rejected."));
  await expect.poll(() => page.evaluate(() => api.getChanges()[0].errors)).toEqual({ name: "Newer draft rejected." });
});

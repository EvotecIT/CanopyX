import { expect, test } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames, repo } from "./support.mjs";
const view = { protocol: "canopyx/2", type: "view", id: "integrity", label: "Integrity",
  columns: [{ id: "name", title: "Name", width: 500 }], source: { kind: "inline" }, roots: [] };
async function open(page, data = view, after = "") {
  const html = viewPage(data).replace("</body>", after + "</body>");
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}
test.beforeEach(({ page }) => { page.errors = []; page.on("pageerror", e => page.errors.push(e.message)); });
test.afterEach(({ page }) => expect(page.errors).toEqual([]));

for (const kind of ["remote", "sidecar"]) for (const nested of [false, true]) for (const badOffset of [0, 2]) {
  test(`${kind} rejects ${badOffset ? "skipped" : "repeated"} continuation offsets at ${nested ? "child" : "root"}`, async ({ page }) => {
    let attempts = 0;
    const parent = { id: "parent", label: "Parent", ref: "parent", hasChildren: true, expanded: true };
    const doc = (ref, cursor) => {
      if (nested && !ref) return { protocol: "canopyx/2", type: "page", parent: null, offset: 0, items: [parent], next: null };
      return { protocol: "canopyx/2", type: "page", parent: nested ? "parent" : null,
        offset: cursor ? (++attempts === 1 ? badOffset : 1) : 0,
        items: [{ id: cursor ? "second" : "first", label: cursor ? "Second" : "First" }], next: cursor ? null : "next" };
    };
    await page.route("https://canopyx.test/page?*", r => { const u = new URL(r.request().url()); return r.fulfill({ json: doc(u.searchParams.get("ref"), u.searchParams.get("cursor")) }); });
    await page.route("https://canopyx.test/data/**", r => {
      const ref = new URL(r.request().url()).pathname.slice(6, -3);
      const data = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : doc(ref === "r/0" ? "" : nested ? "parent" : "", ref === "next" ? "next" : "");
      return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, data])});` });
    });
    await open(page, { ...view, roots: undefined, source: kind === "remote" ? { kind, children: "/page?ref={ref}&cursor={cursor}" } : { kind, base: "/data/" } });
    await page.evaluate(async nested => { await document.querySelector(".cx-host").canopyx.loadMore(nested ? "parent" : null); }, nested);
    await expect(page.locator('[data-cx-status="error"]')).toContainText("offset");
    await expect(page.locator('[data-cx-id="first"]')).toHaveCount(1); await expect(page.locator('[data-cx-id="second"]')).toHaveCount(0);
    if (kind === "remote" && !nested && badOffset === 2) await page.screenshot({ path: path.join(repo, "artifacts/takeover/ninth-offset-error.png") });
    await page.evaluate(async nested => { await document.querySelector(".cx-host").canopyx.loadMore(nested ? "parent" : null); }, nested);
    await expect(page.locator('[data-cx-id="second"]')).toHaveCount(1); await expect(page.locator('[data-cx-status="error"]')).toHaveCount(0);
  });
}

for (const broken of ["initial offset", "inline count", "inline reference", "empty expandable children", "duplicate ID"]) {
  test(`page ${broken} is rejected before any items attach`, async ({ page }) => {
    await open(page);
    await page.evaluate(async ({ data, broken }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      const bad = broken === "inline count" ? { id: "bad", label: "Bad", childCount: 2, children: [{ id: "child", label: "Child" }] } :
        broken === "inline reference" ? { id: "bad", label: "Bad", ref: "extra", children: [{ id: "child", label: "Child" }] } :
          broken === "empty expandable children" ? { id: "bad", label: "Bad", hasChildren: true, children: [] } :
            { id: "good", label: "Duplicate" };
      window.integrityApi = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ({ offset: broken === "initial offset" ? 1 : 0,
        items: broken === "initial offset" ? [{ id: "good", label: "Good" }] : [{ id: "good", label: "Good" }, bad] }) } }); await integrityApi.ready;
    }, { data: view, broken });
    await expect(page.locator('[data-cx-status="error"]')).toHaveCount(1);
    expect(await page.evaluate(() => integrityApi.visibleRows().length)).toBe(0);
  });
}

test("plain custom pages may omit offset and valid inline counts are accepted", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ({ items: [{ id: "p", label: "Parent", childCount: 1, expanded: true,
      children: [{ id: "c", label: "Child" }] }] }) } }); await api.ready; return api.visibleRows().map(r => r.node.id);
  }, view); expect(result).toEqual(["p", "c"]);
});

test("direct initialization before DOMContentLoaded keeps one live grid and can remount after destroy", async ({ page }) => {
  const data = { ...view, roots: [{ id: "one", label: "One" }] };
  await open(page, data, `<script>const host=document.querySelector('.cx-host');window.readyEvents=0;host.addEventListener('canopyx:ready',()=>readyEvents++);
    window.first=CanopyX.createTreeGrid(host,{view:${JSON.stringify(data)}});window.second=CanopyX.createTreeGrid(host,{view:${JSON.stringify(data)}});</script>`);
  expect(await page.evaluate(() => first === second && document.querySelector('.cx-host').canopyx === first)).toBe(true);
  await expect(page.getByRole("treegrid")).toHaveCount(1); expect(await page.evaluate(() => readyEvents)).toBe(1);
  await page.evaluate(async () => { first.destroy(); window.third=CanopyX.mount(document)[0]; await third.ready; });
  await expect(page.getByRole("treegrid")).toHaveCount(1); expect(await page.evaluate(() => third !== first && readyEvents === 2)).toBe(true);
});

for (const key of ["__proto__", "constructor", "toString"]) {
  test(`counts preserve the own cell key ${key}`, async ({ page }) => {
    await open(page, { ...view, columns: [...view.columns, { id: key, title: "Value", width: 160 }], roots: [{ id: "one", label: "One", cells: { [key]: { value: "Before" } } }] });
    await page.evaluate(key => document.querySelector('.cx-host').canopyx.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "one", cells: { [key]: { value: "After" } } }] }), key);
    await expect(page.locator('[data-cx-id="one"]')).toContainText("After");
    expect(await page.evaluate(key => { const cells=document.querySelector('.cx-host').canopyx.visibleRows()[0].node.cells; return Object.hasOwn(cells,key) && cells[key].value === "After" && Object.getPrototypeOf(cells) !== cells[key]; }, key)).toBe(true);
    if (key === "__proto__") await page.screenshot({ path: path.join(repo, "artifacts/takeover/ninth-count-key.png") });
  });
}

test("resize separator exposes the supported range and clamps its maximum", async ({ page }) => {
  await open(page);
  const grip = page.getByRole("separator"); await expect(grip).toHaveAttribute("aria-valuemax", "2147483647");
  await expect(grip).toHaveAttribute("aria-valuemin", "40"); await expect(grip).toHaveAttribute("aria-valuenow", "500");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/ninth-resize-range.png") });
  await page.evaluate(async data => { const host=document.querySelector(".cx-host");host.canopyx.destroy();const api=CanopyX.createTreeGrid(host,{view:{...data,columns:[{id:"name",title:"Name",width:2147483647}]}});await api.ready; }, view);
  await grip.dispatchEvent("keydown", { key: "ArrowRight", bubbles: true });
  await expect(grip).toHaveAttribute("aria-valuenow", "2147483647");
  await grip.dispatchEvent("pointerdown", { button: 0, pointerId: 41, clientX: 100, bubbles: true });
  await page.evaluate(() => { window.dispatchEvent(new PointerEvent("pointermove", { pointerId:41,clientX:120 })); window.dispatchEvent(new PointerEvent("pointerup", { pointerId:41 })); });
  await expect(grip).toHaveAttribute("aria-valuenow", "2147483647");
});

for (const base of ["data?v=1", "data/#fragment"]) test(`sidecar rejects URL suffix in ${base}`, async ({ page }) => {
  await open(page);
  expect(await page.evaluate(base => { try { CanopyX.sources.sidecar({ ...document.querySelector('.cx-host').canopyx.view, source: { kind: "sidecar", base } }); return null; } catch(e) { return e.message; } }, base)).toContain("without a query or fragment");
});


test("counts reject inconsistent inline totals before changing any node", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "p", label: "Parent", children: [{ id: "c", label: "Child" }] }] });
  const result = await page.evaluate(() => {
    const api = document.querySelector('.cx-host').canopyx;
    let error; try { api.applyCounts({ protocol:"canopyx/2",type:"counts",items:[{id:"p",childCount:2}] }); } catch(e) { error=e.message; }
    return { error, count:api.visibleRows()[0].node.childCount };
  }); expect(result.error).toContain("inline childCount"); expect(result.count).toBeUndefined();
});

for (const kind of ["remote", "sidecar"]) {
  test(`${kind} rejects an empty expandable child list before attaching its page`, async ({ page }) => {
    const document = { protocol: "canopyx/2", type: "page", parent: null, offset: 0, next: null,
      items: [{ id: "bad", label: "Bad", hasChildren: true, children: [] }] };
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: document }));
    await page.route("https://canopyx.test/data/**", r => {
      const ref = new URL(r.request().url()).pathname.slice(6, -3);
      const data = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : document;
      return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, data])});` });
    });
    await open(page, { ...view, roots: undefined, source: kind === "remote" ?
      { kind, children: "/page?ref={ref}&cursor={cursor}" } : { kind, base: "/data/" } });
    await expect(page.locator('[data-cx-status="error"]')).toContainText("expandable inline children cannot be empty");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows().length)).toBe(0);
  });

  test(`${kind} rejects detail descendants before attaching the page`, async ({ page }) => {
    const document = { protocol: "canopyx/2", type: "page", parent: null, offset: 0, next: null,
      items: [{ id: "detail", label: "Detail", detail: { type: "html", html: "Info" },
        children: [{ id: "hidden", label: "Hidden" }] }] };
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: document }));
    await page.route("https://canopyx.test/data/**", r => {
      const ref = new URL(r.request().url()).pathname.slice(6, -3);
      const data = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : document;
      return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, data])});` });
    });
    await open(page, { ...view, roots: undefined, source: kind === "remote" ?
      { kind, children: "/page?ref={ref}&cursor={cursor}" } : { kind, base: "/data/" } });
    await expect(page.locator('[data-cx-status="error"]')).toContainText("detail row must be a leaf");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows().length)).toBe(0);
  });

  test(`${kind} rejects a page without its required next field`, async ({ page }) => {
    const document = { protocol: "canopyx/2", type: "page", parent: null, offset: 0,
      items: [{ id: "first", label: "First" }] };
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: document }));
    await page.route("https://canopyx.test/data/**", r => {
      const ref = new URL(r.request().url()).pathname.slice(6, -3);
      const data = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : document;
      return r.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, data])});` });
    });
    await open(page, { ...view, roots: undefined, source: kind === "remote" ?
      { kind, children: "/page?ref={ref}&cursor={cursor}" } : { kind, base: "/data/" } });
    await expect(page.locator('[data-cx-status="error"]')).toContainText("page continuation is required");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows().length)).toBe(0);
  });
}

for (const cells of ["bad", ["bad"]]) {
  test(`direct and remote counts reject ${typeof cells === "string" ? "string" : "array"} cells atomically`, async ({ page }) => {
    const data = { ...view, roots: [{ id: "one", label: "One", cells: { name: { text: "Before" } } }] };
    await open(page, data);
    const direct = await page.evaluate(cells => {
      const api = document.querySelector('.cx-host').canopyx;
      try { api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "one", cells }] }); return "accepted"; }
      catch (error) { return error.message; }
    }, cells);
    expect(direct).toContain("counts cells must be an object");
    await expect(page.locator('[data-cx-id="one"]')).toContainText("Before");
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "page", parent: null,
      offset: 0, items: data.roots, next: null } }));
    await page.route("https://canopyx.test/counts?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "counts", items: [{ id: "one", cells }] } }));
    await page.evaluate(async data => {
      const host = document.querySelector('.cx-host'); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: { ...data, roots: undefined,
        source: { kind: "remote", children: "/page?ref={ref}&cursor={cursor}", counts: "/counts?ids={ids}" } } });
      await api.ready;
    }, data);
    const remote = await page.evaluate(async () => {
      try { await document.querySelector('.cx-host').canopyx.refreshCounts(["one"]); return "accepted"; }
      catch (error) { return error.message; }
    });
    expect(remote).toContain("counts cells must be an object");
    await expect(page.locator('[data-cx-id="one"]')).toContainText("Before");
  });
}

test("unknown source kinds fail instead of presenting an empty inline grid", async ({ page }) => {
  await open(page);
  const error = await page.evaluate(data => {
    const host = document.querySelector('.cx-host'); host.canopyx.destroy();
    try { CanopyX.createTreeGrid(host, { view: { ...data, roots: undefined, source: { kind: "remtoe" } } }); return "accepted"; }
    catch (e) { return e.message; }
  }, view);
  expect(error).toContain("unknown source kind");
});

test("inline views reject lazy child declarations before attaching roots", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector('.cx-host'); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: { ...data, roots: [{ id: "parent", label: "Parent",
      hasChildren: true }] } });
    let error; try { await api.ready; } catch (e) { error = e.message; }
    return { error, rows: api.visibleRows().length };
  }, view);
  expect(result).toEqual({ error: "CanopyX: inline views cannot declare lazy children.", rows: 0 });
});

for (const flags of [null, "changed", [""]]) {
  test(`direct and remote counts reject malformed flags ${JSON.stringify(flags)}`, async ({ page }) => {
    const data = { ...view, roots: [{ id: "one", label: "One", flags: ["before"] }] };
    await open(page, data);
    const direct = await page.evaluate(flags => {
      const api = document.querySelector('.cx-host').canopyx;
      try { api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "one", flags }] }); return "accepted"; }
      catch (error) { return error.message; }
    }, flags);
    expect(direct).toContain("counts flags must be an array of nonempty strings");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows()[0].node.flags)).toEqual(["before"]);
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "page", parent: null,
      offset: 0, items: data.roots, next: null } }));
    await page.route("https://canopyx.test/counts?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "counts", items: [{ id: "one", flags }] } }));
    await page.evaluate(async data => {
      const host = document.querySelector('.cx-host'); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: { ...data, roots: undefined,
        source: { kind: "remote", children: "/page?ref={ref}&cursor={cursor}", counts: "/counts?ids={ids}" } } });
      await api.ready;
    }, data);
    const remote = await page.evaluate(async () => {
      try { await document.querySelector('.cx-host').canopyx.refreshCounts(["one"]); return "accepted"; }
      catch (error) { return error.message; }
    });
    expect(remote).toContain("counts flags must be an array of nonempty strings");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows()[0].node.flags)).toEqual(["before"]);
  });
}

for (const nested of [false, true]) {
  test(`an empty repeated continuation at ${nested ? "child" : "root"} becomes a retryable error`, async ({ page }) => {
    await open(page);
    await page.evaluate(async (nested) => {
      const host = document.querySelector('.cx-host'); const data = host.canopyx.view; host.canopyx.destroy();
      let attempts = 0;
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => {
        if (nested && !node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }], next: null };
        if (!cursor) return { items: [{ id: "first", label: "First" }], next: "same" };
        return ++attempts === 1 ? { items: [], next: "same" } :
          { items: [{ id: "second", label: "Second" }], next: null };
      } } }); await api.ready;
      if (nested) await api.expandPath(["parent"], { expandLast: true, select: false, focus: false });
      window.integrityApi = api;
    }, nested);
    await page.evaluate(async nested => integrityApi.loadMore(nested ? "parent" : null), nested);
    await expect(page.locator('[data-cx-status="error"]')).toContainText("page continuation did not advance");
    await expect(page.locator('[data-cx-id="first"]')).toHaveCount(1);
    await page.evaluate(async nested => integrityApi.loadMore(nested ? "parent" : null), nested);
    await expect(page.locator('[data-cx-id="second"]')).toHaveCount(1);
    await expect(page.locator('[data-cx-status="error"]')).toHaveCount(0);
  });
}

for (const flags of ["pred", [""]]) {
  test(`page nodes reject malformed flags ${JSON.stringify(flags)} before attachment`, async ({ page }) => {
    await open(page);
    const inline = await page.evaluate(async ({ data, flags }) => {
      const host = document.querySelector('.cx-host'); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: { ...data, roots: [{ id: "bad", label: "Bad", flags }] } });
      let error; try { await api.ready; } catch (e) { error = e.message; }
      return { error, rows: api.visibleRows().length };
    }, { data: view, flags });
    expect(inline).toEqual({ error: "CanopyX: node flags must be an array of nonempty strings.", rows: 0 });
    await page.route("https://canopyx.test/page?*", r => r.fulfill({ json: { protocol: "canopyx/2", type: "page",
      parent: null, offset: 0, next: null, items: [{ id: "bad", label: "Bad", flags }] } }));
    await page.evaluate(async data => {
      const host = document.querySelector('.cx-host'); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: { ...data, roots: undefined,
        source: { kind: "remote", children: "/page?ref={ref}&cursor={cursor}" } } }); await api.ready;
    }, view);
    await expect(page.locator('[data-cx-status="error"]')).toContainText("node flags must be an array of nonempty strings");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows().length)).toBe(0);
  });
}

for (const next of ["", 0]) {
  test(`custom pages reject malformed continuation ${JSON.stringify(next)} before attachment`, async ({ page }) => {
    await open(page);
    await page.evaluate(async ({ data, next }) => {
      const host = document.querySelector('.cx-host'); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () =>
        ({ items: [{ id: "first", label: "First" }], next }) } }); await api.ready;
    }, { data: view, next });
    await expect(page.locator('[data-cx-status="error"]')).toContainText("page continuation must be a nonempty");
    expect(await page.evaluate(() => document.querySelector('.cx-host').canopyx.visibleRows().length)).toBe(0);
  });
}

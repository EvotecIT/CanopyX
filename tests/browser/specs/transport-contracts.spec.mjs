import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";
const view = { protocol: "canopyx/1", type: "view", id: "transport", label: "Transport", columns: [{ id: "name", title: "Name", width: 350 }],
  source: { kind: "inline" }, roots: [] };
async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}
test.beforeEach(({ page }) => { page.runtimeErrors = []; page.on("pageerror", error => page.runtimeErrors.push(error.message)); });
test.afterEach(({ page }) => { expect(page.runtimeErrors).toEqual([]); });

for (const [key, query] of [["ab", "ab"], ["ab-", "ab"], ["_03bba", "λa"]]) {
  test(`sidecar search discovers every listed numbered part of ${key}`, async ({ page }) => {
    const keys = [key, ...Array.from({ length: 11 }, (_, i) => key + "." + (i + 2))];
    const shards = Object.fromEntries(keys.slice().reverse().map(k => [k, 1]));
    const docs = { manifest: { protocol: "canopyx/1", type: "manifest", view: view.id, root: "r/0", nodeCount: 12, pageSize: 100,
      search: { shards } }, "r/0": { protocol: "canopyx/1", type: "page", parent: null, offset: 0, next: null,
      items: keys.map((k, i) => ({ id: "id" + i, label: query })) } };
    keys.forEach((k, i) => { docs["s/" + k] = { protocol: "canopyx/1", type: "searchShard", key: k, entries: [{ path: ["id" + i], label: query }] }; });
    await page.route("https://canopyx.test/data/**", route => {
      const ref = new URL(route.request().url()).pathname.slice(6, -3);
      return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, docs[ref]])});` });
    });
    await open(page);
    const found = await page.evaluate(async ({ data, query }) => {
      const source = CanopyX.sources.sidecar({ ...data, source: { kind: "sidecar", base: "/data/" } });
      return source.search(query, 20);
    }, { data: view, query });
    expect(found.hits.map(hit => hit.path[0])).toEqual(keys.map((k, i) => "id" + i));
    expect(found.total).toBe(12); expect(found.truncated).toBe(false);
    if (key === "ab") {
      await page.evaluate(async data => {
        const host = document.querySelector(".cx-host"); host.canopyx.destroy();
        window.transportApi = CanopyX.createTreeGrid(host, { view: { ...data, roots: undefined, search: { minLength: 2, maxResults: 20, placeholder: "Search" },
          source: { kind: "sidecar", base: "/data/" } } }); await transportApi.ready;
      }, view);
      await page.getByRole("combobox", { name: "Search" }).fill("ab");
      await expect(page.locator(".cx-result")).toHaveCount(12);
      await page.screenshot({ path: path.join(repo, "artifacts/takeover/eighth-multipart-search.png") });
    }
  });
}

for (const target of ["node ID", "node reference", "continuation", "view ID"]) {
  test(`malformed ${target} fails before URI encoding`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, target }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      const broken = "broken\ud800";
      const invalid = { ...data, id: target === "view ID" ? broken : data.id, deepLink: true };
      let message;
      try {
        const api = CanopyX.createTreeGrid(host, { view: invalid, source: { page: async () => ({
          items: [{ id: target === "node ID" ? broken : "valid", label: "Node", ...(target === "node reference" ? { ref: broken, hasChildren: true } : {}) }]
        }) } }); await api.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (target === "continuation") {
          try { await CanopyX.sources.remote({ source: { kind: "remote", children: "/bad-page?ref={ref}&cursor={cursor}" } }).page(null, null); }
          catch (error) { message = error.message; }
        } else message = host.textContent;
      } catch (error) { message = error.message; }
      return message;
    }, { data: view, target });
    expect(result).toContain("well-formed Unicode"); expect(result).not.toContain("URIError");
    if (target === "node ID") await page.screenshot({ path: path.join(repo, "artifacts/takeover/eighth-invalid-node.png") });
  });
}
test.beforeEach(async ({ page }) => {
  await page.route("https://canopyx.test/bad-page?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "page", parent: null, offset: 0, next: "bad\ud800", items: [] } }));
});

test("supplementary Unicode IDs and references survive remote expansion and deep links", async ({ page }) => {
  const id = "node🌲", ref = "folder🌳", calls = [];
  await page.route("https://canopyx.test/tree?*", route => {
    const value = new URL(route.request().url()).searchParams.get("ref"); calls.push(value);
    return route.fulfill({ json: { protocol: "canopyx/1", type: "page", parent: value ? id : null, offset: 0, next: null,
      items: value ? [{ id: "leaf🌻", label: "Leaf" }] : [{ id, ref, label: "Tree", hasChildren: true }] } });
  });
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    window.transportApi = CanopyX.createTreeGrid(host, { view: { ...data, id: "view🌲", deepLink: true, roots: undefined,
      source: { kind: "remote", children: "/tree?ref={ref}&cursor={cursor}" } } });
    await transportApi.ready; await transportApi.expandPath(["node🌲", "leaf🌻"]);
  }, view);
  await nextFrames(page); expect(calls).toEqual(["", ref]);
  expect(await page.evaluate(() => transportApi.getSelected()[0].id)).toBe("leaf🌻");
  expect(decodeURIComponent(await page.evaluate(() => location.hash))).toContain("leaf🌻");
});

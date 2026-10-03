// Bundle packs (docs/data-protocol.md, "Packs"): many children pages share one file, and a node's reference names
// the pack and the page inside it. The pack files here are written by hand, the way a host that is not .NET would.
import { expect, test } from "@playwright/test";
import { openExample, row, viewPage, trackScriptLoads } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "packs", label: "Packs",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "sidecar", base: "/data/" } };
const push = (ref, body) => "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"packs\"," + JSON.stringify(ref) + "," + body + "]);\n";
const doc = (ref, document) => push(ref, JSON.stringify(document));
const pageOf = (parent, items, next = null) => ({ protocol: "canopyx/2", type: "page", parent, offset: 0, total: items.length, items, next });

/** Serves a bundle from a map of script paths to script text, and records the data files the page asks for. */
async function open(page, files) {
  const requested = [];
  await page.route("https://canopyx.test/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") return route.fulfill({ contentType: "text/html", body: viewPage(view) });
    requested.push(path);
    return path in files ? route.fulfill({ contentType: "text/javascript", body: files[path] }) : route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  return requested;
}

const roots = pageOf(null, [
  { id: "raw", label: "Raw template", hasChildren: true, ref: "p/0#0" },
  { id: "text", label: "Plain string", hasChildren: true, ref: "p/0#1" },
  { id: "file", label: "Own file", hasChildren: true, ref: "c/own#1" }
]);

test("a pack beyond the retained text budget still loads and is released between reads",async({page})=>{
  const childPage=pageOf("large",[{id:"large/child",label:"Child",data:{payload:"x".repeat(1100000)}}]);
  const requested=await open(page,{
    "/data/manifest.js":doc("manifest",{protocol:"canopyx/2",type:"manifest",view:"packs",root:"r/0",packs:1}),
    "/data/r/0.js":doc("r/0",pageOf(null,[])),
    "/data/p/0.js":doc("p/0",{protocol:"canopyx/2",type:"pack",pages:[JSON.stringify(childPage)]})
  });
  const result=await page.evaluate(async data=>{
    const source=CanopyX.sources.sidecar(data),node={id:"large",ref:"p/0#0"};
    const first=await source.page(node),second=await source.page(node);
    return [first.items[0].label,second.items[0].data.payload.length];
  },view);
  expect(result).toEqual(["Child",1100000]);
  expect(requested.filter(ref=>ref==="/data/p/0.js")).toHaveLength(2);
});

test("pack pages reject unmeasured objects even when the requested slot contains valid text",async({page})=>{
  await open(page,{
    "/data/manifest.js":doc("manifest",{protocol:"canopyx/2",type:"manifest",view:"packs",root:"r/0",packs:1}),
    "/data/r/0.js":doc("r/0",pageOf(null,[])),
    "/data/p/0.js":doc("p/0",{protocol:"canopyx/2",type:"pack",pages:[JSON.stringify(pageOf("safe",[])),{unexpected:"object"}]})
  });
  await expect(page.evaluate(data=>CanopyX.sources.sidecar(data).page({id:"safe",ref:"p/0#0"}),view))
    .rejects.toThrow("pack pages must be an array of strings");
});

test("packed pages load from one pack file, as String.raw templates or plain strings", async ({ page }) => {
  // What the C# writer emits: the page's JSON text in a template, with the backtick and ${ escaped inside it.
  const raw = "String.raw`" + JSON.stringify(pageOf("raw", [{ id: "raw/a", label: "tick ` dollar ${x} slash \\ quote \" é" }]))
    .replace(/`/g, "\\u0060").replace(/\$\{/g, "\\u0024{") + "`";
  const text = JSON.stringify(JSON.stringify(pageOf("text", [{ id: "text/a", label: "From a plain string" }])));
  const requested = await open(page, {
    "/data/manifest.js": doc("manifest", { protocol: "canopyx/2", type: "manifest", view: "packs", root: "r/0", nodeCount: 6, pageSize: 250, packs: 1 }),
    "/data/r/0.js": doc("r/0", roots),
    "/data/p/0.js": push("p/0", "{\"protocol\":\"canopyx/2\",\"type\":\"pack\",\"pages\":[" + raw + "," + text + "]}"),
    "/data/c/own#1.js": doc("c/own#1", pageOf("file", [{ id: "file/a", label: "From its own file" }]))
  });
  for (const id of ["raw", "text", "file"]) await row(page, id).locator(".cx-exp").click();
  await expect(row(page, "raw/a")).toHaveText("tick ` dollar ${x} slash \\ quote \" é");
  await expect(row(page, "text/a")).toHaveText("From a plain string");
  // A reference that is not p/<n>#<slot> stays a file of its own, # included.
  await expect(row(page, "file/a")).toHaveText("From its own file");
  expect(requested.filter((path) => path === "/data/p/0.js")).toHaveLength(1);
});

test("a reference outside the packs shows an error row instead of rows", async ({ page }) => {
  const bad = pageOf(null, [
    { id: "slot", label: "No such page", hasChildren: true, ref: "p/0#7" },
    { id: "pack", label: "No such pack", hasChildren: true, ref: "p/3#0" }
  ]);
  const requested = await open(page, {
    "/data/manifest.js": doc("manifest", { protocol: "canopyx/2", type: "manifest", view: "packs", root: "r/0", nodeCount: 2, pageSize: 250, packs: 1 }),
    "/data/r/0.js": doc("r/0", bad),
    "/data/p/0.js": doc("p/0", { protocol: "canopyx/2", type: "pack", pages: [JSON.stringify(pageOf("other", []))] })
  });
  await row(page, "slot").locator(".cx-exp").click();
  await expect(page.locator(".cx-row[data-cx-status=error]")).toContainText("no packed page p/0#7");
  await row(page, "pack").locator(".cx-exp").click();
  await expect(page.locator(".cx-row[data-cx-status=error]")).toHaveCount(2);
  // The manifest says there is one pack, so the runtime does not ask for a fourth.
  expect(requested).not.toContain("/data/p/3.js");
});

test("a pack that failed to load is asked for again on retry", async ({ page }) => {
  const files = {
    "/data/manifest.js": doc("manifest", { protocol: "canopyx/2", type: "manifest", view: "packs", root: "r/0", nodeCount: 2, pageSize: 250, packs: 1 }),
    "/data/r/0.js": doc("r/0", pageOf(null, [{ id: "raw", label: "Parent", hasChildren: true, ref: "p/0#0" }]))
  };
  const requested = await open(page, files);
  await row(page, "raw").locator(".cx-exp").click();
  const error = page.locator(".cx-row[data-cx-status=error]");
  await expect(error).toContainText("Sidecar file is missing: p/0");
  files["/data/p/0.js"] = doc("p/0", { protocol: "canopyx/2", type: "pack", pages: [JSON.stringify(pageOf("raw", [{ id: "raw/a", label: "Child" }]))] });
  await error.click();
  await expect(row(page, "raw/a")).toBeVisible();
  expect(requested.filter((path) => path === "/data/p/0.js")).toHaveLength(2);
});

test("without packs in the manifest, p/0#0 is an ordinary file reference", async ({ page }) => {
  const requested = await open(page, {
    "/data/manifest.js": doc("manifest", { protocol: "canopyx/2", type: "manifest", view: "packs", root: "r/0", nodeCount: 2, pageSize: 250 }),
    "/data/r/0.js": doc("r/0", pageOf(null, [{ id: "raw", label: "Parent", hasChildren: true, ref: "p/0#0" }])),
    "/data/p/0#0.js": doc("p/0#0", pageOf("raw", [{ id: "raw/a", label: "Child" }]))
  });
  await row(page, "raw").locator(".cx-exp").click();
  await expect(row(page, "raw/a")).toBeVisible();
  expect(requested).not.toContain("/data/p/0.js");
});

test("the written example bundle reads a small subtree from one pack", async ({ page }) => {
  const scriptLoads = await trackScriptLoads(page);
  await openExample(page, "bundle/index.html");
  const file = "share-a/d0/p0/f0";
  const open = (ids) => page.evaluate((path) => document.querySelector(".cx-host").canopyx.expandPath(path, { expandLast: true, select: false }), ids);
  await open(["share-a", "share-a/d0", "share-a/d0/p0"]);
  await scriptLoads();
  // A file, its history, and a version are three child lists. Their pages are written next to each other, so they
  // come from one pack (two if a pack happens to end between them), not from three files.
  await open(["share-a", "share-a/d0", "share-a/d0/p0", file, file + "/history", file + "/history/v1"]);
  const loaded = (await scriptLoads()).filter(url => /\/data\/.+\.js$/.test(url))
    .map(url => url.replace(/^.*\/data\/[^/]+\//, ""));
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.length).toBeLessThan(3);
  expect(loaded.every((name) => /^p\/\d+\.js$/.test(name))).toBe(true);
  // A version's table carries a backtick and ${ through the writer's template encoding.
  await expect(row(page, file + "/history/v1/changes")).toContainText("`share`/${team}/${year}");
});

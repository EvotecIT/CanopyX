// The parts a single-file page carries as their own style and script elements (CanopyHtmlPart.Markup, docs/plugins.md#parts):
// each case writes a page with the tree runtime, copies of the tabs part and the parts it requires, then checks which
// registration and stylesheet stay.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const parts = JSON.parse(asset("canopyx-parts.json")).parts;
const entries = Array.isArray(parts) ? parts : Object.values(parts);
const markup = (name, version) => {
  const part = entries.find(entry => entry.name === name), as = version || part.version;
  const script = version ? asset(part.script).replace('version:"' + part.version + '"', 'version:"' + version + '"') : asset(part.script);
  return (part.style ? `<style data-canopyx-part="${name}" data-cx-version="${as}">${asset(part.style)}</style>` : "") + `<script data-canopyx-part="${name}" data-cx-version="${as}">${script}</script>`;
};
const OTHER_BUILD = "0123456789abcdef";
/** The parts the tabs part requires, with theirs, each written once. */
const requirements = (name, seen = new Set()) => (entries.find(entry => entry.name === name).requires || [])
  .filter(required => !seen.has(required) && seen.add(required)).map(required => markup(required) + requirements(required, seen)).join("");
const tabs = id => `<div id="${id}" data-cx-tabs><div role="tablist" aria-label="Sections ${id}">
  <button id="${id}-a" role="tab" data-tab-id="a" aria-controls="${id}-pa" aria-selected="true">First</button>
  <button id="${id}-b" role="tab" data-tab-id="b" aria-controls="${id}-pb" aria-selected="false">Second ${id}</button></div>
  <section id="${id}-pa" role="tabpanel" aria-labelledby="${id}-a"><p>First content</p></section>
  <section id="${id}-pb" role="tabpanel" aria-labelledby="${id}-b"><p>Second content</p></section></div>`;
const VERSION = entries.find(entry => entry.name === "ui-tabs").version;
const tabsScript = asset(entries.find(entry => entry.name === "ui-tabs").script);

// head: the versions of the tabs style elements left in document.head; all: every tabs style element in the page; links: the
// tabs stylesheets linked from files; files: whether the tabs part came from its files. late: markup set through innerHTML
// after the first tabs are ready, then mounted. runtimeLast: the runtime script comes after every part, so they queue.
const CASES = [
  { name: "a part's stylesheet moves into the head as it registers, so removing its fragment keeps the rules",
    body: `<section id="carrier">${markup("ui-tabs")}</section>`, remove: "#carrier", head: [VERSION], all: 1, links: 0, files: false },
  { name: "a second copy of the same version removes its own stylesheet",
    body: `<section>${markup("ui-tabs")}</section><section>${markup("ui-tabs")}</section>`, head: [VERSION], all: 1, links: 0, files: false },
  { name: "a copy from another build after this build's does not replace it",
    body: `${markup("ui-tabs")}${markup("ui-tabs", OTHER_BUILD)}`, head: [VERSION], all: 1, links: 0, files: false },
  { name: "this build's copy after one from another build replaces it and its stylesheet",
    body: `${markup("ui-tabs", OTHER_BUILD)}${markup("ui-tabs")}`, head: [VERSION], all: 1, links: 0, files: false },
  { name: "a copy from another build alone is never applied, and the part loads from its files",
    body: markup("ui-tabs", OTHER_BUILD), head: [], all: 0, links: 1, files: true },
  { name: "a part whose script was preloaded without a stylesheet adopts the page's copy",
    body: `<script>${tabsScript}</script>${markup("ui-tabs")}`, head: [VERSION], all: 1, links: 0, files: false },
  { name: "copies set through innerHTML after the part installed are settled when the next view loads it",
    body: markup("ui-tabs"), late: markup("ui-tabs", OTHER_BUILD) + markup("ui-tabs"), head: [VERSION], all: 1, links: 0, files: false },
  { name: "both builds' copies queued before the runtime keep this build's stylesheet",
    body: `${markup("ui-tabs", OTHER_BUILD)}${markup("ui-tabs")}`, runtimeLast: true, head: [VERSION], all: 1, links: 0, files: false },
  { name: "a page copy set through innerHTML gives way to the stylesheet already linked from a file",
    body: "", late: markup("ui-tabs"), head: [], all: 0, links: 1, files: true },
  { name: "under a policy of hashes, a queued part keeps the copy the policy applied, not an earlier refused one",
    body: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}">/*refused*/.cx-tabs{outline:9px solid red}</style>${markup("ui-tabs")}`,
    runtimeLast: true, hashes: true, head: [VERSION], all: 1, links: 0, files: false }
];
/** A policy of the hashes of the page's inline scripts and styles, leaving out the styles marked refused. */
const hashPolicy = html => {
  const hash = text => "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'";
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>|<script data-canopyx-part[^>]*>([\s\S]*?)<\/script>/g)].map(match => hash(match[1] ?? match[2]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).filter(text => !text.startsWith("/*refused*/")).map(hash);
  return `default-src 'self'; script-src ${scripts.join(" ")}; style-src ${styles.join(" ")}`;
};

for (const { name, body, remove, late, runtimeLast, hashes, head, all, links, files } of CASES) test(name, async ({ page }) => {
  const runtime = `<script>${asset("canopyx.js")}</script>`;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("http://canopyx.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (file !== "parts") return route.fulfill({ path: path.join(repo, "CanopyX.Html/Assets", file) });
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parts</title><style>${asset("canopyx.css")}</style>${runtimeLast ? "" : runtime}</head>` +
      `<body class="cx-page"><main>${body}</main>${requirements("ui-tabs")}${runtimeLast ? runtime : ""}</body></html>`;
    return route.fulfill({ body: html, headers: { "content-type": "text/html; charset=utf-8", ...hashes ? { "content-security-policy": hashPolicy(html) } : {} } });
  });
  const requested = []; page.on("request", request => { if (/canopyx-ui-tabs/.test(request.url())) requested.push(request.url()); });
  await page.goto("http://canopyx.test/parts");
  if (remove) await page.locator(remove).evaluate(element => element.remove());
  for (const id of late ? ["first", "second"] : ["first"]) {
    if (id === "second") await page.locator("main").evaluate((main, late) => main.insertAdjacentHTML("beforeend", late), late);
    await page.locator("main").evaluate((main, markup) => main.insertAdjacentHTML("beforeend", markup), tabs(id));
    await page.evaluate(id => CanopyX.tabs("#" + id).ready, id);
    await page.getByRole("tab", { name: "Second " + id }).click();
    await expect(page.getByRole("tabpanel", { name: "Second " + id })).toBeVisible();
  }
  expect(await page.evaluate(() => ({
    head: [...document.head.querySelectorAll('style[data-canopyx-part="ui-tabs"]')].map(style => style.dataset.cxVersion),
    all: document.querySelectorAll('style[data-canopyx-part="ui-tabs"]').length,
    links: document.querySelectorAll('link[rel=stylesheet][data-canopyx-part="ui-tabs"]').length,
    // Every kept copy is one the browser applied.
    applied: [...document.head.querySelectorAll('style[data-canopyx-part="ui-tabs"]')].filter(style => style.sheet && !style.textContent.startsWith("/*refused*/")).length
  }))).toEqual({ head, all, links, applied: head.length });
  expect(requested.length > 0).toBe(files);
  expect(errors).toEqual([]);
});

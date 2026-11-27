// The parts a single-file page carries as their own style and script elements (CanopyHtmlPart.Markup, docs/plugins.md#parts):
// each case writes a page with the tree runtime, copies of the tabs part and the parts it requires, then checks which
// registration and stylesheet stay.
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
const tabs = `<div id="tabs" data-cx-tabs><div role="tablist" aria-label="Sections">
  <button id="t-a" role="tab" data-tab-id="a" aria-controls="p-a" aria-selected="true">First</button>
  <button id="t-b" role="tab" data-tab-id="b" aria-controls="p-b" aria-selected="false">Second</button></div>
  <section id="p-a" role="tabpanel" aria-labelledby="t-a"><p>First content</p></section>
  <section id="p-b" role="tabpanel" aria-labelledby="t-b"><p>Second content</p></section></div>`;

const CASES = [
  { name: "a part's stylesheet moves into the head as it registers, so removing its fragment keeps the rules",
    body: `<section id="carrier">${markup("ui-tabs")}</section>`, remove: "#carrier", sheets: 1 },
  { name: "a second copy of the same version removes its own stylesheet",
    body: `<section>${markup("ui-tabs")}</section><section>${markup("ui-tabs")}</section>`, sheets: 1 },
  { name: "a copy from another build after this build's does not replace it",
    body: `${markup("ui-tabs")}${markup("ui-tabs", OTHER_BUILD)}`, sheets: 1 },
  { name: "this build's copy after one from another build replaces it",
    body: `${markup("ui-tabs", OTHER_BUILD)}${markup("ui-tabs")}`, sheets: 1 }
];

for (const { name, body, remove, sheets } of CASES) test(name, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("http://canopyx.test/parts", route => route.fulfill({ contentType: "text/html", body:
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parts</title><style>${asset("canopyx.css")}</style><script>${asset("canopyx.js")}</script></head>` +
    `<body class="cx-page"><main>${body}</main>${requirements("ui-tabs")}</body></html>` }));
  // Nothing may come from a file: the page carries the part.
  const files = []; page.on("request", request => { if (/canopyx-ui-/.test(request.url())) files.push(request.url()); });
  await page.goto("http://canopyx.test/parts");
  if (remove) await page.locator(remove).evaluate(element => element.remove());
  const version = entries.find(entry => entry.name === "ui-tabs").version;
  const state = await page.evaluate(version => ({
    head: [...document.head.querySelectorAll('style[data-canopyx-part="ui-tabs"]')].map(style => style.dataset.cxVersion),
    all: document.querySelectorAll('style[data-canopyx-part="ui-tabs"]').length
  }), version);
  expect(state).toEqual({ head: [version], all: sheets });
  await page.locator("main").evaluate((main, tabs) => main.insertAdjacentHTML("beforeend", tabs), tabs);
  await page.evaluate(() => CanopyX.tabs("#tabs").ready);
  await page.getByRole("tab", { name: "Second" }).click();
  await expect(page.getByRole("tabpanel", { name: "Second" })).toBeVisible();
  expect(files).toEqual([]);
  expect(errors).toEqual([]);
});

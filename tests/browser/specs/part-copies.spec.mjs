// The part stylesheet lifecycle (docs/plugins.md#part-stylesheets), one row per transition. Each row writes a page with the
// tree runtime and the parts the tabs part requires, runs its steps, mounts tabs, and checks that exactly one stylesheet of
// the tabs part applies (style elements and linked files counted apart) and whether the part came from its files.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const parts = JSON.parse(asset("canopyx-parts.json")).parts;
const entries = Array.isArray(parts) ? parts : Object.values(parts);
const part = name => entries.find(entry => entry.name === name);
const VERSION = part("ui-tabs").version, OTHER_BUILD = "0123456789abcdef";
/** CanopyHtmlPart.Markup for a part, or for a copy from another build with a different version. */
const markup = (name, version) => {
  const entry = part(name), as = version || entry.version;
  const script = version ? asset(entry.script).replace('version:"' + entry.version + '"', 'version:"' + version + '"') : asset(entry.script);
  return (entry.style ? `<style data-canopyx-part="${name}" data-cx-version="${as}">${asset(entry.style)}</style>` : "") +
    `<script data-canopyx-part="${name}" data-cx-version="${as}">${script}</script>`;
};
/** The parts the tabs part requires, with theirs, each written once. */
const requirements = (name, seen = new Set()) => (part(name).requires || [])
  .filter(required => !seen.has(required) && seen.add(required)).map(required => markup(required) + requirements(required, seen)).join("");
const tabs = id => `<div id="${id}" data-cx-tabs><div role="tablist" aria-label="Sections ${id}">
  <button id="${id}-a" role="tab" data-tab-id="a" aria-controls="${id}-pa" aria-selected="true">First</button>
  <button id="${id}-b" role="tab" data-tab-id="b" aria-controls="${id}-pb" aria-selected="false">Second ${id}</button></div>
  <section id="${id}-pa" role="tabpanel" aria-labelledby="${id}-a"><p>First content</p></section>
  <section id="${id}-pb" role="tabpanel" aria-labelledby="${id}-b"><p>Second content</p></section></div>`;
// A declaration only the tabs stylesheet has: a sheet holding it is a stylesheet of the tabs part.
const MARKER = "--cx-tabs-motion-duration-fast";
/** A policy of the hashes of the page's inline scripts and styles, leaving out styles marked refused. */
const hashPolicy = html => {
  const hash = text => "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'";
  const scripts = [...html.matchAll(/<script(?: data-canopyx-part[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => hash(match[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).filter(text => !text.startsWith("/*refused*/")).map(hash);
  return `default-src 'self'; script-src ${scripts.join(" ")}; style-src ${styles.join(" ")}`;
};

// Steps: ["parsed", markup, key] inserts through createContextualFragment and keeps its nodes under the key; ["html", markup]
// sets it through insertAdjacentHTML (its scripts never run); ["remove", key] removes those nodes by reference; ["reinsert",
// key] appends them again; ["replace", markup] replaces main's content through innerHTML; ["remove-element", selector];
// ["mount", id] inserts and mounts tabs; ["mount-fails", id] expects the mount to fail; ["destroy", id] destroys a mounted
// tabs controller and removes it; ["clear-head"] removes the style elements of parts in the head.
// page: the part markup the page is written with; runtimeLast queues every part before the runtime; hashes serves a policy
// of hashes; cssMissing answers the tabs stylesheet file with 404.
const ROWS = [
  { transition: "register with its own stylesheet", page: markup("ui-tabs"), steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "move to the head, then the carrying element is removed", page: `<section id="carrier">${markup("ui-tabs")}</section>`,
    steps: [["remove-element", "#carrier"], ["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "a second copy whose script runs", page: markup("ui-tabs") + markup("ui-tabs"), steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "a host inserts a fragment by parsing after install", page: markup("ui-tabs"),
    steps: [["mount", "a"], ["parsed", markup("ui-tabs"), "late"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host inserts a fragment through innerHTML after install", page: markup("ui-tabs"),
    steps: [["mount", "a"], ["html", markup("ui-tabs")], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host removes the carrying fragment's nodes by reference", page: "",
    steps: [["parsed", markup("ui-tabs"), "carrier"], ["mount", "a"], ["remove", "carrier"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host replaces its content through innerHTML", page: markup("ui-tabs"),
    steps: [["mount", "a"], ["replace", markup("ui-tabs")], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host re-inserts nodes it removed", page: "",
    steps: [["parsed", markup("ui-tabs"), "carrier"], ["mount", "a"], ["remove", "carrier"], ["reinsert", "carrier"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a script preloaded without its stylesheet", page: `<script>${asset(part("ui-tabs").script)}</script>${markup("ui-tabs")}`,
    steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "two builds: another build's copy first, queued before the runtime", page: markup("ui-tabs", OTHER_BUILD) + markup("ui-tabs"), runtimeLast: true,
    steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "two builds: another build's copy first, runtime first", page: markup("ui-tabs", OTHER_BUILD) + markup("ui-tabs"),
    steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "two builds: another build's copy after this build's", page: markup("ui-tabs") + markup("ui-tabs", OTHER_BUILD),
    steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "two builds: only another build's copy, so the files load", page: markup("ui-tabs", OTHER_BUILD),
    steps: [["mount", "a"]], styles: 0, links: 1, files: true },
  { transition: "loaded from files, then a copy arrives through innerHTML", page: "",
    steps: [["mount", "a"], ["html", markup("ui-tabs")], ["mount", "b"]], styles: 0, links: 1, files: true },
  { transition: "the stylesheet file fails, then a fragment brings the stylesheet", page: "", cssMissing: true,
    steps: [["mount-fails", "a"], ["parsed", markup("ui-tabs"), "late"], ["mount", "b"]], styles: 1, links: 0, files: true },
  { transition: "a policy refused an earlier look-alike, parts queued before the runtime",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}">/*refused*/.cx-tabs{outline:9px solid red}</style>${markup("ui-tabs")}`,
    runtimeLast: true, hashes: true, steps: [["mount", "a"]], styles: 1, links: 0, files: false },
  { transition: "the kept stylesheet leaves the page, so the file loads again", page: markup("ui-tabs"),
    steps: [["mount", "a"], ["clear-head"], ["mount", "b"]], styles: 0, links: 1, files: true },
  { transition: "teardown: a destroyed view leaves the stylesheet for later views", page: markup("ui-tabs"),
    steps: [["mount", "a"], ["destroy", "a"], ["mount", "b"]], styles: 1, links: 0, files: false }
];

for (const { transition, page: carried, steps, runtimeLast, hashes, cssMissing, styles, links, files } of ROWS) test(transition, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const runtime = `<script>${asset("canopyx.js")}</script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parts</title><style>${asset("canopyx.css")}</style>${runtimeLast ? "" : runtime}</head>` +
    `<body class="cx-page"><main>${carried}</main>${requirements("ui-tabs")}${runtimeLast ? runtime : ""}</body></html>`;
  const requested = [];
  await page.route("http://canopyx.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (file !== "parts") {
      if (file.startsWith("canopyx-ui-tabs")) requested.push(file);
      return cssMissing && file === "canopyx-ui-tabs.css" ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ path: path.join(repo, "CanopyX.Html/Assets", file) });
    }
    return route.fulfill({ body: html, headers: { "content-type": "text/html; charset=utf-8", ...hashes ? { "content-security-policy": hashPolicy(html) } : {} } });
  });
  await page.goto("http://canopyx.test/parts");
  for (const [step, value, key] of steps) {
    if (step === "mount" || step === "mount-fails") {
      await page.locator("main").evaluate((main, markup) => main.insertAdjacentHTML("beforeend", markup), tabs(value));
      const result = await page.evaluate(id => CanopyX.tabs("#" + id).ready.then(() => "ready", error => error.message), value);
      if (step === "mount-fails") { expect(result).toContain("unavailable"); continue; }
      expect(result).toBe("ready");
      await page.getByRole("tab", { name: "Second " + value }).click();
      await expect(page.getByRole("tabpanel", { name: "Second " + value })).toBeVisible();
    } else await page.evaluate(({ step, value, key }) => {
      const main = document.querySelector("main"), kept = window.kept ||= {};
      if (step === "parsed") { const fragment = document.createRange().createContextualFragment(value); kept[key] = [...fragment.childNodes]; main.append(fragment); }
      else if (step === "html") main.insertAdjacentHTML("beforeend", value);
      else if (step === "remove") kept[value].forEach(node => node.remove());
      else if (step === "reinsert") main.append(...kept[value]);
      else if (step === "replace") main.innerHTML = value;
      else if (step === "remove-element") document.querySelector(value).remove();
      else if (step === "clear-head") document.head.querySelectorAll("style[data-canopyx-part]").forEach(style => style.remove());
      else if (step === "destroy") { CanopyX.tabs("#" + value).destroy(); document.getElementById(value).remove(); }
    }, { step, value, key });
  }
  const state = await page.evaluate(marker => {
    // A grouping rule (@layer, @media) serializes the rules inside it too.
    const holds = rules => [...rules].some(rule => rule.cssText.includes(marker));
    return {
      styles: document.querySelectorAll('style[data-canopyx-part="ui-tabs"]').length,
      links: document.querySelectorAll('link[rel=stylesheet][data-canopyx-part="ui-tabs"]').length,
      // Exactly one sheet of the tabs part applies, whichever element holds it.
      applied: [...document.styleSheets].filter(sheet => !sheet.disabled && holds(sheet.cssRules)).length
    };
  }, MARKER);
  expect(state).toEqual({ styles, links, applied: 1 });
  expect(requested.length > 0).toBe(files);
  expect(errors).toEqual([]);
});

// The part stylesheet lifecycle (docs/plugins.md#part-stylesheets), one row per transition. Each row writes a page with the
// tree runtime and the parts the tabs part requires, runs its steps, and checks that exactly one stylesheet of the tabs part,
// and of the picker part it requires, applies; how many of the tabs part's applying style elements and linked files are in
// the page; and whether the tabs part came from its files. The page's own copies are templates (media="not all"). applied is
// how many tabs stylesheets apply when it is not one.
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
  return (entry.style ? `<style data-canopyx-part="${name}" data-cx-version="${as}" media="not all" data-canopyx-template>${asset(entry.style)}</style>` : "") +
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
// Text only the tabs stylesheet, and only the picker stylesheet, holds: a sheet holding it is a stylesheet of that part.
const MARKERS = { tabs: "--cx-tabs-motion-duration-fast", picker: ".cx-picker-trigger" };
/** A policy of the hashes of the page's inline scripts and styles, leaving out styles marked refused. */
const hashPolicy = html => {
  const hash = text => "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'";
  const scripts = [...html.matchAll(/<script(?: data-canopyx-part[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => hash(match[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).filter(text => !text.startsWith("/*refused*/")).map(hash);
  return `default-src 'self'; script-src 'self' ${scripts.join(" ")}; style-src 'self' ${styles.join(" ")}`;
};

// Steps: ["parsed", markup, key] inserts through createContextualFragment and keeps its nodes under the key; ["html", markup]
// sets it through insertAdjacentHTML (its scripts never run); ["remove", key] removes those nodes by reference; ["reinsert",
// key] appends them again; ["replace", markup] replaces main's content through innerHTML; ["remove-element", selector];
// ["mount", id] inserts and mounts tabs; ["mount-fails", id] expects the mount to fail; ["mount-pair-fails", id] mounts two
// tabs at once and expects both to fail; ["destroy", id] destroys a mounted tabs controller and removes it; ["clear-head"]
// removes the applying part stylesheets in the head; ["clear-templates"] removes the page's templates; ["css-ok"] serves the
// stylesheet file again; ["head-reparse"] rewrites the head through innerHTML, which recreates its links; ["take-link", key]
// removes the tabs link and keeps it; ["reinsert-link", key] puts it back; ["mount-detached", id] starts a mount, removes its
// pending link, then mounts the next id: both get the replacement; ["host-link"] adds a host's marked stylesheet;
// ["mount-host-takes-over", id] adds one while the runtime's link is held and mounts again; ["mount-host-rescues", id] adds one
// while the only mount waits; ["host-print"] gives the host's marked stylesheet media="print"; ["host-off"] gives the host's
// marked style media="not all"; ["host-cssom-off"] sets it through the CSSOM; ["host-style", name] adds a host's marked style
// with the tabs rules; ["css-missing"] answers the stylesheet file with 404 from then on. Disabling the runtime's own stylesheet or changing its media is outside the contract.
// page: the part markup the page is written with; runtimeLast queues every part before the runtime; hashes serves a policy
// of hashes with 'self'; cssMissing answers the tabs stylesheet file with 404; holdCss holds the first stylesheet request.
const TABS_CSS = asset(part("ui-tabs").style), TABS = markup("ui-tabs"), FILES = { styles: 0, links: 1, files: true }, PAGE = { styles: 1, links: 0, files: false };
const ROWS = [
  { transition: "register: the runtime applies one copy of the template", page: TABS, steps: [["mount", "a"]], ...PAGE },
  { transition: "the element that carried the template is removed", page: `<section id="carrier">${TABS}</section>`,
    steps: [["mount", "a"], ["remove-element", "#carrier"], ["mount", "b"]], ...PAGE },
  { transition: "a second copy whose script runs", page: TABS + TABS, steps: [["mount", "a"]], ...PAGE },
  { transition: "a host inserts a fragment by parsing after install", page: TABS, steps: [["mount", "a"], ["parsed", TABS, "late"], ["mount", "b"]], ...PAGE },
  { transition: "a host inserts a fragment through innerHTML after install", page: TABS, steps: [["mount", "a"], ["html", TABS], ["mount", "b"]], ...PAGE },
  { transition: "a host removes the carrying fragment's nodes by reference", page: "",
    steps: [["parsed", TABS, "carrier"], ["mount", "a"], ["remove", "carrier"], ["mount", "b"]], ...PAGE },
  { transition: "a host replaces its content through innerHTML", page: TABS, steps: [["mount", "a"], ["replace", TABS], ["mount", "b"]], ...PAGE },
  { transition: "a host re-inserts nodes it removed", page: "",
    steps: [["parsed", TABS, "carrier"], ["mount", "a"], ["remove", "carrier"], ["reinsert", "carrier"], ["mount", "b"]], ...PAGE },
  { transition: "a script preloaded with a template", page: `<script>${asset(part("ui-tabs").script)}</script>${TABS}`, steps: [["mount", "a"]], ...PAGE },
  { transition: "a host preload without a stylesheet: the host provides it, the runtime adds none", page: `<script>${asset(part("ui-tabs").script)}</script>`,
    steps: [["mount", "a"]], styles: 0, links: 0, files: false, applied: 0 },
  { transition: "a host preload with its own stylesheet link: the runtime adds none",
    page: `<link rel="stylesheet" href="/canopyx-ui-tabs.css"><script>${asset(part("ui-tabs").script)}</script>`, steps: [["mount", "a"]], styles: 0, links: 0, files: true },
  { transition: "a host's marked stylesheet is the part's stylesheet and is never removed",
    page: `<link rel="stylesheet" href="/canopyx-ui-tabs.css" data-canopyx-part="ui-tabs" data-cx-version="${VERSION}"><script>${asset(part("ui-tabs").script)}</script>${TABS}`,
    steps: [["mount", "a"], ["html", TABS], ["mount", "b"]], styles: 0, links: 1, files: true },
  { transition: "a part imported beside the module runtime is a host preload", page: "", module: true, steps: [["mount", "a"]], styles: 0, links: 0, files: false, applied: 0 },
  { transition: "a part the page carries beside the module runtime applies its template", page: TABS, module: true, steps: [["mount", "a"]], ...PAGE },
  { transition: "two builds: another build's copy first, queued before the runtime", page: markup("ui-tabs", OTHER_BUILD) + TABS, runtimeLast: true,
    steps: [["mount", "a"]], ...PAGE },
  { transition: "two builds: another build's copy first, runtime first", page: markup("ui-tabs", OTHER_BUILD) + TABS, steps: [["mount", "a"]], ...PAGE },
  { transition: "two builds: another build's copy after this build's", page: TABS + markup("ui-tabs", OTHER_BUILD), steps: [["mount", "a"]], ...PAGE },
  { transition: "two builds: only another build's copy, so the files load", page: markup("ui-tabs", OTHER_BUILD), steps: [["mount", "a"]], ...FILES },
  { transition: "loaded from files, then a copy arrives through innerHTML", page: "", steps: [["mount", "a"], ["html", TABS], ["mount", "b"]], ...FILES },
  { transition: "the stylesheet file fails, then a fragment brings the template", page: "", cssMissing: true,
    steps: [["mount-fails", "a"], ["parsed", TABS, "late"], ["mount", "b"]], styles: 1, links: 0, files: true },
  { transition: "two mounts share one failed file load, and a later mount loads it", page: "", cssMissing: true,
    steps: [["mount-pair-fails", "a"], ["css-ok"], ["mount", "c"]], ...FILES },
  { transition: "a policy refused an earlier look-alike, parts queued before the runtime",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" media="not all" data-canopyx-template>/*refused*/.cx-tabs{outline:9px solid red}</style>${TABS}`,
    runtimeLast: true, hashes: true, steps: [["mount", "a"]], ...PAGE },
  { transition: "a policy refused the only template, so the file loads",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" media="not all" data-canopyx-template>/*refused*/${asset(part("ui-tabs").style)}</style><script data-canopyx-part="ui-tabs" data-cx-version="${VERSION}">${asset(part("ui-tabs").script)}</script>`,
    hashes: true, steps: [["mount", "a"]], ...FILES },
  { transition: "the applied stylesheet leaves the head, so a template applies again", page: TABS,
    steps: [["mount", "a"], ["clear-head"], ["mount", "b"]], ...PAGE },
  { transition: "the stylesheet and every template leave, so the runtime's kept copy applies again", page: TABS,
    steps: [["mount", "a"], ["clear-templates"], ["clear-head"], ["mount", "b"]], ...PAGE },
  { transition: "the head is rewritten through innerHTML, recreating the link", page: "",
    steps: [["mount", "a"], ["head-reparse"], ["mount", "b"]], ...FILES },
  { transition: "the link is removed, replaced, then the old one put back", page: "",
    steps: [["mount", "a"], ["take-link", "old"], ["mount", "b"], ["reinsert-link", "old"], ["mount", "c"]], ...FILES },
  { transition: "a pending link is removed, and the next mount's replacement serves both mounts", page: "", holdCss: true,
    steps: [["mount-detached", "a"]], ...FILES },
  { transition: "a host's marked stylesheet added after the runtime's copy takes over", page: TABS,
    steps: [["mount", "a"], ["host-link"], ["mount", "b"]], styles: 0, links: 1, files: true },
  { transition: "a host's marked stylesheet takes over while the runtime's link still loads", page: "", holdCss: true,
    steps: [["mount-host-takes-over", "a"]], styles: 0, links: 1, files: true },
  { transition: "an inert older fragment beside a host preload adds no stylesheet",
    page: `<link rel="stylesheet" href="/canopyx-ui-tabs.css"><script>${asset(part("ui-tabs").script)}</script>`,
    steps: [["mount", "a"], ["html", markup("ui-tabs", OTHER_BUILD)], ["mount", "b"]], styles: 0, links: 0, files: true },
  { transition: "a part loaded from its file loses its link and has no template, so the file loads again", page: "",
    steps: [["mount", "a"], ["take-link", "gone"], ["mount", "b"]], ...FILES },
  { transition: "code from its file keeps waiting for its stylesheet on retries", page: "", cssMissing: true,
    steps: [["mount-fails", "a"], ["mount-fails", "b"], ["css-ok"], ["mount", "c"]], ...FILES },
  { transition: "a host's marked stylesheet rescues the only mount waiting on a link that then fails", page: "", holdCss: true, cssMissing: true,
    steps: [["mount-host-rescues", "a"]], styles: 0, links: 1, files: true },
  { transition: "a host's marked stylesheet given a media that does not match yields to the runtime's",
    page: `<link rel="stylesheet" href="/canopyx-ui-tabs.css" data-canopyx-part="ui-tabs" data-cx-version="${VERSION}">${TABS}`,
    steps: [["mount", "a"], ["host-print"], ["mount", "b"]], styles: 1, links: 1, files: true },
  { transition: "a page part whose fragment was removed before the runtime started keeps its origin, so the file loads", runtimeLast: true,
    page: `<section id="gone">${TABS}</section><script>document.getElementById("gone").remove()</script>`, steps: [["mount", "a"]], ...FILES },
  { transition: "a host preload beside an inert part marker stays a host preload", runtimeLast: true,
    page: `<link rel="stylesheet" href="/canopyx-ui-tabs.css"><script>${asset(part("ui-tabs").script)}</script><script type="text/plain" data-canopyx-part="ui-tabs" data-cx-version="${VERSION}"></script>`,
    steps: [["mount", "a"]], styles: 0, links: 0, files: true },
  { transition: "a host's marked style given media=\"not all\" stays inactive and the runtime's copy applies",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" id="host-style">${asset(part("ui-tabs").style)}</style>${TABS}`,
    steps: [["mount", "a"], ["host-off"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host's stylesheet takes over after the fragment is gone, then stops applying: the runtime's copy returns", cssMissing: true,
    page: `<section id="carrier">${TABS}</section>`,
    steps: [["mount", "a"], ["remove-element", "#carrier"], ["host-link"], ["mount", "b"], ["host-print"], ["mount", "c"]], styles: 1, links: 1, files: true },
  { transition: "a host replaces its marked stylesheet, then removes the replacement: the runtime's copy returns, not the first host's", cssMissing: true,
    page: `<section id="carrier">${TABS}</section>`,
    steps: [["mount", "a"], ["remove-element", "#carrier"], ["host-style", "first", TABS_CSS], ["mount", "b"], ["host-style", "second", TABS_CSS], ["remove-element", "#host-first"],
      ["mount", "c"], ["remove-element", "#host-second"], ["mount", "d"]], styles: 1, links: 0, files: false },
  { transition: "a host's marked style whose CSSOM media stops matching yields to the runtime's copy",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" id="host-style">${asset(part("ui-tabs").style)}</style>${TABS}`,
    steps: [["mount", "a"], ["host-cssom-off"], ["mount", "b"]], styles: 2, links: 0, files: false },
  { transition: "a single file loses its carrier and the runtime's copy: the kept copy applies again without a file", cssMissing: true,
    page: `<section id="carrier">${TABS}</section>`, steps: [["mount", "a"], ["remove-element", "#carrier"], ["clear-head"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "an unselected alternate host stylesheet is not the part's stylesheet",
    page: `<link rel="alternate stylesheet" title="Other" href="/canopyx-ui-tabs.css" data-canopyx-part="ui-tabs" data-cx-version="${VERSION}">${TABS}`,
    steps: [["mount", "a"]], styles: 1, links: 0, files: true },
  { transition: "a host's stylesheet used from the start stops after its carrier is gone: the kept template copy applies without a file", cssMissing: true,
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" id="host-style">${TABS_CSS}</style><section id="carrier">${TABS}</section>`,
    steps: [["mount", "a"], ["remove-element", "#carrier"], ["host-off"], ["mount", "b"]], styles: 1, links: 0, files: false },
  { transition: "a host's stylesheet retagged for another build is no longer the part's stylesheet",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" id="host-style">${TABS_CSS}</style>${TABS}`,
    steps: [["mount", "a"], ["host-retag"], ["mount", "b"]], styles: 2, links: 0, files: false, applied: 2 },
  { transition: "a titled host stylesheet belongs to a stylesheet set and is not the part's stylesheet",
    page: `<style data-canopyx-part="ui-tabs" data-cx-version="${VERSION}" title="Set" id="host-style">${TABS_CSS}</style>${TABS}`,
    steps: [["mount", "a"]], styles: 2, links: 0, files: false, applied: 2 },
  { transition: "a host's stylesheet takes over from a loaded file and stops: the loaded file applies again without a request", page: "",
    steps: [["mount", "a"], ["host-link"], ["mount", "b"], ["host-print"], ["css-missing"], ["mount", "c"]], styles: 0, links: 2, files: true },
  { transition: "teardown: a destroyed view leaves the stylesheet for later views", page: TABS,
    steps: [["mount", "a"], ["destroy", "a"], ["mount", "b"]], ...PAGE }
];

for (const { transition, page: carried, steps, runtimeLast, module, hashes, cssMissing, holdCss, styles, links, files, applied = 1 } of ROWS) test(transition, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  // With module, the runtime is the ES module and, without page markup, the host imports the tabs part file beside it.
  const runtime = module ? `<script type="module" src="/canopyx-module.mjs"></script>${carried ? "" : '<script type="module" src="/canopyx-ui-tabs.js"></script>'}` : `<script>${asset("canopyx.js")}</script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parts</title><style>${asset("canopyx.css")}</style>${runtimeLast || module ? "" : runtime}</head>` +
    `<body class="cx-page"><main>${carried}</main>${requirements("ui-tabs")}${runtimeLast || module ? runtime : ""}</body></html>`;
  const requested = [];
  let missing = cssMissing, release, held = holdCss;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("http://canopyx.test/**", async route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (file !== "parts") {
      if (file.startsWith("canopyx-ui-tabs")) requested.push(file);
      if (file === "canopyx-ui-tabs.css" && held) { held = false; await gate; }
      return missing && file === "canopyx-ui-tabs.css" && !route.request().url().includes("?host") ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ path: path.join(repo, "CanopyX.Html/Assets", file) });
    }
    return route.fulfill({ body: html, headers: { "content-type": "text/html; charset=utf-8", ...hashes ? { "content-security-policy": hashPolicy(html) } : {} } });
  });
  await page.goto("http://canopyx.test/parts");
  await page.waitForFunction(() => window.CanopyX?.tabs);
  const insertTabs = id => page.locator("main").evaluate((main, markup) => main.insertAdjacentHTML("beforeend", markup), tabs(id));
  const mount = id => page.evaluate(id => CanopyX.tabs("#" + id).ready.then(() => "ready", error => error.message), id);
  const works = async id => {
    await page.getByRole("tab", { name: "Second " + id }).click();
    await expect(page.getByRole("tabpanel", { name: "Second " + id })).toBeVisible();
  };
  for (const [step, value, key] of steps) {
    if (step === "mount" || step === "mount-fails") {
      await insertTabs(value);
      const result = await mount(value);
      if (step === "mount-fails") { expect(result).toContain("unavailable"); continue; }
      expect(result).toBe("ready");
      await works(value);
    } else if (step === "mount-pair-fails") {
      await insertTabs(value); await insertTabs(value + "2");
      expect(await Promise.all([mount(value), mount(value + "2")])).toEqual([expect.stringContaining("unavailable"), expect.stringContaining("unavailable")]);
    } else if (step === "css-ok") missing = false;
    else if (step === "css-missing") missing = true;
    else if (step === "host-link") {
      await page.evaluate(version => new Promise(resolve => {
        const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/canopyx-ui-tabs.css?host", onload: resolve });
        Object.assign(link.dataset, { canopyxPart: "ui-tabs", cxVersion: version }); document.head.append(link);
      }), VERSION);
    } else if (step === "mount-host-rescues") {
      // One mount waits on the runtime's held link; a host's marked stylesheet arrives and the link is released (and fails):
      // the mount takes the host's stylesheet.
      await insertTabs(value);
      await page.evaluate(id => { window.first = CanopyX.tabs("#" + id).ready.then(() => "ready", error => error.message); }, value);
      await page.waitForSelector('link[data-canopyx-part="ui-tabs"][data-canopyx-owned]', { state: "attached" });
      await page.evaluate(version => new Promise(resolve => {
        const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/canopyx-ui-tabs.css?host", onload: resolve });
        Object.assign(link.dataset, { canopyxPart: "ui-tabs", cxVersion: version }); document.head.append(link);
      }), VERSION);
      release();
      expect(await page.evaluate(() => window.first)).toBe("ready");
      await works(value);
    } else if (step === "mount-host-takes-over") {
      // The runtime's link is held; a host's marked stylesheet arrives and applies, and both mounts take it.
      await insertTabs(value);
      await page.evaluate(id => { window.first = CanopyX.tabs("#" + id).ready.then(() => "ready", error => error.message); }, value);
      await page.waitForSelector('link[data-canopyx-part="ui-tabs"][data-canopyx-owned]', { state: "attached" });
      await page.evaluate(version => new Promise(resolve => {
        const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/canopyx-ui-tabs.css?host", onload: resolve });
        Object.assign(link.dataset, { canopyxPart: "ui-tabs", cxVersion: version }); document.head.append(link);
      }), VERSION);
      await insertTabs("next");
      expect(await mount("next")).toBe("ready");
      release();
      expect(await page.evaluate(() => window.first)).toBe("ready");
      await works("next");
    }
    else if (step === "mount-detached") {
      // The first mount's link is removed while its response is held; the next mount replaces it, and both mounts get it.
      await insertTabs(value);
      await page.evaluate(id => { window.first = CanopyX.tabs("#" + id).ready.then(() => "ready", error => error.message); }, value);
      await page.waitForSelector('link[data-canopyx-part="ui-tabs"]', { state: "attached" });
      await page.evaluate(() => document.querySelector('link[data-canopyx-part="ui-tabs"]').remove());
      await insertTabs("next");
      const next = mount("next");
      release();
      expect(await next).toBe("ready");
      await works("next");
      expect(await page.evaluate(() => window.first)).toBe("ready");
    } else await page.evaluate(({ step, value, key }) => {
      const main = document.querySelector("main"), kept = window.kept ||= {};
      const applying = () => document.querySelectorAll("style[data-canopyx-part]:not([media='not all'])");
      if (step === "parsed") { const fragment = document.createRange().createContextualFragment(value); kept[key] = [...fragment.childNodes]; main.append(fragment); }
      else if (step === "html") main.insertAdjacentHTML("beforeend", value);
      else if (step === "remove") kept[value].forEach(node => node.remove());
      else if (step === "reinsert") main.append(...kept[value]);
      else if (step === "replace") main.innerHTML = value;
      else if (step === "remove-element") document.querySelector(value).remove();
      else if (step === "clear-head") applying().forEach(style => style.remove());
      else if (step === "clear-templates") document.querySelectorAll("style[media='not all'][data-canopyx-part]").forEach(style => style.remove());
      else if (step === "host-retag") document.getElementById("host-style").dataset.cxVersion = "0123456789abcdef";
      else if (step === "host-cssom-off") document.getElementById("host-style").sheet.media.mediaText = "not all";
      else if (step === "host-style") {
        const style = document.createElement("style"); style.id = "host-" + value; style.textContent = key;
        Object.assign(style.dataset, { canopyxPart: "ui-tabs", cxVersion: document.querySelector("script[data-canopyx-part=ui-tabs]")?.dataset.cxVersion }); document.head.append(style);
      } else if (step === "host-off") document.getElementById("host-style").media = "not all";
      else if (step === "host-print") document.querySelector('link[data-canopyx-part="ui-tabs"]:not([data-canopyx-owned])').media = "print";
      else if (step === "head-reparse") document.head.innerHTML = document.head.innerHTML;
      else if (step === "take-link") { kept[value] = document.querySelector('link[data-canopyx-part="ui-tabs"]'); kept[value].remove(); }
      else if (step === "reinsert-link") document.head.append(kept[value]);
      else if (step === "destroy") { CanopyX.tabs("#" + value).destroy(); document.getElementById(value).remove(); }
    }, { step, value, key });
  }
  const state = await page.evaluate(markers => {
    // A grouping rule (@layer, @media) serializes the rules inside it too; a template's media never matches.
    // An unselected alternate stylesheet reports itself enabled, but its rules never apply.
    const applies = sheet => !sheet.disabled && !sheet.ownerNode?.relList?.contains("alternate") && (!sheet.media.length || matchMedia(sheet.media.mediaText).matches);
    const count = marker => [...document.styleSheets].filter(sheet => applies(sheet) && [...sheet.cssRules].some(rule => rule.cssText.includes(marker))).length;
    return {
      styles: document.querySelectorAll('style[data-canopyx-part="ui-tabs"]:not([media="not all"])').length,
      links: document.querySelectorAll('link[rel=stylesheet][data-canopyx-part="ui-tabs"]').length,
      tabs: count(markers.tabs), picker: count(markers.picker)
    };
  }, MARKERS);
  expect(state).toEqual({ styles, links, tabs: applied, picker: 1 });
  expect(requested.some(file => file.endsWith(".css"))).toBe(files);
  expect(errors).toEqual([]);
});

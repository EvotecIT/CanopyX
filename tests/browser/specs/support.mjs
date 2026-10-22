// Shared helpers for the browser tests. The tests open the pages that CanopyX.Examples generates, straight from disk.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "../../..");
export const examples = process.env.CANOPYX_EXAMPLES
  ? path.resolve(process.env.CANOPYX_EXAMPLES)
  : path.join(repo, "CanopyX.Examples/bin/Release/net10.0/output");

export function exampleUrl(name) {
  const file = path.join(examples, name);
  if (!fs.existsSync(file)) {
    throw new Error("Example page missing: " + file + ". Run ./Build.ps1 -SkipPack, or set CANOPYX_EXAMPLES.");
  }
  return pathToFileURL(file).href;
}

/** Records script loads from the DOM, including file URLs browsers omit from network events. */
export async function trackScriptLoads(page) {
  await page.addInitScript(() => {
    window.__canopyxScriptLoads = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeName === "SCRIPT" && node.src) window.__canopyxScriptLoads.push(node.src);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => window.__canopyxScriptLoads.splice(0));
}

export function nextFrames(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Opens a toolbar control through its desktop button or the phone overflow. */
export async function openGridControl(page, kind) {
  const control = page.locator('.cx-grid-' + kind), summary = control.locator(':scope > summary');
  // Data readiness can precede the observer that moves phone controls into More.
  await page.waitForFunction(kind => {
    const host = document.querySelector('.cx-grid-' + kind)?.closest('[data-canopyx-host]');
    return host && host.clientWidth > 0 && host.classList.contains('cx-phone') === (host.clientWidth <= 640);
  }, kind);
  if (!await summary.isVisible()) await page.locator('.cx-grid-overflow > summary').click();
  if (!await control.evaluate(element => element.open)) await summary.click();
  if (kind === 'filters') {
    // Native details toggles are queued. Wait for the newly opened panel before editing its form from a prior open.
    await control.locator(':scope > .cx-grid-panel:popover-open').waitFor();
    await control.getByRole('button', { name: 'Done', exact: true }).waitFor();
  }
}

/** Done flushes the live editor immediately; optionally reopen it for the next edit. */
export async function flushGridFilters(page, reopen = true) {
  await page.locator('.cx-grid-filters').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('grid').and(page.locator('.cx-data-grid .cx-grid')).waitFor();
  await page.waitForFunction(() => document.querySelector('.cx-data-grid .cx-grid').getAttribute('aria-busy') === 'false');
  if (reopen) await openGridControl(page, 'filters');
}

/** Opens an example page and waits until the view has mounted, loaded its first page, and painted. */
export async function openExample(page, name, hash) {
  await page.goto(exampleUrl(name) + (hash || ""));
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

export function row(page, id) {
  return page.locator(".cx-row[data-cx-id=\"" + id + "\"]");
}

/** Ids of the rendered node rows in visual order. */
export function renderedIds(page) {
  return page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")]
    .sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
    .map((r) => r.getAttribute("data-cx-id")));
}

export function focusedId(page) {
  return page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-cx-id"));
}

/** The tree tools part every tree runtime loads, as shipped in CanopyX.Html. */
export function treeToolsAssets() {
  return { script: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-tree-tools.js"), "utf8"),
    style: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-tree-tools.css"), "utf8") };
}

/** The runtime assets as shipped in CanopyX.Html, for pages the tests build themselves; the lazy parts are preloaded. */
export function runtimeAssets(runtime = "tree") {
  const stem = runtime === "reporting" ? "canopyx-reporting" : runtime === "grid" ? "canopyx-grid" : runtime === "interactive" ? "canopyx-interactive" : "canopyx";
  return {
    script: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/" + stem + ".js"), "utf8") +
      (runtime === "grid" || runtime === "reporting" ? "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-filter-editor.js"),"utf8") +
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-history.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-presenters.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-data.js"),"utf8") +
        // The detail rows and grouping parts every grid runtime loads for grouped or detail views.
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-detail-rows.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-grouping.js"),"utf8") +
        // The live data part of grids that change in place.
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-live.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-facets.js"),"utf8") +
        // The calendar and resource timeline parts of grids that declare a calendar.
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-calendar.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-timeline.js"),"utf8") +
        ["calendar-recurrence", "calendar-edit", "calendar-ics"].map(name => "\n" + fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("") : "") +
      "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-export.js"),"utf8") + "\n" + treeToolsAssets().script +
      // The links and search parts every runtime loads for deep links and sidecar searches.
      "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-links.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-search.js"),"utf8") +
      // The search highlighting and layout mode parts of views that declare them.
      "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-highlight.js"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-layouts.js"),"utf8") +
      // The record panel part every runtime loads for record panels, structured values and record links.
      "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-record-panel.js"),"utf8"),
    style: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/" + stem + ".css"), "utf8") +
      (runtime === "grid" || runtime === "reporting" ? "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-filter-editor.css"),"utf8") +
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-detail-rows.css"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-grouping.css"),"utf8") +
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-live.css"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-facets.css"),"utf8") +
        "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-calendar.css"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-timeline.css"),"utf8") : "") +
      "\n" + treeToolsAssets().style + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-highlight.css"),"utf8") +
      "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-layouts.css"),"utf8") + "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-record-panel.css"),"utf8")
  };
}

/** A page with one view mounted from a view document, served by the test through page.route. */
export function viewPage(view) {
  const interactive = view.checkboxes || view.dragDrop || view.contextActions && view.contextActions.length || view.columns.some(column => column.editable);
  const { script, style } = runtimeAssets(view.type === "grid" ? view.reporting ? "reporting" : "grid" : interactive ? "interactive" : "tree");
  const json = JSON.stringify(view).replace(/</g, "\\" + "u003c");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>CanopyX test</title><style>" + style + "</style><script>" + script
    + "</script></head><body class=\"cx-page\"><div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\"><script type=\"application/json\" class=\"cx-config\">"
    + json + "</script></div></body></html>";
}

/** Median of a few measurements, so one slow sample on a busy CI runner does not decide a budget. */
export function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** The shard key of a folded word prefix: a-z and 0-9 stay, other code units become _ plus four hex digits. */
export function shardKey(prefix) {
  let key = "";
  for (let i = 0; i < prefix.length; i++) {
    const code = prefix.charCodeAt(i);
    key += (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ? prefix.charAt(i) : "_" + code.toString(16).padStart(4, "0");
  }
  return key;
}

/**
 * A search index for a handcrafted sidecar bundle, written the way docs/data-protocol.md describes it: one entry file,
 * one shard per two-unit word prefix, and a shard of its own for each one-unit word. The hits are
 * { path, label, kind? }; ancestors that are not hits themselves are labelled with their id. Labels fold by ASCII
 * case only, which is enough for the labels the tests use.
 * Returns { search, docs }: the manifest's search object and the documents by reference.
 */
export function searchIndex(hits) {
  const fold = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const entries = [];
  const numbers = new Map();
  const kinds = [];
  const entryOf = (path) => {
    const key = JSON.stringify(path);
    if (!numbers.has(key)) {
      const parent = path.length > 1 ? entryOf(path.slice(0, -1)) : -1;
      numbers.set(key, entries.length);
      entries.push([parent, 0, path[path.length - 1], 0, path[path.length - 1]]);
    }
    return numbers.get(key);
  };
  const postings = new Map();
  const post = (word, number) => postings.set(word, (postings.get(word) || []).concat(number));
  for (const hit of hits) {
    const number = entryOf(hit.path);
    entries[number][4] = hit.label;
    if (hit.kind != null) {
      if (kinds.indexOf(hit.kind) < 0) kinds.push(hit.kind);
      entries[number][5] = kinds.indexOf(hit.kind);
    }
    const separators = "[\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7f]+";
    const folded = fold(hit.label);
    const labelWords = [...new Set(folded.split(new RegExp(separators)))].filter((word) => word.length);
    labelWords.forEach((word) => post(word, number));
    if (labelWords.length) {
      const trimmed = folded.replace(new RegExp("^" + separators + "|" + separators + "$", "g"), "");
      let hash = 2166136261;
      for (let i = 0; i < trimmed.length; i++) hash = Math.imul(hash ^ trimmed.charCodeAt(i), 16777619);
      post("\u0000" + (hash >>> 0).toString(16).padStart(8, "0"), number);
    }
  }
  const docs = { "e/0": { protocol: "canopyx/2", type: "searchEntries", first: 0, stem: [], entries } };
  const shards = {};
  for (const word of [...postings.keys()].sort()) {
    const key = word.length === 1 ? shardKey(word) + "-" : shardKey(word.slice(0, 2));
    const doc = docs["s/k-" + key] || (docs["s/k-" + key] = { protocol: "canopyx/2", type: "searchShard", key, words: [], postings: [] });
    const list = postings.get(word);
    doc.words.push(word);
    doc.postings.push(list.map((number, i) => (i ? number - list[i - 1] : number)));
    shards[key] = (shards[key] || 0) + list.length;
  }
  return { search: { entryCount: entries.length, entryFiles: entries.length ? [0] : [], kinds, shards }, docs };
}

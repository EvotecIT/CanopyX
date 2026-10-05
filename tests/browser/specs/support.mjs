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

/** The runtime assets as shipped in CanopyX.Html, for pages the tests build themselves. */
export function runtimeAssets(runtime = "tree") {
  const stem = runtime === "reporting" ? "canopyx-reporting" : runtime === "grid" ? "canopyx-grid" : runtime === "interactive" ? "canopyx-interactive" : "canopyx";
  return {
    script: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/" + stem + ".js"), "utf8") +
      (runtime === "grid" || runtime === "reporting" ? "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-filter-editor.js"),"utf8") : ""),
    style: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/" + stem + ".css"), "utf8") +
      (runtime === "grid" || runtime === "reporting" ? "\n" + fs.readFileSync(path.join(repo,"CanopyX.Html/Assets/canopyx-filter-editor.css"),"utf8") : "")
  };
}

/** A page with one view mounted from a view document, served by the test through page.route. */
export function viewPage(view) {
  const interactive = view.checkboxes || view.dragDrop || view.contextActions && view.contextActions.length || view.columns.some(column => column.editable);
  const { script, style } = runtimeAssets(view.type === "grid" ? view.reporting ? "reporting" : "grid" : interactive ? "interactive" : "tree");
  const json = JSON.stringify(view).replace(/</g, "\\" + "u003c");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>CanopyX test</title><style>" + style + "</style><script>" + script
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

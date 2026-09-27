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
export function runtimeAssets() {
  return {
    script: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.js"), "utf8"),
    style: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx.css"), "utf8")
  };
}

/** A page with one view mounted from a view document, served by the test through page.route. */
export function viewPage(view) {
  const { script, style } = runtimeAssets();
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

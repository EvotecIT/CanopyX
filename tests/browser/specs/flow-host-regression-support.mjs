// Mount the shipped external entry and lazy parts without rebuilding embedded example assemblies.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repo } from "./support.mjs";

export const nameField = { id: "name", type: "text", label: "Name", default: "original", required: true };
export const reviewStep = { id: "review", type: "review" };
export const checkedStep = { id: "one", title: "Answers", fields: [nameField], checks: [{ id: "test", label: "Test", fields: ["name"], required: "pass" }] };
export const documentOf = (steps, extra = {}) => ({ kind: "flow", version: 1, id: "regression", title: "Regression", steps, ...extra });

export async function mountRuntime(page, testInfo, flow, source = "({})", entry = "flow-entry") {
  const filename = testInfo.outputPath("runtime.html"), assets = process.env.CANOPYX_TEST_ASSETS || path.join(repo, "CanopyX.Html/Assets");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const staging = path.join(path.dirname(filename), "assets"); fs.mkdirSync(staging, { recursive: true });
  const names = fs.readdirSync(assets).filter(name => entry === "reporting" ? /^canopyx.*\.(js|css)$/.test(name) : /^canopyx-(flow(?:-[a-z]+)?|forms)\.(js|css)$/.test(name));
  for (const name of names) fs.copyFileSync(path.join(assets, name), path.join(staging, name));
  fs.writeFileSync(filename, '<!doctype html><html lang="en"><head><meta charset="utf-8"><script src="assets/canopyx-' + entry + '.js" defer></script></head><body><main id="host"></main></body></html>');
  await page.goto(pathToFileURL(filename).href);
  await page.waitForFunction(() => typeof window.CanopyX?.createFlow === "function");
  return page.evaluate(async ([flow, source]) => {
    window.__errors = []; window.__rejections = []; window.__submissions = [];
    const host = document.getElementById("host");
    host.addEventListener("canopyx:error", event => window.__errors.push({ hook: event.detail.hook, message: String(event.detail.error?.message) }));
    host.addEventListener("canopyx:flowSubmit", event => window.__submissions.push(JSON.parse(JSON.stringify(event.detail))));
    window.addEventListener("unhandledrejection", event => { window.__rejections.push(String(event.reason)); event.preventDefault(); });
    window.__api = window.CanopyX.createFlow(host, { flow, ...new Function("return " + source)() });
    try { await window.__api.ready; return null; } catch (error) { return error.message; }
  }, [flow, source]);
}

export const checkItem = page => page.locator('[data-cx-check="test"].cx-flow-check-item');
export const deferredCheck = `({ hooks: { check: (id, values, context) => new Promise((resolve, reject) => {
  (window.__checks ||= []).push({ values, context, resolve, reject });
}) } })`;

// Public flow shell contracts while lazy parts load, after mount failure, and after the host is reused.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo } from "./support.mjs";

const origin = "http://canopyx-flow.test";
const assets = path.join(repo, "CanopyX.Html/Assets");
const syncCalls = [
  ["getStep", []], ["getValues", []], ["setValues", [{ name: "changed" }]], ["getState", []], ["isDirty", []],
  ["reset", []], ["setFieldError", ["name", null]], ["setProgress", [{ done: 1, total: 2 }]], ["complete", [{ status: "saved" }]]
];

/** Serves the shipped entry point and parts, holding the flow part at the network boundary until released. */
async function delayedFlow(page, { invalid = false } = {}) {
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const request = new Promise(resolve => { requested = resolve; });
  const flow = { kind: "flow", version: 1, id: "lifecycle", title: "Lifecycle", mode: "free", steps: [
    { id: "one", title: "First", fields: [{ id: "name", type: "text", label: "Name", default: "initial" }] },
    { id: "two", title: "Second", type: "info" }
  ] };
  if (invalid) flow.steps = [];
  await page.route(origin + "/**", async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({ contentType: "text/html", body:
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flow lifecycle</title>' +
      '<script src="canopyx-flow-entry.js" defer></script></head><body>' +
      '<div id="flow" class="cx-host cx-flow-host" data-canopyx-host data-cx-mount="manual">' +
      '<p id="host-content">Host content</p><script class="cx-config" type="application/json">' + JSON.stringify(flow) + "</script></div></body></html>" });
    if (name === "canopyx-flow.js") { requested(); await gate; }
    if (!/^canopyx-[a-z-]+\.(?:js|css)$/.test(name)) return route.abort();
    return route.fulfill({ contentType: name.endsWith(".js") ? "text/javascript" : "text/css", body: fs.readFileSync(path.join(assets, name), "utf8") });
  });
  await page.goto(origin + "/");
  await page.evaluate(() => {
    window.__flowHost = document.querySelector("#flow");
    window.CanopyX.configure("lifecycle", { onSubmit: () => ({ status: "saved" }) });
    window.__flowApi = window.CanopyX.mount(window.__flowHost)[0];
    window.__flowReady = window.__flowApi.ready.then(() => "ready", error => error.message);
  });
  await request;
  return release;
}

test("synchronous flow methods throw until the delayed implementation loads and keep their declared return types", async ({ page }) => {
  const release = await delayedFlow(page);
  const early = await page.evaluate(calls => calls.map(([name, args]) => {
    try { const value = window.__flowApi[name](...args); return { name, promise: value instanceof Promise }; }
    catch (error) { return { name, error: error.message }; }
  }), syncCalls);
  for (const [index, [name]] of syncCalls.entries()) expect(early[index]).toEqual({ name, error: expect.stringMatching(/not ready; await api\.ready/) });
  release();
  expect(await page.evaluate(() => window.__flowReady)).toBe("ready");
  expect(await page.evaluate(() => {
    const api = window.__flowApi;
    const initial = [api.getStep(), api.getValues(), api.getState(), api.isDirty()];
    const set = api.setValues({ name: "changed" });
    const error = api.setFieldError("name", null);
    const changed = api.isDirty();
    const reset = api.reset();
    return { initial, set: typeof set, error: typeof error, changed, reset, values: api.getValues(),
      progress: api.setProgress({ done: 1, total: 2 }), complete: api.complete({ status: "saved" }) };
  })).toEqual({ initial: ["one", { name: "initial" }, { step: "one", values: { name: "initial" }, completed: [] }, false],
    set: "undefined", error: "undefined", changed: true, reset: true, values: { name: "initial" }, progress: false, complete: false });
});

const asyncCalls = [
  ["next", [], true], ["back", [], false], ["goTo", ["two"], true],
  ["setState", [{ step: "two", values: { name: "restored" } }], true],
  ["validate", [], { valid: true, errors: [], warnings: [] }], ["submit", [], { status: "saved" }]
];
for (const [name, args, expected] of asyncCalls) test(`${name} waits for the delayed flow part and returns its declared Promise result`, async ({ page }) => {
  const release = await delayedFlow(page);
  expect(await page.evaluate(([name, args]) => {
    window.__settled = false;
    window.__queued = window.__flowApi[name](...args);
    window.__queued.then(() => { window.__settled = true; });
    return window.__queued instanceof Promise;
  }, [name, args])).toBe(true);
  expect(await page.evaluate(() => window.__settled)).toBe(false);
  release();
  const result = await page.evaluate(() => window.__queued);
  if (typeof expected === "object") expect(result).toMatchObject(expected);
  else expect(result).toBe(expected);
  if (name === "setState") expect(await page.evaluate(() => window.__flowApi.getValues())).toEqual({ name: "restored" });
});

for (const phase of ["loading", "ready", "failed"]) test(`destroy releases a ${phase} flow host for mount and repeated destroy preserves its replacement`, async ({ page }) => {
  const release = await delayedFlow(page, { invalid: phase === "failed" });
  if (phase !== "loading") {
    release();
    const result = await page.evaluate(() => window.__flowReady);
    if (phase === "ready") expect(result).toBe("ready");
    else {
      expect(result).not.toBe("ready");
      await expect(page.locator("#flow > .cx-mount-error")).toHaveCount(1);
      await expect(page.locator("#flow")).toHaveAttribute("data-cx-error", /.+/);
    }
  }
  expect(await page.evaluate(() => {
    window.__oldFlow = window.__flowApi;
    window.__oldFlow.destroy();
    const host = window.__flowHost;
    return { mounted: host.hasAttribute("data-canopyx-mounted"), ready: host.hasAttribute("data-cx-ready"),
      error: host.hasAttribute("data-cx-error"), flowHost: host.classList.contains("cx-flow-host"), api: !!host.canopyx,
      notices: host.querySelectorAll(":scope > .cx-mount-error").length, roots: host.querySelectorAll(":scope > .cx-flow").length,
      content: host.querySelector("#host-content")?.textContent, config: !!host.querySelector("script.cx-config") };
  })).toEqual({ mounted: false, ready: false, error: false, flowHost: false, api: false, notices: 0, roots: 0, content: "Host content", config: true });
  await page.evaluate(() => {
    const config = window.__flowHost.querySelector("script.cx-config"), flow = JSON.parse(config.textContent);
    flow.steps = [{ id: "replacement", title: "Replacement", type: "info" }]; config.textContent = JSON.stringify(flow);
    window.__replacement = window.CanopyX.mount(window.__flowHost)[0];
    window.__oldFlow.destroy();
  });
  release();
  if (phase === "loading") expect(await page.evaluate(() => window.__flowReady)).toMatch(/destroyed/);
  await page.evaluate(() => window.__replacement.ready.then(() => true));
  await page.evaluate(() => window.__oldFlow.destroy());
  expect(await page.evaluate(() => ({ same: window.__flowHost.canopyx === window.__replacement,
    step: window.__replacement.getStep(), mounted: window.__flowHost.hasAttribute("data-canopyx-mounted"),
    ready: window.__flowHost.hasAttribute("data-cx-ready"), flowHost: window.__flowHost.classList.contains("cx-flow-host") })))
    .toEqual({ same: true, step: "replacement", mounted: true, ready: true, flowHost: true });
  await expect(page.locator("#flow > .cx-flow")).toHaveCount(1);
  await expect(page.locator("#flow > .cx-mount-error")).toHaveCount(0);
});

for (const phase of ["loading", "ready"]) test(`destroyed ${phase} flow calls throw or reject consistently, including queued async calls`, async ({ page }) => {
  const release = await delayedFlow(page);
  if (phase === "ready") { release(); expect(await page.evaluate(() => window.__flowReady)).toBe("ready"); }
  await page.evaluate(calls => {
    window.__destroyedCalls = calls.map(([name, args]) => window.__flowApi[name](...args).then(() => "resolved", error => error.message));
    window.__flowApi.destroy();
  }, asyncCalls);
  const sync = await page.evaluate(calls => calls.map(([name, args]) => {
    try { window.__flowApi[name](...args); return "returned"; } catch (error) { return error.message; }
  }), syncCalls);
  for (const result of sync) expect(result).toMatch(/flow has been destroyed/);
  const async = await page.evaluate(calls => Promise.all(calls.map(async ([name, args]) => {
    let result;
    try { result = window.__flowApi[name](...args); } catch { return "threw synchronously"; }
    if (!(result instanceof Promise)) return "not a Promise";
    return result.then(() => "resolved", error => error.message);
  })), asyncCalls);
  for (const result of async) expect(result).toMatch(/flow has been destroyed/);
  release();
  for (const result of await page.evaluate(() => Promise.all(window.__destroyedCalls))) expect(result).toMatch(/flow has been destroyed/);
  await expect(page.locator("#flow > .cx-flow")).toHaveCount(0);
});

// Matrix shell ownership across lazy loading, failed creation and host reuse.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { repo } from "./support.mjs";

const origin = "http://canopyx-matrix.test";
const document = () => JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/matrix-small.json"), "utf8"));

async function delayedMatrix(page, classes, invalid, destroyOnReady = false) {
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const request = new Promise(resolve => { requested = resolve; });
  await page.route(origin + "/**", async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({ contentType: "text/html", body:
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Matrix lifecycle</title><script src="canopyx-grid.js" defer></script></head><body>' +
      '<div id="host" style="height:480px"' + (classes === null ? "" : ' class="' + classes + '"') + '><p id="owned">Host content</p></div></body></html>' });
    if (name === "canopyx-matrix.js") { requested(); await gate; }
    if (!/^canopyx[a-z-]*\.(?:js|css)$/.test(name)) return route.abort();
    return route.fulfill({ contentType: name.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8") });
  });
  await page.goto(origin + "/");
  const doc = document();
  if (invalid) doc.states = [];
  await page.evaluate(({ doc, destroyOnReady }) => {
    window.host = window.document.querySelector("#host");
    window.staleStates = [];
    window.api = CanopyX.createMatrix(host, { view: doc,
      onReady() { if (destroyOnReady) { api.destroy(); window.replacement = CanopyX.createMatrix(host, { view: doc }); } },
      onStateChange(state) { staleStates.push(state); } });
    window.result = api.ready.then(() => "ready", error => error.name + ":" + error.message);
  }, { doc, destroyOnReady });
  await request;
  return release;
}

test("queued matrix mutations cancel when the ready callback destroys and replaces their instance", async ({ page }) => {
  const release = await delayedMatrix(page, null, false, true);
  await page.evaluate(() => { window.queued = api.setSearch("Row").then(() => "accepted", error => error.name); });
  release();
  expect(await page.evaluate(() => window.result)).toMatch(/^AbortError:/);
  expect(await page.evaluate(() => window.queued)).toBe("AbortError");
  await page.evaluate(() => replacement.ready);
  expect(await page.evaluate(() => {
    let error;
    try { api.setSearch("stale"); } catch (failure) { error = failure.name; }
    return { error, stale: staleStates.length, current: host.canopyx === replacement, search: replacement.getState().search };
  })).toEqual({ error: "AbortError", stale: 0, current: true, search: "" });
});

for (const classes of [null, "", "custom cx-host cx-matrix-host"]) for (const phase of ["loading", "ready", "failed"]) {
  test("matrix destroy restores " + (classes === null ? "absent" : classes ? "existing" : "empty") + " host classes after " + phase + " and preserves its replacement", async ({ page }) => {
    const release = await delayedMatrix(page, classes, phase === "failed");
    if (phase !== "loading") {
      release();
      const result = await page.evaluate(() => window.result);
      if (phase === "ready") expect(result).toBe("ready");
      else { expect(result).not.toBe("ready"); await expect(page.locator("#host > .cx-mount-error")).toHaveCount(1); }
    } else await page.evaluate(() => { window.queued = api.getState().then(() => "state", error => error.name); });
    expect(await page.evaluate(() => {
      window.old = api; old.destroy();
      return { classes: host.getAttribute("class"), mounted: host.hasAttribute("data-canopyx-mounted"), ready: host.hasAttribute("data-cx-ready"),
        error: host.hasAttribute("data-cx-error"), api: !!host.canopyx, roots: host.querySelectorAll(".cx-matrix,.cx-mount-error").length, content: host.querySelector("#owned")?.textContent };
    })).toEqual({ classes, mounted: false, ready: false, error: false, api: false, roots: 0, content: "Host content" });
    await page.evaluate(doc => { window.replacement = CanopyX.createMatrix(host, { view: doc }); old.destroy(); }, document());
    release();
    if (phase === "loading") {
      expect(await page.evaluate(() => window.result)).toMatch(/^AbortError:/);
      expect(await page.evaluate(() => window.queued)).toBe("AbortError");
    }
    await page.evaluate(() => replacement.ready);
    await page.evaluate(() => old.destroy());
    expect(await page.evaluate(() => ({ same: host.canopyx === replacement, mounted: host.hasAttribute("data-canopyx-mounted"), ready: host.hasAttribute("data-cx-ready") })))
      .toEqual({ same: true, mounted: true, ready: true });
  });
}

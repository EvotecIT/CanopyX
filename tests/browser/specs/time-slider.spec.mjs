import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { exampleUrl, examples, repo, trackScriptLoads } from "./support.mjs";

const owners = ["matrix", "propagation"];
const state = page => page.evaluate(() => window.timeApi.playback.getState());

async function openTime(page, kind, settings = {}) {
  await page.goto(exampleUrl("time-" + kind + (settings.dark ? "-dark" : "") + ".html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(async settings => {
    const host = document.querySelector("[data-canopyx-host]"), original = host.canopyx;
    await original.ready;
    const source = JSON.parse(host.querySelector("script.cx-config").textContent);
    original.destroy(); host.replaceChildren();
    if (settings.latest) delete source.timeSlider.initial;
    else source.timeSlider.initial = settings.initial ?? 0;
    source.timeSlider.interval = 100;
    window.timeSource = source; window.timeBaseline = JSON.stringify(source);
    window.timeApi = CanopyX[source.type === "matrix" ? "createMatrix" : "createPropagation"](host, { view: source });
    await window.timeApi.ready;
  }, settings);
}

// Fresh document and real lazy requests: the generated page supplies its owner and config, while only the slider's inert
// payloads are removed. Delaying its script exercises cancellation across the actual part-loading boundary.
async function lazyTime(page, kind, delayed = false) {
  await page.unrouteAll();
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  const requests = [], origin = "https://canopyx-time.test";
  const html = fs.readFileSync(path.join(examples, "time-" + kind + ".html"), "utf8")
    .replace("data-canopyx-host data-cx-theme=", 'data-canopyx-host data-cx-mount="manual" data-cx-theme=')
    .replace(/<script\b[^>]*type="application\/x-canopyx-time-slider(?:-style)?"[^>]*>[\s\S]*?<\/script>/g, "");
  await page.route(origin + "/**", async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({ contentType: "text/html", body: html });
    requests.push(name);
    if (!/^canopyx-time-slider(?:\.[a-z0-9]+)?\.(?:js|css)$/.test(name)) return route.abort();
    if (name.endsWith(".js")) { requested(); if (delayed) await gate; }
    const extension = name.endsWith(".css") ? "css" : "js";
    return route.fulfill({ contentType: extension === "css" ? "text/css" : "text/javascript",
      body: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-time-slider." + extension), "utf8") });
  });
  await page.goto(origin + "/");
  await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]");
    window.timeHistory = JSON.parse(host.querySelector("script.cx-config").textContent);
    window.timeHistory.timeSlider.initial = 0; window.timeHistory.timeSlider.interval = 100;
    const plain = structuredClone(window.timeHistory); delete plain.timeSlider;
    window.timeApi = CanopyX[plain.type === "matrix" ? "createMatrix" : "createPropagation"](host, { view: plain });
    await window.timeApi.ready;
  });
  return { requests, started, release };
}

for (const kind of owners) {
  test(kind + " playback uses explicit and latest initial frames with synchronous controls", async ({ page }) => {
    await openTime(page, kind, { initial: 1, dark: kind === "propagation" });
    expect(await state(page)).toMatchObject({ index: 1, count: 3, playing: false });
    await expect(page.locator(".cx-time-range")).toHaveValue("1");
    await expect(page.locator(".cx-time-stamp")).toContainText("Update spreading");
    const result = await page.evaluate(() => {
      const api = window.timeApi, initial = api.playback.getState(), backward = api.playback.step(-1), next = api.playback.step();
      const last = api.playback.seek(2), errors = [];
      for (const target of [-1, 3, 0.5]) { try { api.playback.seek(target); } catch (error) { errors.push(error.name); } }
      return { sync: ![initial, backward, next, last].some(value => typeof value?.then === "function"),
        indices: [initial.index, backward.index, next.index, last.index], errors, current: api.playback.getState(),
        sameFrame: JSON.stringify(api.view) === JSON.stringify(window.timeSource.timeSlider.snapshots[2].view) };
    });
    expect(result).toMatchObject({ sync: true, indices: [1, 0, 1, 2], errors: ["RangeError", "RangeError", "RangeError"], current: { index: 2 }, sameFrame: true });
    await expect(page.getByRole("button", { name: "Next snapshot", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    await openTime(page, kind, { latest: true });
    expect(await state(page)).toMatchObject({ index: 2, playing: false });
    await expect(page.locator(".cx-time-stamp")).toContainText("All services ready");
    const range = page.locator(".cx-time-range");
    await range.focus(); await page.keyboard.press("Home");
    await expect(range).toHaveValue("0");
    expect((await state(page)).index).toBe(0);
    await expect(page.getByRole("button", { name: "Previous snapshot", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Next snapshot", exact: true }).click();
    expect((await state(page)).index).toBe(1);
  });
}

test("matrix playback preserves search and replays detached snapshots without changing host data", async ({ page }) => {
  await openTime(page, "matrix");
  const result = await page.evaluate(() => {
    const api = window.timeApi;
    api.setSearch("Search"); api.focusCell("service-1", "east");
    const before = document.activeElement.getAttribute("aria-label");
    api.playback.seek(2); api.focusCell("service-1", "east");
    const after = document.activeElement.getAttribute("aria-label");
    const immutable = JSON.stringify(window.timeSource) === window.timeBaseline;
    window.timeSource.timeSlider.snapshots[0].view.label = "Host changed its retained snapshot";
    api.playback.seek(0);
    return { before, after, immutable, search: api.getState().search, visible: api.getVisible().rows,
      detached: api.view.label !== window.timeSource.timeSlider.snapshots[0].view.label };
  });
  expect(result.before).toContain("Waiting"); expect(result.after).toContain("Ready");
  expect(result).toMatchObject({ immutable: true, search: "Search", visible: ["service-1"], detached: true });
});

test("timed playback advances stops at the end and pauses for controls and beforeprint", async ({ page }) => {
  for (const kind of owners) {
    await openTime(page, kind);
    expect(await page.evaluate(() => window.timeApi.playback.play().playing)).toBe(true);
    await expect.poll(async () => (await state(page)).index).toBeGreaterThan(0);
    const paused = await page.evaluate(() => window.timeApi.playback.pause());
    await page.waitForTimeout(350);
    expect(await state(page)).toMatchObject({ index: paused.index, playing: false });
    await page.evaluate(() => { window.timeApi.playback.seek(0); window.timeApi.playback.play(); });
    await expect.poll(() => state(page)).toMatchObject({ index: 2, playing: false });
    await expect(page.locator(".cx-time-stamp")).toContainText("All services ready");
    await page.evaluate(() => { window.timeApi.playback.seek(0); window.timeApi.playback.play(); window.dispatchEvent(new Event("beforeprint")); });
    await page.waitForTimeout(350);
    expect(await state(page)).toMatchObject({ index: 0, playing: false });
    await page.evaluate(() => { window.timeApi.playback.play(); window.timeApi.playback.step(); });
    await page.waitForTimeout(350);
    expect(await state(page)).toMatchObject({ index: 1, playing: false });
  }
});

test("reduced motion blocks autoplay allows manual steps and pauses an active session when changed", async ({ page }) => {
  for (const kind of owners) {
    await page.emulateMedia({ reducedMotion: "reduce" }); await openTime(page, kind);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    await expect(page.locator(".cx-time-reduced")).toBeVisible();
    expect(await page.evaluate(() => window.timeApi.playback.play())).toMatchObject({ index: 0, playing: false, reducedMotion: true });
    await page.getByRole("button", { name: "Next snapshot", exact: true }).click();
    expect((await state(page)).index).toBe(1);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => state(page)).toMatchObject({ reducedMotion: false });
    await page.evaluate(() => { window.timeApi.playback.seek(0); window.timeApi.playback.play(); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => state(page)).toMatchObject({ reducedMotion: true, playing: false });
    const paused = (await state(page)).index;
    await page.waitForTimeout(350); expect((await state(page)).index).toBe(paused);
    expect(await page.evaluate(() => window.timeApi.playback.step(-1).playing)).toBe(false);
  }
});

test("external history replacement is awaited and plain replacement removes playback controls", async ({ page }) => {
  for (const kind of owners) {
    await openTime(page, kind);
    const result = await page.evaluate(async () => {
      const api = window.timeApi, replacement = structuredClone(window.timeSource);
      replacement.timeSlider.initial = 1; replacement.timeSlider.snapshots = replacement.timeSlider.snapshots.slice(1);
      replacement.timeSlider.snapshots[1].label = "Replacement latest";
      api.playback.play();
      const pending = api.update(replacement), asynchronous = typeof pending?.then === "function";
      await pending;
      const current = api.playback.getState(), roots = api.element.querySelectorAll(".cx-time").length;
      const plain = structuredClone(replacement.timeSlider.snapshots[0].view); plain.label = "Plain replacement";
      const ordinary = api.update(plain); let unavailable;
      try { api.playback.getState(); } catch (error) { unavailable = error.message; }
      return { asynchronous, current, roots, syncPlain: typeof ordinary?.then !== "function", unavailable, label: api.view.label };
    });
    expect(result).toMatchObject({ asynchronous: true, current: { index: 1, count: 2, playing: false }, roots: 1, syncPlain: true, label: "Plain replacement" });
    expect(result.unavailable).toMatch(/no time slider|not ready/i);
    await expect(page.locator(".cx-time")).toHaveCount(0);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.timeApi.view.label)).toBe("Plain replacement");
  }
});

test("destroy retires playback timers and handlers without disturbing a replacement owner", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const kind of owners) {
    await openTime(page, kind);
    const result = await page.evaluate(async () => {
      const old = window.timeApi, host = old.element, previous = host.querySelector(".cx-time-button"), plain = structuredClone(window.timeSource.timeSlider.snapshots[0].view);
      old.playback.play(); old.destroy(); old.destroy(); previous.click();
      const retired = [];
      for (const method of ["play", "pause", "step", "seek", "getState"]) {
        try { old.playback[method](0); } catch (error) { retired.push(error.name); }
      }
      plain.label = "Live replacement";
      window.timeApi = CanopyX[plain.type === "matrix" ? "createMatrix" : "createPropagation"](host, { view: plain });
      await window.timeApi.ready; window.dispatchEvent(new Event("beforeprint"));
      return { retired, current: host.canopyx === window.timeApi };
    });
    expect(result).toEqual({ retired: ["AbortError", "AbortError", "AbortError", "AbortError", "AbortError"], current: true });
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(350);
    await expect(page.locator(".cx-time")).toHaveCount(0);
    expect(await page.evaluate(() => window.timeApi.view.label)).toBe("Live replacement");
  }
  expect(errors).toEqual([]);
});

test("destroy during asynchronous history installation cancels it and preserves the replacement", async ({ page }) => {
  for (const kind of owners) {
    const lazy = await lazyTime(page, kind, true);
    try {
      await page.evaluate(() => { window.pendingTime = window.timeApi.update(window.timeHistory).then(() => "installed", error => error.name); });
      await lazy.started;
      await page.evaluate(async () => {
        const old = window.timeApi, host = old.element, plain = structuredClone(window.timeHistory.timeSlider.snapshots[0].view);
        old.destroy(); plain.label = "Replacement during loading";
        window.timeApi = CanopyX[plain.type === "matrix" ? "createMatrix" : "createPropagation"](host, { view: plain });
        await window.timeApi.ready;
      });
      lazy.release();
      expect(await page.evaluate(() => window.pendingTime)).toBe("AbortError");
      await expect(page.locator(".cx-time")).toHaveCount(0);
      expect(await page.evaluate(() => ({ label: window.timeApi.view.label, current: window.timeApi.element.canopyx === window.timeApi })))
        .toEqual({ label: "Replacement during loading", current: true });
    } finally { lazy.release(); }
  }
});

test("ordinary matrix and propagation views never load the optional playback part", async ({ page }) => {
  for (const kind of owners) {
    const loads = await trackScriptLoads(page), lazy = await lazyTime(page, kind);
    await expect(page.locator(kind === "matrix" ? ".cx-matrix" : ".cx-prop")).toBeVisible();
    await expect(page.locator(".cx-time")).toHaveCount(0);
    expect(lazy.requests.filter(name => name.includes("time-slider"))).toEqual([]);
    expect((await loads()).filter(url => url.includes("time-slider"))).toEqual([]);
    lazy.release();
  }
});

test("history rejects nested sliders mismatched frame identities types and unordered timestamps", async ({ page }) => {
  for (const kind of owners) {
    await openTime(page, kind);
    const failures = await page.evaluate(async () => {
      const results = [];
      for (const problem of ["nested", "identity", "type", "duplicate time", "reverse time"]) {
        const input = structuredClone(window.timeSource), snapshots = input.timeSlider.snapshots;
        if (problem === "nested") snapshots[0].view.timeSlider = { snapshots: [] };
        if (problem === "identity") snapshots[0].view.id = "other-view";
        if (problem === "type") snapshots[0].view.type = input.type === "matrix" ? "propagation" : "matrix";
        if (problem === "duplicate time") snapshots[1].at = snapshots[0].at;
        if (problem === "reverse time") snapshots.reverse();
        try { await window.timeApi.update(input); results.push({ problem, error: null }); }
        catch (error) { results.push({ problem, error: error.message }); }
      }
      return results;
    });
    expect(failures.map(item => item.problem)).toEqual(["nested", "identity", "type", "duplicate time", "reverse time"]);
    for (const failure of failures) expect(failure.error, kind + " " + failure.problem).toMatch(/time slider|snapshot/i);
    await expect(page.locator(".cx-time")).toHaveCount(0);
  }
});

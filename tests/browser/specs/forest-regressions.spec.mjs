import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { exampleUrl, examples, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8");
async function explanation(page, kind, compact = false) {
  await page.goto(exampleUrl(kind + ".html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await page.addScriptTag({ content: asset(compact ? "data" : "live") });
  return page.evaluate(async ({ kind, compact }) => {
    const host = document.querySelector("[data-canopyx-host]"), prior = host.canopyx;
    const view = structuredClone(prior.view); prior.destroy(); host.replaceChildren();
    delete view.stateKey; delete view.rowData; view.id = "explanation-regression";
    view.pageSize = 20; view.columns = [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "note", title: "Note", kind: "text" }];
    const rows = Array.from({ length: 800 }, (_, i) => ({ id: "r" + String(i).padStart(4, "0"), cells: { title: "Record " + i, note: "Original evidence " + i } }));
    view.rows = rows;
    if (kind === "path") view.path = { chains: [{ id: "route", label: "Explicit route", hops: [{ record: "r0799" }, { record: "r0000" }, { record: "r0799" }] }] };
    else view.stack = { layers: [{ id: "first", record: "r0000", reason: "Starting context" }, { id: "winner", record: "r0799", reason: "Selected result", winner: true }] };
    if (compact) {
      delete view.rows;
      view.rowData = { version: 1, count: rows.length, columns: ["title", "note"], ordered: true,
        chunks: Array.from({ length: 40 }, (_, i) => rows.slice(i * 20, i * 20 + 20).map(row => [row.id, row.cells.title, row.cells.note])) };
    } else view.live = {};
    window.explanationApi = CanopyX.createDataGrid(host, { view });
    try { await window.explanationApi.ready; return null; } catch (error) { return error.message; }
  }, { kind, compact });
}

test("compact path decodes all chunks before validating explicit references", async ({ page }) => {
  expect(await explanation(page, "path", true)).toBeNull();
  await expect(page.locator(".cx-path-title")).toHaveText(["Record 799", "Record 0", "Record 799"]);
  await page.locator(".cx-path-title").last().click();
  await expect(page.getByRole("dialog")).toContainText("Original evidence 799");
});

for (const kind of ["path", "stack"]) test(kind + " rejects unsupported hosted sources before invoking their query", async ({ page }) => {
  await page.goto(exampleUrl(kind + ".html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  const result = await page.evaluate(async kind => {
    const host = document.querySelector("[data-canopyx-host]"), original = host.canopyx; await original.ready;
    const view = structuredClone(original.view); original.destroy(); host.replaceChildren();
    delete view.rows; view.source = { kind: "host", navigation: "offset" }; let calls = 0, api;
    try {
      api = CanopyX.createDataGrid(host, { view, source: { query() { calls++; throw new Error("Unexpected remote query"); } } });
      await api.ready; return { calls, error: null };
    } catch (error) { return { calls, error: error.message }; } finally { api?.destroy(); }
  }, kind);
  expect(result.error).toMatch(new RegExp(kind)); expect(result.calls).toBe(0);
});

for (const kind of ["path", "stack"]) test(kind + " refreshes uncached records and retires removed references without retaining old evidence", async ({ page }) => {
  expect(await explanation(page, kind)).toBeNull();
  expect(await page.evaluate(() => explanationApi.getLoadedRows(["r0799"]))).toEqual([]);
  await page.evaluate(() => explanationApi.updateRows([{ id: "r0799", cells: { title: "Updated record", note: "Current evidence" } }]));
  const button = page.locator(kind === "path" ? ".cx-path-title" : ".cx-stack-winner .cx-stack-title").first();
  await expect(button).toHaveText("Updated record"); await button.click();
  await expect(page.getByRole("dialog")).toContainText("Current evidence");
  await page.keyboard.press("Escape");
  await page.evaluate(() => explanationApi.removeRows(["r0799"]));
  await expect(page.locator(kind === "path" ? ".cx-path-title" : ".cx-stack-title")).toHaveCount(0);
  await expect(page.locator(".cx-grid-notice")).toBeVisible();
  const error = await page.evaluate(async () => { try { await explanationApi.openRecord("r0799"); return null; } catch (error) { return error.message; } });
  expect(error).toMatch(/not available/i); await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const kind of ["path", "stack"]) test(kind + " late drawer close preserves subsequent occurrence focus and honors an explicit return target", async ({ page }) => {
  expect(await explanation(page, kind)).toBeNull();
  const selector = kind === "path" ? ".cx-path-title" : ".cx-stack-title";
  await page.locator(selector).last().click(); await expect(page.getByRole("dialog")).toBeVisible();
  const kept = await page.evaluate(selector => {
    const dialog = document.querySelector("dialog.cx-drawer"), target = document.querySelector(selector);
    const settled = new Promise(resolve => dialog.addEventListener("close", () => resolve(document.activeElement === target), { once: true }));
    dialog.close(); target.focus(); return settled;
  }, selector);
  expect(kept).toBe(true);
  await page.evaluate(async selector => {
    const buttons = document.querySelectorAll(selector); buttons[buttons.length - 1].focus();
    await explanationApi.openRecord("r0799", { returnFocus: buttons[0] }); document.querySelector("dialog.cx-drawer").close();
  }, selector);
  await expect(page.locator(selector).first()).toBeFocused();
});

async function timeOwner(page, kind, missingPart = false) {
  const origin = "https://canopyx-forest-errors.test";
  let html = fs.readFileSync(path.join(examples, "time-" + kind + ".html"), "utf8")
    .replace("data-canopyx-host data-cx-theme=", 'data-canopyx-host data-cx-mount="manual" data-cx-theme=');
  if (missingPart) html = html.replace(/<script\b[^>]*type="application\/x-canopyx-time-slider(?:-style)?"[^>]*>[\s\S]*?<\/script>/g, "");
  await page.route(origin + "/**", route => new URL(route.request().url()).pathname === "/" ? route.fulfill({ contentType: "text/html", body: html }) : route.abort());
  await page.goto(origin + "/");
  await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]");
    window.errorSource = JSON.parse(host.querySelector("script.cx-config").textContent);
    errorSource.timeSlider.initial = 0;
    window.ownerErrors = []; host.addEventListener("canopyx:error", event => ownerErrors.push(event.detail.error.message));
    window.errorApi = CanopyX[errorSource.type === "matrix" ? "createMatrix" : "createPropagation"](host, { view: errorSource });
    try { await errorApi.ready; window.installError = null; } catch (error) { window.installError = error.message; }
  });
}

for (const kind of ["matrix", "propagation"]) {
  test(kind + " initial playback load failure reports visibly and retires unselected parent evidence", async ({ page }) => {
    await timeOwner(page, kind, true);
    expect(await page.evaluate(() => installError)).toMatch(/snapshot playback|time.slider/i);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".cx-matrix,.cx-prop,.cx-time")).toHaveCount(0);
    expect(await page.evaluate(() => ownerErrors.length)).toBe(1);
  });
  test(kind + " rejected history retires stale evidence and recovers through the same owner", async ({ page }) => {
    await timeOwner(page, kind);
    const rejected = await page.evaluate(async () => {
      const wrong = structuredClone(errorSource); wrong.timeSlider.snapshots[0].view.id = "another-view";
      try { await errorApi.update(wrong); return null; } catch (error) { return error.message; }
    });
    expect(rejected).toMatch(/same view type and id/);
    await expect(page.getByRole("alert")).toBeVisible(); await expect(page.locator(".cx-matrix,.cx-prop,.cx-time")).toHaveCount(0);
    await page.evaluate(async () => {
      const recovery = structuredClone(errorSource.timeSlider.snapshots[0].view); recovery.label = "Recovered evidence";
      await errorApi.update(recovery);
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(kind === "matrix" ? ".cx-matrix" : ".cx-prop")).toBeVisible();
    expect(await page.evaluate(() => errorApi.view.label)).toBe("Recovered evidence");
  });
}

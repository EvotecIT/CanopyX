import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { nextFrames, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const hfxCss = fs.readFileSync(path.join(repo, "tests/fixtures/hfx-role-host.css"), "utf8");
const DARK = { surface: "rgb(22, 24, 28)", text: "rgb(242, 243, 245)" };
const LIGHT = { surface: "rgb(255, 255, 255)", text: "rgb(22, 24, 28)" };
const grid = () => ({ protocol: "canopyx/2", type: "grid", id: "edges", label: "Token edge records",
  source: { kind: "inline" }, rowHeight: 34, pageSize: 20, selection: "none",
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }, { id: "state", title: "State", kind: "text" }],
  rows: [{ id: "one", cells: { name: "One record", state: "Ready" } }, { id: "two", cells: { name: "Two records", state: "Waiting" } }] });

// Only the grid entry point is eager: optional views and facets load their shipped parts over HTTP.
async function mount(page, create, view, { scope = "", host = "", css = "", hfx = false } = {}) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://canopyx.test/assets/*", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ contentType: name.endsWith(".css") ? "text/css" : "text/javascript", body: asset(name) });
  });
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Token edges</title>
    <link rel="stylesheet" href="/assets/canopyx-grid.css"><style>${hfx ? hfxCss : ""}\n${css}</style>
    <script src="/assets/canopyx-grid.js"></script></head><body>
    <section id="scope" ${scope}><div id="host" ${host}></div></section></body></html>`;
  await page.route("http://canopyx.test/edges", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/edges");
  await page.evaluate(async ({ create, view }) => {
    window.api = CanopyX[create](document.getElementById("host"), { view });
    await window.api.ready;
  }, { create, view });
  await nextFrames(page);
  expect(errors).toEqual([]);
}

async function palette(element, expected) {
  await expect(element).toHaveCSS("color-scheme", "dark");
  await expect(element).toHaveCSS("background-color", expected.surface);
  await expect(element).toHaveCSS("color", expected.text);
}

const lazyViews = [
  ["matrix", "createMatrix", ".cx-matrix", () => JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/matrix-small.json"), "utf8"))],
  ["diff", "createDiff", ".cx-diff", () => ({ protocol: "canopyx/2", type: "diff", id: "diff", label: "Record notes", before: "old\n", after: "new\n" })],
  ["change list", "createChangeList", ".cx-changes", () => ({ protocol: "canopyx/2", type: "changes", id: "changes", label: "Record changes",
    items: [{ id: "item", kind: "added", path: "notes.txt" }] })],
  ["propagation", "createPropagation", ".cx-prop", () => ({ protocol: "canopyx/2", type: "propagation", id: "propagation", label: "Record propagation",
    witnesses: [{ id: "replica", label: "Replica", state: "converged" }] })]
];

for (const [name, create, root, document] of lazyViews) {
  test(`lazy ${name} roots inherit an actual HFX dark parent under either OS scheme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mount(page, create, document(), { hfx: true, scope: 'data-hfx-style="evotec" data-hfx-mode="dark"' });
    const host = page.locator("#host"), view = host.locator(root);
    await expect(view).toBeVisible();
    for (const scheme of ["light", "dark", "light"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await palette(host, DARK);
      await expect(view).toHaveCSS("color-scheme", "dark");
      await expect(view).toHaveCSS("color", DARK.text);
      await expect(host).not.toHaveAttribute("data-cx-theme");
      await expect(host.locator('[data-cx-theme="auto"]')).toHaveCount(0);
    }
  });
}

for (const source of ["inline", "stylesheet"]) {
  test(`watchTheme preserves an explicit ${source} host scheme over legacy light and restores its marker on destroy`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const previous = source === "stylesheet" ? ' data-cx-fallback-mode="auto"' : "";
    await mount(page, "createDataGrid", grid(), {
      host: `data-cx-theme="light"${previous}${source === "inline" ? ' style="color-scheme:dark"' : ""}`,
      css: source === "stylesheet" ? "#host { color-scheme:dark; } #host.light-scheme { color-scheme:light; }" : ""
    });
    const host = page.locator("#host");
    await palette(host, DARK);
    await expect(host).toHaveAttribute("data-cx-theme", "light");
    expect(await host.evaluate(element => element.style.colorScheme)).toBe(source === "inline" ? "dark" : "");
    await host.evaluate((element, source) => {
      if (source === "inline") element.style.colorScheme = "light";
      else element.classList.add("light-scheme");
    }, source);
    await expect(host).toHaveCSS("color-scheme", "light");
    await expect(host).toHaveCSS("background-color", LIGHT.surface);
    await expect(host).toHaveCSS("color", LIGHT.text);
    await page.evaluate(() => api.destroy());
    if (previous) await expect(host).toHaveAttribute("data-cx-fallback-mode", "auto");
    else await expect(host).not.toHaveAttribute("data-cx-fallback-mode");
    expect(await host.evaluate(element => element.style.colorScheme)).toBe(source === "inline" ? "light" : "");
    await expect(host).toHaveCSS("color-scheme", "light");
  });
}

test("watchTheme releases its fallback marker when a parent supplies surface roles and restores the previous marker", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mount(page, "createDataGrid", grid(), { host: 'data-cx-theme="light" data-cx-fallback-mode="auto"' });
  const host = page.locator("#host");
  await expect(host).toHaveAttribute("data-cx-fallback-mode", "light");
  await page.locator("#scope").evaluate(element => {
    element.style.colorScheme = "dark";
    element.style.setProperty("--hfx-color-surface", "rgb(18, 27, 36)");
    element.style.setProperty("--hfx-color-text", "rgb(240, 245, 250)");
  });
  await expect(host).not.toHaveAttribute("data-cx-fallback-mode");
  await palette(host, { surface: "rgb(18, 27, 36)", text: "rgb(240, 245, 250)" });
  await page.evaluate(() => api.destroy());
  await expect(host).toHaveAttribute("data-cx-fallback-mode", "auto");
  await expect(page.locator("#scope")).toHaveCSS("color-scheme", "dark");
});

test.describe("script-free static fallback", () => {
  test.use({ javaScriptEnabled: false });
  for (const attribute of ["data-theme", "data-cx-theme"]) {
    test(`a static ${attribute}=dark selects light-dark fallbacks without a color-scheme meta tag`, async ({ page }) => {
      // The static renderer's inline role consumption, isolated from page-level theme declarations.
      const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Static token edges</title>
        <style>${asset("canopyx.css")}</style></head><body><main><div class="cx-static" ${attribute}="dark">
        <table style="color:#16181c;color:var(--hfx-color-text,light-dark(#16181c,#f2f3f5));background:#fff;background:var(--hfx-color-surface,light-dark(#fff,#16181c))">
        <caption>Static records</caption><tbody><tr><th scope="row">Record</th><td>Ready</td></tr></tbody></table>
        </div></main></body></html>`;
      await page.route("http://canopyx.test/static-edges", route => route.fulfill({ contentType: "text/html", body }));
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("http://canopyx.test/static-edges");
      await expect(page.locator('meta[name="color-scheme"]')).toHaveCount(0);
      await expect(page.locator("script")).toHaveCount(0);
      const wrapper = page.locator("main .cx-static"), table = wrapper.locator(":scope > table");
      await expect(wrapper).toHaveAttribute(attribute, "dark");
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await palette(table, DARK);
        expect(await table.evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-surface"))).toBe("");
      }
    });
  }
});

for (const profile of ["contrast", "custom", "standalone"]) {
  test(`facets retain ${profile} dark roles as a desktop sibling and a body-mounted phone sheet`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    const view = grid(); view.facets = { columns: ["state"] };
    const expected = profile === "contrast" ? { surface: "rgb(10, 10, 10)", text: "rgb(255, 255, 255)" }
      : profile === "custom" ? { surface: "rgb(18, 27, 36)", text: "rgb(240, 245, 250)" } : DARK;
    await mount(page, "createDataGrid", view, {
      hfx: profile !== "standalone",
      scope: profile === "standalone" ? "" : `data-hfx-style="${profile === "contrast" ? "contrast" : "evotec"}" data-hfx-mode="dark" data-hfx-density="compact"`,
      host: profile === "standalone" ? 'data-cx-theme="dark"' : profile === "custom"
        ? 'style="--hfx-color-surface:rgb(18,27,36);--hfx-color-text:rgb(240,245,250);--hfx-color-accent:rgb(155,77,202);--hfx-radius-control:13px;color-scheme:dark"' : ""
    });
    const host = page.locator("#host"), panel = page.getByRole("complementary", { name: "Refine" });
    await expect(panel.getByRole("checkbox")).toHaveCount(2);
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(element => element.parentNode === document.getElementById("host").parentNode && !document.getElementById("host").contains(element))).toBe(true);
    await palette(host, expected);
    await palette(panel, expected);
    if (profile === "custom") {
      await expect(panel).toHaveCSS("border-radius", "13px");
      await expect(panel.getByRole("checkbox").first()).toHaveCSS("accent-color", "rgb(155, 77, 202)");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeHidden();
    const open = page.locator(".cx-facets-open");
    await expect(open).toBeVisible();
    await open.click();
    const sheet = page.getByRole("dialog", { name: "Refine" });
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate(element => element.parentNode === document.body)).toBe(true);
    await palette(sheet, expected);
    await palette(panel, expected);
    await expect(sheet.getByRole("checkbox").first()).toHaveCSS("color-scheme", "dark");
    if (profile !== "standalone") {
      await expect(sheet).toHaveAttribute("data-hfx-style", profile === "contrast" ? "contrast" : "evotec");
      await expect(sheet).toHaveAttribute("data-hfx-mode", "dark");
      await expect(sheet).toHaveAttribute("data-hfx-density", "compact");
    }
    if (profile === "custom") {
      await expect(sheet.getByRole("checkbox").first()).toHaveCSS("accent-color", "rgb(155, 77, 202)");
    }
    await sheet.getByRole("checkbox", { name: /^Ready,/ }).check();
    await expect.poll(() => page.evaluate(() => api.getPaging().matched)).toBe(1);
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(panel).toBeVisible();
    await palette(panel, expected);
    if (profile === "custom") await expect(panel).toHaveCSS("border-radius", "13px");
    await expect(panel.getByRole("checkbox", { name: /^Ready,/ })).toBeChecked();
  });
}

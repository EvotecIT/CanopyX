import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

function records(type = "grid", density) {
  const rows = Array.from({ length: 60 }, (_, index) => ({ id: "record-" + index,
    cells: { name: "Record " + index, state: { value: "Ready", tone: "success", badges: [{ text: "Ready", tone: "success" }] }, count: index } }));
  return { protocol: "canopyx/2", type: type === "tree" ? "view" : "grid", id: "tokens", label: "Records", source: { kind: "inline" },
    search: true, selection: "multiple", pageSize: 100, ...(density ? { density } : {}),
    columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true, sortable: true },
      { id: "state", title: "State", kind: "text" }, { id: "count", title: "Count", kind: "number" }],
    ...(type === "tree" ? { roots: rows.map(row => ({ ...row, label: row.cells.name })) } : { rows, reporting: { headerFilters: true } }) };
}

const hfxHostCss = fs.readFileSync(path.join(repo, "tests/fixtures/hfx-role-host.css"), "utf8");

async function open(page, options = {}) {
  if (!options.standalone && options.attributes?.["data-hfx-mode"] && !options.attributes["data-hfx-style"]) options.attributes["data-hfx-style"] = "evotec";
  const attributes = Object.entries(options.attributes || {}).map(([key, value]) => `${key}="${value}"`).join(" ");
  const groups = options.view?.columnGroups ? `<style>${fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-column-groups.css"), "utf8")}</style>`
    + `<script>${fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-column-groups.js"), "utf8")}</script>` : "";
  const html = viewPage(options.view || records(options.type, options.density)).replace('<html lang="en">', `<html lang="en" ${attributes}>`)
    .replace('data-canopyx-host data-cx-theme="light"', options.legacy ? `data-canopyx-host data-cx-theme="${options.legacy}"` : "data-canopyx-host")
    .replace("</head>", groups + (!options.standalone && options.attributes?.["data-hfx-style"] ? `<style>${hfxHostCss}</style>` : "") + (options.configure ? `<script>${options.configure}</script>` : "") + "</head>");
  await page.route("http://canopyx.test/tokens", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/tokens");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toBeVisible();
}

for (const type of ["grid", "tree"]) {
  test(`${type} standalone headers keep the caption recipe in both schemes and densities`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, { type, standalone: true });
    const header = page.locator('.cx-hcell[data-cx-column="name"]');
    for (const mode of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: mode });
      await expect(header).toHaveCSS("font-size", "12px");
      await expect(header).toHaveCSS("font-weight", "600");
      await expect.poll(() => header.evaluate(el => parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(16.2, 3);
      await expect(header).toHaveCSS("align-items", "center");
      await expect(header.locator(".cx-sort")).toHaveCSS("font-size", "12px");
      await expect(header).toHaveCSS("color", mode === "dark" ? "rgb(176, 180, 188)" : "rgb(77, 82, 91)");
      await expect(page.locator(".cx-head")).toHaveCSS("background-color", mode === "dark" ? "rgb(17, 19, 23)" : "rgb(247, 248, 249)");
    }
    await expect(page.locator(".cx-hrow")).toHaveCSS("height", "40px");
    await page.evaluate(() => document.documentElement.dataset.hfxDensity = "compact");
    await expect(page.locator(".cx-hrow")).toHaveCSS("height", "32px");
    await expect(header).toHaveCSS("font-size", "12px");
  });

  test(`${type} host header overrides reach sorted labels and opaque pinned headers`, async ({ page }) => {
    const view = records(type);
    if (type === "tree") view.pinTreeColumn = true; else view.columns[0].pinned = "left";
    if (type === "grid") view.columnGroups = [{ id: "identity", title: "Identity", columns: ["name"] }];
    await open(page, { view, attributes: { "data-hfx-style": "evotec", "data-hfx-mode": "light" } });
    await page.addStyleTag({ content: `[data-canopyx-host] { --hfx-table-header-size:15px; --hfx-table-header-weight:500;
      --hfx-table-header-line-height:1.6; --hfx-table-header-color:rgb(42,69,90); --hfx-table-header-background:rgb(201,213,225); }` });
    const header = page.locator('.cx-hcell[data-cx-column="name"]'), label = header.locator(".cx-sort");
    if (type === "grid") await expect(header).toHaveAttribute("data-cx-pin", "left");
    else { await expect(page.locator("[data-canopyx-host]")).toHaveClass(/cx-pin-tree/); await expect(header).toHaveCSS("position", "sticky"); }
    await label.click(); await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(header).toHaveCSS("font-size", "15px");
    await expect(header).toHaveCSS("font-weight", "500");
    await expect(header).toHaveCSS("line-height", "24px");
    await expect(label).toHaveCSS("color", "rgb(42, 69, 90)");
    await expect(label).toHaveCSS("font-size", "15px");
    await expect(page.locator(".cx-head")).toHaveCSS("background-color", "rgb(201, 213, 225)");
    await expect(header).toHaveCSS("background-color", "rgb(201, 213, 225)");
    if (type === "grid") {
      const group = page.locator('.cx-hgroup[data-cx-group="identity"]');
      await expect(group).toHaveCSS("color", "rgb(42, 69, 90)");
      await expect(group).toHaveCSS("font-size", "15px");
      await expect(group).toHaveCSS("font-weight", "500");
      await expect(group).toHaveCSS("line-height", "24px");
      await expect(group).toHaveCSS("background-color", "rgb(201, 213, 225)");
    }
    const centered = await label.evaluate(element => {
      const label = element.getBoundingClientRect(), cell = element.closest(".cx-hcell").getBoundingClientRect();
      return Math.abs(label.top + label.height / 2 - cell.top - cell.height / 2);
    });
    expect(centered).toBeLessThanOrEqual(1);
  });
}

test("optional header colours follow a dark theme island inside a light host", async ({ page }) => {
  const view = records(); view.columns[0].pinned = "left";
  await open(page, { view, attributes: { "data-hfx-style": "evotec", "data-hfx-mode": "light" } });
  await page.locator("[data-canopyx-host]").evaluate(host => {
    const island = document.createElement("section"); island.dataset.hfxStyle = "evotec"; island.dataset.hfxMode = "dark";
    host.before(island); island.append(host);
  });
  const header = page.locator('.cx-hcell[data-cx-column="name"]');
  await expect(header).toHaveCSS("color", "rgb(176, 180, 188)");
  await expect(page.locator(".cx-head")).toHaveCSS("background-color", "rgb(17, 19, 23)");
  await expect(header).toHaveCSS("background-color", "rgb(17, 19, 23)");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--hfx-color-text-secondary").trim())).toBe("#4d525b");
});

for (const [mode, surface, text] of [["light", "rgb(255, 255, 255)", "rgb(22, 24, 28)"], ["dark", "rgb(22, 24, 28)", "rgb(242, 243, 245)"]]) {
  test(`shared ${mode} roles theme typography, status and body-mounted overlays`, async ({ page }) => {
    await open(page, { attributes: { "data-hfx-style": "evotec", "data-hfx-mode": mode, "data-hfx-density": "compact" } });
    const host = page.locator("[data-canopyx-host]");
    await expect(host).toHaveCSS("background-color", surface);
    await expect(host).toHaveCSS("color", text);
    expect(await host.evaluate(element => getComputedStyle(element).fontFamily)).toContain("Segoe UI Variable Text");
    const badge = page.locator(".cx-badge").first();
    await expect(badge).toHaveCSS("border-radius", "4px");
    expect(await badge.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Menu for Count", exact: true }).click();
    await page.getByRole("menuitem", { name: "Filter…", exact: true }).click();
    const filter = page.getByRole("dialog", { name: "Count: Filter…", exact: true });
    await expect(filter).toHaveAttribute("data-hfx-style", "evotec");
    await expect(filter).toHaveAttribute("data-hfx-density", "compact");
    await expect(filter).toHaveCSS("border-radius", "10px");
    expect(await filter.evaluate(element => getComputedStyle(element).colorScheme)).toBe(mode);
    await filter.getByRole("combobox", { name: "Condition", exact: true }).press("Escape");
    await expect(filter).not.toBeVisible();
  });
}

for (const type of ["grid", "tree"]) {
  test(`${type} inherits compact density and updates virtual row positions when the host changes it`, async ({ page }) => {
    await open(page, { type, attributes: { "data-hfx-density": "compact" } });
    const row = page.locator('.cx-canvas .cx-row[data-cx-id]').first();
    await expect(row).toHaveCSS("height", "32px");
    await expect(page.locator(".cx-hrow")).toHaveCSS("height", "32px");
    await page.evaluate(() => document.documentElement.dataset.hfxDensity = "comfortable");
    await expect(row).toHaveCSS("height", "40px");
    await expect(page.locator(".cx-hrow")).toHaveCSS("height", "40px");
    const positions = await page.locator('.cx-canvas .cx-row[data-cx-id]').evaluateAll(rows => rows.slice(0, 3).map(row => row.getBoundingClientRect().top));
    expect(positions[1] - positions[0]).toBe(40);
    expect(positions[2] - positions[1]).toBe(40);
  });
}

test("inherited host density wins over the grid option and unlayered roles win over standalone values", async ({ page }) => {
  await open(page, { density: "comfortable", attributes: { "data-hfx-density": "compact", "data-bs-theme": "dark" } });
  await page.addStyleTag({ content: "html { --hfx-color-surface: rgb(24, 30, 39); --hfx-font-sans: monospace; --hfx-radius-overlay: 16px; }" });
  const host = page.locator("[data-canopyx-host]");
  await expect(host).toHaveCSS("background-color", "rgb(24, 30, 39)");
  await expect(host).toHaveCSS("font-family", "monospace");
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toHaveCSS("height", "32px");
});

test("the standalone compact option applies shared header, control, type and cell metrics", async ({ page }) => {
  await open(page, { density: "compact" });
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toHaveCSS("height", "32px");
  await expect(page.locator(".cx-hrow")).toHaveCSS("height", "32px");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCSS("height", "28px");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCSS("font-size", "13px");
  await expect(page.locator('.cx-canvas .cx-cell').first()).toHaveCSS("padding-left", "8px");
});

test("a density change preserves the intra-row scroll position of a tall automatic-height record", async ({ page }) => {
  const view = records(); view.autoRowHeight = true;
  const configure = `CanopyX.configure('tokens', { renderers: { name(row, element) {
    if (row.id !== 'record-0') return false;
    element.textContent = 'A tall host-rendered record'; element.style.height = '1600px'; return true;
  } } });`;
  await open(page, { view, configure, attributes: { "data-hfx-density": "comfortable" } });
  expect(await page.locator('.cx-row[data-cx-id="record-0"]').evaluate(row => row.offsetHeight)).toBeGreaterThan(1000);
  await page.locator(".cx-grid").evaluate(grid => grid.scrollTop = 400);
  await expect.poll(() => page.locator(".cx-grid").evaluate(grid => grid.scrollTop)).toBe(400);
  await page.evaluate(() => document.documentElement.dataset.hfxDensity = "compact");
  await expect(page.locator(".cx-hrow")).toHaveCSS("height", "32px");
  await expect.poll(() => page.locator(".cx-grid").evaluate(grid => Math.abs(grid.scrollTop - 400))).toBeLessThanOrEqual(2);
});

test("printing a dark tree uses light semantic roles on its script-generated outline", async ({ page }) => {
  await open(page, { type: "tree", legacy: "dark" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("[data-canopyx-host]")).toHaveCSS("color", "rgb(22, 24, 28)");
  await expect(page.locator("[data-canopyx-host]")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".cx-outline-table")).toBeVisible();
  await expect(page.locator(".cx-outline-table")).toHaveCSS("color", "rgb(22, 24, 28)");
});

for (const trigger of ["data-theme", "data-hfx-mode", "data-bs-theme", "data-hfx-tokens", "data-hfx-theme", "data-cx-theme"]) {
  test(`standalone dark mode accepts ${trigger}`, async ({ page }) => {
    await open(page, trigger === "data-cx-theme" ? { legacy: "dark" } : { standalone: true, attributes: { [trigger]: "dark" } });
    await expect(page.locator("[data-canopyx-host]")).toHaveCSS("background-color", "rgb(22, 24, 28)");
  });
}

test("automatic contrast follows the preference and an explicit theme keeps its palette", async ({ page }) => {
  await page.emulateMedia({ contrast: "more", colorScheme: "dark" });
  await open(page, { attributes: { "data-hfx-style": "contrast", "data-hfx-mode": "dark" } });
  await expect(page.locator("[data-canopyx-host]")).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await page.evaluate(() => document.documentElement.dataset.hfxStyle = "evotec");
  await expect(page.locator("[data-canopyx-host]")).toHaveCSS("background-color", "rgb(22, 24, 28)");
});

test("the chart palette retains the revised categorical order in light and dark modes", async ({ page }) => {
  await open(page, { attributes: { "data-hfx-mode": "light" } });
  const palette = () => page.locator("[data-canopyx-host]").evaluate(element => {
    const css = getComputedStyle(element);
    return Array.from({ length: 6 }, (_, index) => css.getPropertyValue("--hfx-color-series-" + (index + 1)).trim());
  });
  expect(await palette()).toEqual(["#2a78d6", "#046d5f", "#7b61e8", "#c24fa8", "#5b7f00", "#1d4f9e"]);
  await page.evaluate(() => document.documentElement.dataset.hfxMode = "dark");
  expect(await palette()).toEqual(["#3987e5", "#117d6d", "#8a74ee", "#c9579f", "#6f9120", "#7b9be8"]);
});

test("all five host styles switch modes without leaking another style's roles", async ({ page }) => {
  await open(page, { attributes: { "data-hfx-style": "evotec", "data-hfx-mode": "light" } });
  const expected = {
    evotec: ["#ffffff", "#16181c"], neutral: ["#ffffff", "#181818"],
    slate: ["#ffffff", "#141b26"], warm: ["#fffdf9", "#1c1814"], contrast: ["#ffffff", "#0a0a0a"]
  };
  for (const [style, surfaces] of Object.entries(expected)) for (const [index, mode] of ["light", "dark"].entries()) {
    await page.evaluate(({ style, mode }) => { document.documentElement.dataset.hfxStyle = style; document.documentElement.dataset.hfxMode = mode; }, { style, mode });
    expect(await page.locator("[data-canopyx-host]").evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-surface").trim()), style + "/" + mode).toBe(surfaces[index]);
  }
});

test("keyboard focus, row ARIA and contrast remain usable with shared roles", async ({ page }) => {
  await open(page, { attributes: { "data-hfx-style": "contrast", "data-hfx-mode": "dark" } });
  const row = page.locator('.cx-canvas .cx-row[data-cx-id]').first();
  await row.focus();
  await row.press("ArrowDown");
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').nth(1)).toBeFocused();
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').nth(1)).toHaveCSS("outline-offset", "-2px");
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').nth(1)).toHaveAttribute("aria-rowindex", "3");
  const result = await new AxeBuilder({ page }).include("[data-canopyx-host]").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => item.id + ": " + item.nodes.map(node => node.target.join(" ")).join(", "))).toEqual([]);
});

for (const mode of ["light", "dark"]) test(`a standalone grid has ${mode} fallbacks without defining shared roles`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: mode });
  await open(page);
  const host = page.locator("[data-canopyx-host]");
  await expect(host).toHaveCSS("background-color", mode === "dark" ? "rgb(22, 24, 28)" : "rgb(255, 255, 255)");
  expect(await host.evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-surface"))).toBe("");
});

test("an explicit Canopy fallback mode never replaces an inherited custom accent", async ({ page }) => {
  await open(page, { legacy: "light", configure: `document.documentElement.style.setProperty('--hfx-color-accent', '#9b4dca');` });
  const host = page.locator("[data-canopyx-host]");
  expect(await host.evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-accent").trim())).toBe("#9b4dca");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').dataset.theme = 'dark');
  expect(await host.evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-accent").trim())).toBe("#9b4dca");
  await expect(host).toHaveCSS("background-color", "rgb(22, 24, 28)");
});

test("mounting inside a High contrast parent preserves its resolved roles", async ({ page }) => {
  await open(page, { attributes: { "data-hfx-style": "contrast", "data-hfx-mode": "dark" } });
  const host = page.locator("[data-canopyx-host]");
  await expect(host).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(host).toHaveCSS("color", "rgb(255, 255, 255)");
  expect(await host.evaluate(element => element.style.getPropertyValue("--hfx-color-surface"))).toBe("");
});

test("a custom accent on an HFX dark parent reaches the grid unchanged", async ({ page }) => {
  await open(page, { attributes: { "data-hfx-style": "evotec", "data-hfx-mode": "dark" }, configure: `document.documentElement.style.setProperty('--hfx-color-accent', '#9b4dca');` });
  const host = page.locator("[data-canopyx-host]");
  await expect(host).toHaveCSS("background-color", "rgb(22, 24, 28)");
  expect(await host.evaluate(element => getComputedStyle(element).getPropertyValue("--hfx-color-accent").trim())).toBe("#9b4dca");
  expect(await host.evaluate(element => element.style.getPropertyValue("--hfx-color-accent"))).toBe("");
  await expect(page.locator(".cx-grid-header-filter").first()).toHaveCSS("color", "rgb(155, 77, 202)");
});

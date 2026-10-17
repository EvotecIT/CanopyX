// The tree toolbar menus' texts are labels of every tree runtime: on the core and interactive runtimes a view or host
// translates them like the core's own texts, and a translated .NET tree stays on a tree runtime.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames, openExample } from "./support.mjs";

const polish = { columns: "Kolumny", gridViews: "Widoki", gridExport: "Eksport", gridMore: "Więcej", gridPrint: "Drukuj",
  gridDownloadCsv: "Pobierz CSV", gridCopy: "Kopiuj", gridVisibleRows: "Widoczne wiersze", gridAllRows: "Wszystkie wiersze",
  gridSaveView: "Zapisz widok", gridResetView: "Przywróć widok", gridShowAllColumns: "Pokaż wszystkie", gridFindColumn: "Znajdź kolumnę…" };
const view = (labels, patch = {}) => ({ protocol: "canopyx/2", type: "view", id: "translated", label: "Struktura", pageSize: 50, selection: "multiple",
  stateKey: "translated-tree", source: { kind: "inline" }, labels, columns: [{ id: "name", title: "Nazwa" }, { id: "size", title: "Rozmiar", kind: "number" }],
  roots: [{ id: "a", label: "Alfa", cells: { size: 1 }, children: [{ id: "a1", label: "Alfa jeden", cells: { size: 2 } }] }, { id: "b", label: "Beta", cells: { size: 3 } }], ...patch });

async function open(page, document, script = "") {
  const html = viewPage(document).replace("</head>", script ? "<script>" + script + "</script></head>" : "</head>");
  await page.setViewportSize({ width: 1100, height: 700 });
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.route("http://canopyx.test/labels", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/labels");
  await page.waitForSelector("[data-cx-ready], .cx-mount-error");
  await nextFrames(page);
}
const summaries = page => page.locator(".cx-toolbar > details > summary").evaluateAll(items => items.map(item => item.textContent.trim() || item.getAttribute("aria-label")));
async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }

for (const [runtime, patch] of [["core", {}], ["interactive", { checkboxes: "independent" }]]) {
  test("the " + runtime + " runtime shows the tree menus in the view's language", async ({ page }) => {
    await open(page, view(polish, patch));
    expect(await page.evaluate(() => typeof CanopyX.createDataGrid)).toBe("undefined");
    expect(await page.evaluate(() => [CanopyX.labels.gridViews, CanopyX.labels.gridExport, CanopyX.labels.gridResponsiveHidden]))
      .toEqual(["Views", "Export", "Hidden at this width"]);
    expect(await summaries(page)).toEqual(["Kolumny", "Widoki", "Eksport", "Więcej"]);
    await page.locator(".cx-grid-export > summary").click();
    const panel = page.locator(".cx-grid-export .cx-grid-panel");
    await expect(panel.getByRole("button", { name: "Pobierz CSV", exact: true })).toBeVisible();
    await expect(panel.locator("option")).toContainText(["Widoczne wiersze"]);
    if (runtime === "core") await capture(page, "tree-menus-translated-core-runtime");
    await page.keyboard.press("Escape");
    await page.locator(".cx-grid-views > summary").click();
    await expect(page.locator(".cx-grid-views").getByRole("button", { name: "Zapisz widok", exact: true })).toBeVisible();
    await page.locator(".cx-grid-overflow > summary").click();
    await expect(page.locator(".cx-grid-overflow").getByRole("button", { name: "Drukuj", exact: true })).toBeVisible();
    expect(page.errors).toEqual([]);
  });
}

test("a host translates the tree menus through configure on the core runtime; unknown names stay errors", async ({ page }) => {
  await open(page, view(undefined), "CanopyX.configure(\"translated\",{labels:{gridExport:\"Exportieren\",gridMore:\"Mehr\"}});");
  expect(await summaries(page)).toEqual(["Columns", "Views", "Exportieren", "Mehr"]);
  await page.unrouteAll();
  await open(page, view({ gridSortAscending: "Sortuj" }));
  await expect(page.locator(".cx-mount-error")).toContainText("there is no label 'gridSortAscending'");
});

test("a .NET tree with a complete pack keeps a tree runtime and translated menus", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await openExample(page, "localized-tree-pl.html");
  expect(await page.evaluate(() => [typeof CanopyX.createDataGrid, !!CanopyX.labels.actions])).toEqual(["undefined", true]);
  expect(await page.locator(".cx-toolbar > details > summary").evaluateAll(items => items.slice(0, 3).map(item => item.textContent.trim())))
    .toEqual(["Kolumny", "Widoki", "Eksportuj"]);
  await capture(page, "tree-menus-translated-dotnet-pl");
});

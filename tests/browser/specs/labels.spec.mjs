// Every text the runtime writes itself comes from its labels: English by default, the view document's translations,
// then the host's own on top. Host data (node labels, column titles, cells) is never translated.
import { expect, test } from "@playwright/test";
import { runtimeAssets, viewPage } from "./support.mjs";

const polish = {
  searchResults: "Wyniki wyszukiwania", searchResultCount: "Wyniki: {count}", searchResultCountOfTotal: "Wyniki: {count} z {total}",
  searchNoResults: "Brak wyników", searchTooShort: "Wpisz co najmniej {min} znaki", columns: "Kolumny", visibleColumns: "Widoczne kolumny",
  resizeColumn: "Zmień szerokość: {column}", columnWidth: "{width} pikseli", loading: "Wczytywanie…",
  loadError: "Nie wczytano: {error}", showMore: "Pokaż więcej (wczytano {loaded} z {total})", pageLoaded: "Wczytano {loaded} z {total}",
  itemsLoaded: "Elementy: {count}", yes: "Tak", no: "Nie", utcTime: "{time} (UTC)", localTime: "{time} (czas lokalny)",
  mountError: "Nie można wyświetlić widoku: {error}"
};

const view = { protocol: "canopyx/1", type: "view", id: "labelled", label: "Pliki", rowHeight: 28, pageSize: 2, selection: "single",
  labels: polish, search: { minLength: 2, maxResults: 1, placeholder: "Szukaj plików" },
  columns: [{ id: "name", title: "Nazwa", width: 240, kind: "text" }, { id: "done", title: "Gotowe", width: 90, kind: "text" },
    { id: "when", title: "Kiedy", width: 180, kind: "datetime" }],
  source: { kind: "inline" },
  roots: [{ id: "folder", label: "Folder", expanded: true, children: [
    { id: "a", label: "Alfa", cells: { done: true, when: "2026-09-27T10:15:00Z" } },
    { id: "b", label: "Beta", cells: { done: false } },
    { id: "c", label: "Gamma" }, { id: "r1", label: "Raport 1" }, { id: "r2", label: "Raport 2" }] }] };

async function open(page, doc, script) {
  let html = viewPage(doc);
  if (script) html = html.replace("</head>", () => "<script>" + script + "</script></head>");
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/");
}

const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
const status = (page) => page.locator(".cx-search .cx-sr-only");

test("a view's labels translate the toolbar, the rows, the cells, and what a screen reader hears", async ({ page }) => {
  await open(page, view);
  await page.waitForSelector("[data-cx-ready]");
  const search = page.getByRole("combobox");
  await expect(search).toHaveAttribute("placeholder", "Szukaj plików");
  await expect(page.locator(".cx-results")).toHaveAttribute("aria-label", "Wyniki wyszukiwania");
  await expect(page.locator(".cx-columns > summary")).toHaveText("Kolumny");
  await expect(page.locator(".cx-columns legend")).toHaveText("Widoczne kolumny");
  const grip = page.locator('.cx-hcell[data-cx-column="done"] .cx-resize');
  await expect(grip).toHaveAttribute("aria-label", "Zmień szerokość: Gotowe");
  await expect(grip).toHaveAttribute("aria-valuetext", "90 pikseli");

  // Cells: booleans and dates without display text; the tooltip gives the other time zone.
  await expect(row(page, "a").locator('[aria-colindex="2"]')).toHaveText("Tak");
  await expect(row(page, "b").locator('[aria-colindex="2"]')).toHaveText("Nie");
  const when = row(page, "a").locator('[aria-colindex="3"]');
  await expect(when).toHaveText("2026-09-27 10:15 (UTC)");
  await expect(when).toHaveAttribute("title", / \(czas lokalny\)$/);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setTimeZone("local"));
  await expect(when).toHaveAttribute("title", "2026-09-27 10:15 (UTC)");

  // Paging: the "show more" row and the announcements after each page.
  await expect(page.locator(".cx-row.cx-more")).toHaveText("Pokaż więcej (wczytano 2 z 5)");
  await page.locator(".cx-row.cx-more").click();
  await expect(page.locator(".cx-live")).toHaveText("Wczytano 4 z 5");
  await page.locator(".cx-row.cx-more").click();
  await expect(page.locator(".cx-live")).toHaveText("Elementy: 5");

  // Search: the count, a count of more matches than the list shows, nothing found, and a query too short to run.
  await search.fill("alfa");
  await expect(status(page)).toHaveText("Wyniki: 1");
  await search.fill("raport");
  await expect(status(page)).toHaveText("Wyniki: 1 z 2");
  await search.fill("zzz");
  await expect(status(page)).toHaveText("Brak wyników");
  await search.fill("a");
  await expect(status(page)).toHaveText("Wpisz co najmniej 2 znaki");
  // Host data stays as the host wrote it.
  await expect(page.locator(".cx-hcell").first()).toHaveText("Nazwa");
});

test("labels a host passes to configure apply on top of the view's", async ({ page }) => {
  const noPlaceholder = Object.assign({}, view, { search: { minLength: 2, maxResults: 20 } });
  await open(page, noPlaceholder, "CanopyX.configure('labelled', { labels: { columns: 'Pola', yes: '✓', searchPlaceholder: 'Znajdź' } });");
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator(".cx-columns > summary")).toHaveText("Pola");
  await expect(row(page, "a").locator('[aria-colindex="2"]')).toHaveText("✓");
  await expect(row(page, "b").locator('[aria-colindex="2"]')).toHaveText("Nie");
  // A view without a placeholder of its own takes the label, so a browser host can translate it too.
  await expect(page.getByRole("combobox")).toHaveAttribute("placeholder", "Znajdź");
  // The English texts and their names are there for a host that builds its translations from them.
  expect(await page.evaluate(() => [CanopyX.labels.columns, Object.isFrozen(CanopyX.labels)])).toEqual(["Columns", true]);
});

test("the loading and error rows of a source that fails are translated", async ({ page }) => {
  const { script, style } = runtimeAssets();
  await page.setContent("<!DOCTYPE html><html lang=\"pl\"><head><style>" + style + "</style><script>" + script + "</script></head><body class=\"cx-page\"><div id=\"host\"></div></body></html>");
  await page.evaluate((doc) => {
    let release = null;
    window.release = () => release();
    const source = {
      canSearch: false,
      page(node) {
        if (!node) return Promise.resolve({ items: [{ id: "lazy", label: "Leniwy", hasChildren: true }], total: 1, next: null, offset: 0 });
        return new Promise((resolve, reject) => { release = () => reject(new Error("brak połączenia")); });
      }
    };
    const lazy = Object.assign({}, doc, { source: { kind: "remote", children: "x?ref={ref}&cursor={cursor}" }, search: undefined, roots: undefined });
    window.grid = CanopyX.createTreeGrid(document.getElementById("host"), { view: lazy, source });
  }, view);
  await page.evaluate(() => window.grid.ready);
  await row(page, "lazy").locator(".cx-exp").click();
  await expect(page.locator(".cx-row.cx-loading")).toHaveText("Wczytywanie…");
  await page.evaluate(() => window.release());
  await expect(page.locator(".cx-row.cx-error")).toHaveText("Nie wczytano: brak połączenia");
});

test("a view that cannot be shown says so in its own language, and in English when its labels are what is wrong", async ({ page }) => {
  await open(page, Object.assign({}, view, { source: { kind: "elsewhere" } }));
  await expect(page.getByRole("alert")).toHaveText(/^Nie można wyświetlić widoku: CanopyX: unknown source kind/);

  await open(page, Object.assign({}, view, { labels: { columns: 42 } }));
  await expect(page.getByRole("alert")).toHaveText(/^This view could not be displayed: CanopyX: label 'columns' must be a string/);
  // A name the runtime does not know is a mistake too, not a silent English text; so is a date label without {time}.
  await open(page, Object.assign({}, view, { labels: { Columns: "Kolumny" } }));
  await expect(page.getByRole("alert")).toHaveText(/CanopyX: there is no label 'Columns'/);
  await open(page, Object.assign({}, view, { labels: { utcTime: "UTC" } }));
  await expect(page.getByRole("alert")).toHaveText(/CanopyX: label 'utcTime' must hold \{time\}/);
});

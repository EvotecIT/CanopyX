import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const section = (page, column) => page.locator(`.cx-facet[data-cx-facet="${column}"]`);
const labels = (page, column) => section(page, column).locator(".cx-facet-text").allTextContents();
const api = (page, callback) => page.evaluate(callback);

async function open(page, hosted = false) {
  const view = { protocol: "canopyx/2", type: "grid", id: "facet-integrity", label: "Places", rowHeight: 34, pageSize: 50, selection: "none", search: true, live: true,
    columns: [{ id: "team", title: "Team", kind: "text" }, { id: "city", title: "City", kind: "text", presenter: { kind: "enum", tones: { A: "success", a: "danger" } } }],
    source: { kind: hosted ? "host" : "inline" }, reporting: { facetColumns: ["team", "city"] }, facets: { columns: ["team", "city"] },
    ...(hosted ? {} : { rows: [{ id: "a", cells: { team: "Red", city: "a" } }, { id: "b", cells: { team: "Red", city: "A" } }] }) };
  const html = viewPage(view).replace("</head>", hosted ? `<script>
    window.mode = "initial"; window.pending = new Map(); window.requests = [];
    CanopyX.configure("facet-integrity", { source: {
      query: query => ({ protocol: "canopyx/2", type: "gridPage", view: "facet-integrity", revision: "r1", offset: query.offset,
        total: 1, matched: 1, items: [{ id: "a", cells: { team: "Red", city: "Initial" } }] }),
      facet(request) {
        const mode = window.mode, key = mode + ":" + request.column; window.requests.push(key);
        const page = { protocol: "canopyx/2", type: "gridFacetPage", view: "facet-integrity", revision: "r1", column: request.column, search: request.search,
          includeCurrentFilter: request.includeCurrentFilter, matched: 1, totalValues: 1, truncated: false, items: [{ value: mode === "old" ? "Stale" : mode === "new" ? "Current" : "Initial", count: 1 }] };
        if (key === "old:city" || key === "new:team") return new Promise((resolve, reject) => window.pending.set(key, { resolve: () => resolve(page), reject: () => reject(new Error("Stale failure")) }));
        return page;
      }
    } });
    </script></head>` : "</head>");
  await page.route("http://127.0.0.1:8997/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1:8997/");
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await api(page, () => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect(section(page, "city").getByRole("checkbox")).toHaveCount(1);
}

test("folded list buckets keep ordinal representatives and styling through live row order changes", async ({ page }) => {
  await open(page);
  await expect.poll(() => labels(page, "city")).toEqual(["A"]);
  await expect(section(page, "city").getByRole("checkbox")).toHaveAccessibleName("A, 2 rows");
  await expect(section(page, "city").locator(".p-pill.success")).toBeVisible();
  await section(page, "city").getByRole("checkbox").check();
  await expect.poll(() => api(page, () => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filters)).toEqual([{ column: "city", operator: "in", values: ["A"] }]);
  await api(page, () => document.querySelector("[data-canopyx-host]").canopyx.applyTransaction({ remove: ["a"], add: [{ id: "c", cells: { team: "Red", city: "a" } }] }));
  await expect.poll(() => labels(page, "city")).toEqual(["A"]);
  await expect(section(page, "city").getByRole("checkbox")).toBeChecked();
  await expect(section(page, "city").locator(".p-pill.success")).toBeVisible();
});

for (const ending of ["resolve", "reject"]) test(`a newer live facet refresh owns counts and errors while an earlier section waits (${ending})`, async ({ page }) => {
  await open(page, true);
  await api(page, async () => { window.mode = "old"; await document.querySelector("[data-canopyx-host]").canopyx.updateRows([{ id: "a", cells: { city: "First update" } }]); });
  await page.waitForFunction(() => window.pending.has("old:city"));
  await api(page, async () => { window.mode = "new"; await document.querySelector("[data-canopyx-host]").canopyx.updateRows([{ id: "a", cells: { city: "Second update" } }]); });
  await page.waitForFunction(() => window.pending.has("new:team"));
  await page.evaluate(ending => window.pending.get("old:city")[ending](), ending);
  // Drain the host promise and rendering tasks while the current refresh is deliberately still held at Team.
  await page.waitForTimeout(100);
  expect(await labels(page, "city")).toEqual(["Initial"]);
  await expect(section(page, "city").locator(".cx-facet-error")).toBeHidden();
  await page.evaluate(() => window.pending.get("new:team").resolve());
  await expect.poll(() => labels(page, "city")).toEqual(["Current"]);
  await expect(section(page, "city").locator(".cx-facet-error")).toBeHidden();
});

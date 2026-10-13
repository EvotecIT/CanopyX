import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

// Generic fixture: a monospace identifier row header (presenter), a value column a host class styles monospace,
// and a flex column that takes the spare width, so the grid has slack and the identifier keeps its measured need.
// At 390 pixels the class-styled column gives way to its header width by design; the identifier keeps its need.
function accounts(pathColumn = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "accounts", label: "Accounts", rowHeight: 34, pageSize: 250, selection: "single", search: false,
    source: { kind: "inline" }, highlightRules: [{ column: "path", operator: "contains", values: ["/"], target: "cell", className: "host-mono" }], columns: [
      { id: "sid", title: "Identifier", kind: "text", rowHeader: true, presenter: { kind: "identifier", mono: true } },
      { id: "path", title: "Key file", kind: "text", ...pathColumn },
      { id: "name", title: "Account", kind: "text" },
      { id: "notes", title: "Notes", kind: "text", flex: 1 }
    ], rows: Array.from({ length: 40 }, (_, i) => ({ id: "a" + i, cells: {
      sid: "S-1-5-21-1111111111-1111111111-" + (1100 + i * 7),
      path: "/etc/ssl/il/intl-" + i + ".pem",
      name: "Service account " + i, notes: i % 3 ? "Rotated" : "Rotation due"
    } })) };
}

async function open(page, { theme = "light", width = 1440, pathColumn, patch = view => view } = {}) {
  const body = viewPage(patch(accounts(pathColumn))).replace('data-cx-theme="light"', 'data-cx-theme="' + theme + '"')
    .replace("</head>", "<style>.host-mono{font-family:Consolas,\"Courier New\",monospace;font-size:13px}</style></head>");
  await page.setViewportSize({ width, height: 800 });
  await page.route("http://canopyx.test/fonts", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/fonts");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready); await nextFrames(page);
}

/** Rendered cells of a column, and those whose text needs more width than its box (an ellipsis or clipped text). */
function truncated(page, id) {
  return page.evaluate(id => {
    const index = document.querySelector('.cx-hcell[data-cx-column="' + id + '"]').getAttribute("aria-colindex");
    const cells = [...document.querySelectorAll('.cx-row:not(.cx-status) > .cx-cell[aria-colindex="' + index + '"]')];
    return { cells: cells.length, truncated: cells.filter(cell => [cell, ...cell.querySelectorAll("*")]
      .some(element => element.scrollWidth > element.clientWidth + 1)).map(cell => cell.textContent) };
  }, id);
}

async function expectWhole(page, id) {
  const result = await truncated(page, id);
  expect(result.cells).toBeGreaterThan(5);
  expect(result.truncated).toEqual([]);
}

for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test(`monospace columns fit their rendered font without truncation (${theme}, ${width})`, async ({ page }) => {
    await open(page, { theme, width });
    await expectWhole(page, "sid");
    if (width === 1440) {
      await expectWhole(page, "path");
      // Slack goes to the flex column, so the identifier keeps its measured need rather than spare width.
      const layout = await page.evaluate(() => {
        const box = id => document.querySelector('.cx-hcell[data-cx-column="' + id + '"]').getBoundingClientRect().width, grid = document.querySelector(".cx-grid");
        return { notes: box("notes"), sid: box("sid"), overflow: grid.scrollWidth - grid.clientWidth };
      });
      expect(layout.notes).toBeGreaterThan(300); expect(layout.sid).toBeLessThan(420); expect(layout.overflow).toBe(0);
      // Fitting to content measures the rendered font too.
      await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.autoFitColumn("sid")); await nextFrames(page);
      await expectWhole(page, "sid");
    }
  });
}

test("a column first shown after the initial fit measures with its rendered font", async ({ page }) => {
  await open(page, { pathColumn: { hidden: true } });
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setColumnVisible("path", true)); await nextFrames(page);
  await expectWhole(page, "path");
});

test("a missing value with badges in the first rendered row does not decide the column font", async ({ page }) => {
  // The first text in that cell is the missing marker, then a badge in a smaller font; the next row's value decides.
  await open(page, { patch: view => { view.rows[0].cells.sid = { value: null, badges: [{ text: "new" }] }; return view; } });
  await expectWhole(page, "sid");
});

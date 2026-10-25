import { expect, test } from "@playwright/test";
import { examples, openGridControl, runtimeAssets, viewPage } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

const definition = reporting => ({ protocol: "canopyx/2", id: "print-records", type: "grid", label: "Resource costs", source: { kind: "inline" },
  rowHeight: 30, pageSize: 10, selection: "multiple", search: true, ...(reporting ? { reporting: {} } : {}),
  columns: [{ id: "name", title: "Resource", kind: "text", width: 180 }, { id: "cost", title: "Cost", kind: "number", width: 100 }],
  rows: Array.from({ length: 40 }, (_, index) => ({ id: "r" + index, cells: { name: index === 0 ? "<img src=x onerror=alert(1)>" : "Resource " + index, cost: index + 1 } })) });

for (const [reporting, cards] of [[false, false], [true, false], [false, true]]) {
  test(`default print renders complete static records without a host (${cards ? "cards" : reporting ? "reporting" : "grid"})`, async ({ page }) => {
    // Capture the document passed to the browser print boundary; the renderer and export iterator remain real.
    await page.addInitScript(() => { window.print = () => { window.parent.__printedDocument = document.documentElement.outerHTML; }; });
    let html = viewPage({ ...definition(reporting), ...(cards ? { layout: { mode: "cards" }, cardTemplate: { name: "{name} — {cost}" } } : {}) });
    if (reporting) html = html.replace(/<script>[\s\S]*?<\/script>/, () => "<script>" + runtimeAssets("reporting").script + "</script>");
    await page.route("http://canopyx.test/default-print", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://canopyx.test/default-print");
    await page.waitForSelector("[data-cx-ready]");
    const result = await page.evaluate(async cards => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx, progress = [];
      await grid.print({ scope: "all", onProgress: value => progress.push(value) });
      const doc = new DOMParser().parseFromString(window.__printedDocument, "text/html");
      return { count: doc.querySelectorAll(cards ? "main > section" : "tbody tr").length,
        headers: [...doc.querySelectorAll(cards ? "main > section:first-of-type dt" : "thead th")].map(cell => cell.textContent),
        first: doc.querySelector(cards ? "dd" : "tbody td").textContent, executable: doc.querySelectorAll("script,img").length,
        remainingFrames: document.querySelectorAll("iframe").length, progress };
    }, cards);
    expect(result).toMatchObject({ count: 40, headers: ["Resource", "Cost"], first: "<img src=x onerror=alert(1)>" + (cards ? " — 1" : ""), executable: 0, remainingFrames: 0 });
    expect(result.progress.at(-1)).toEqual({ phase: "ready", completed: 40, total: 40 });
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setSelection(["r1", "r3"]));
    expect(await page.evaluate(async cards => {
      await document.querySelector("[data-canopyx-host]").canopyx.print({ scope: "selected" });
      return new DOMParser().parseFromString(window.__printedDocument, "text/html").querySelectorAll(cards ? "main > section" : "tbody tr").length;
    }, cards)).toBe(2);
  });
}

test("default print is offered explicitly and its row bound never silently truncates", async ({ page }) => {
  const html = viewPage(definition(false)).replace("</head>", '<script>CanopyX.configure("print-records",{exportMenu:{print:true}})</script></head>');
  await page.route("http://canopyx.test/print-menu", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/print-menu"); await page.waitForSelector("[data-cx-ready]");
  await openGridControl(page, "export");
  await expect(page.locator(".cx-grid-export").getByRole("button", { name: "Print", exact: true })).toBeVisible();
  const failure = await page.evaluate(async () => {
    try { await document.querySelector("[data-canopyx-host]").canopyx.print({ scope: "all", maxRows: 10 }); }
    catch (error) { return { message: error.message, frames: document.querySelectorAll("iframe").length }; }
  });
  expect(failure).toEqual({ message: "CanopyX: snapshot exceeds its row bound; use a host export hook.", frames: 0 });
});

test("default print keeps captured grouping, totals, formatted text and safe links", async ({ page }) => {
  const server = await serveExamples(examples);
  try {
    await page.addInitScript(() => { window.print = () => { window.parent.__printedDocument = document.documentElement.outerHTML; }; });
    await page.goto(server.url + "office-export.html"); await page.waitForSelector("[data-cx-ready]");
    const printed = await page.evaluate(async () => {
      const grid = document.querySelector('[data-canopyx-host]').canopyx;
      await grid.setQuery({ search: "North" });
      await grid.print({ scope: "filtered", locale: "en-US" });
      const doc = new DOMParser().parseFromString(window.__printedDocument, "text/html");
      return { headings: [...doc.querySelectorAll('tbody th')].map(cell => cell.textContent),
        records: doc.querySelectorAll('tbody tr:has(td)').length, total: doc.querySelector('tfoot').textContent,
        link: doc.querySelector('tbody td a')?.getAttribute('href'), executable: doc.querySelectorAll('script').length };
    });
    expect(printed).toMatchObject({ headings: ["Region: North"], records: 30, link: "https://example.com/resources/0", executable: 0 });
    expect(printed.total.replace(/[^\d]/g, "")).toContain("707250");
  } finally { await server.close(); }
});

for (const width of [1440, 390]) for (const reporting of [false, true]) for (const exportMenu of [false, true]) {
  test(`More Print uses the complete static renderer (${reporting ? "reporting" : "grid"}, Export ${exportMenu}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => { window.print = () => { window.parent.__printedDocument = document.documentElement.outerHTML; }; });
    const html = viewPage({ ...definition(reporting), toolbar: { export: exportMenu } });
    await page.route('http://canopyx.test/more-print', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/more-print'); await page.waitForSelector('[data-cx-ready]');
    await page.locator('.cx-grid-overflow > summary').click();
    await page.locator('.cx-grid-overflow').getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__printedDocument || '', 'text/html');
      return doc.querySelectorAll('main > table > tbody > tr').length;
    })).toBe(40);
    expect(await page.evaluate(() => new DOMParser().parseFromString(window.__printedDocument, 'text/html').querySelectorAll('script').length)).toBe(0);
  });
}

for (const cards of [false, true]) {
  test(`default print preserves included table and property details (${cards ? "cards" : "table"})`, async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.parent.__printedDocument = document.documentElement.outerHTML; }; });
    const view = { ...definition(true), reporting: { detail: {} }, ...(cards ? { layout: { mode: 'cards' } } : {}) };
    view.rows[0].detail = { type: 'table', caption: 'Line items', columns: ['Item', 'Quantity'], rows: [['<img src=x>', 2]] };
    view.rows[1].detail = { type: 'properties', items: [{ name: 'Owner', value: { value: 'Ops', text: 'Operations' } }] };
    await page.route('http://canopyx.test/detail-print', route => route.fulfill({ contentType: 'text/html', body: viewPage(view) }));
    await page.goto('http://canopyx.test/detail-print'); await page.waitForSelector('[data-cx-ready]');
    const print = includeDetails => page.evaluate(async includeDetails => {
      await document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'all', includeDetails });
      const doc = new DOMParser().parseFromString(window.__printedDocument, 'text/html');
      return { details: doc.querySelectorAll('[data-cx-print-detail]').length, text: doc.body.textContent, executable: doc.querySelectorAll('script,img').length };
    }, includeDetails);
    const included = await print(true); expect(included.details).toBe(2); expect(included.text).toContain('Line items');
    expect(included.text).toContain('<img src=x>'); expect(included.text).toContain('OwnerOperations'); expect(included.executable).toBe(0);
    expect((await print(false)).details).toBe(0);
  });
}

test('default print rejects HTML details explicitly and honors the declared exclusion', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { window.parent.__printedDocument = document.documentElement.outerHTML; }; });
  const view = { ...definition(true), reporting: { detail: {} } };
  view.rows[0].detail = { type: 'html', html: '<em>Host markup</em>' };
  for (const exclude of [false, true]) {
    view.reporting.detail.print = !exclude;
    await page.route('http://canopyx.test/html-detail-print', route => route.fulfill({ contentType: 'text/html', body: viewPage(view) }));
    await page.goto('http://canopyx.test/html-detail-print'); await page.waitForSelector('[data-cx-ready]');
    const outcome = await page.evaluate(async () => {
      try { await document.querySelector('[data-canopyx-host]').canopyx.print({ scope: 'all' }); return 'printed'; }
      catch (error) { return error.message; }
    });
    expect(outcome).toBe(exclude ? 'printed' : 'CanopyX: HTML print details require an onPrint hook or includeDetails: false.');
    expect(await page.locator('iframe').count()).toBe(0);
    await page.unroute('http://canopyx.test/html-detail-print');
  }
});

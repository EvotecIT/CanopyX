// Rich cells, footer text, group footer rows and rows from an address (docs/data-protocol.md): a cell's html is shown as
// sanitised markup built from elements, never inserted, while its value drives search and sort; footer rows show plain text
// under columns; a fixed grouping's footer template closes each group; an inline grid may read its rows from a JSON address.
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";
import { serveGrid } from "./editing-support.mjs";

async function open(page, view) {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/rich");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}
const cell = (page, id, column) => page.locator(`.cx-row[data-cx-id="${id}"] .cx-cell`).nth(column);

const view = (rows, extra = {}) => ({ protocol: "canopyx/2", type: "grid", id: "rich", label: "Rich", rowHeight: 32, pageSize: 50, selection: "none",
  search: true, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true, width: 200, sortable: true }, { id: "state", title: "State", kind: "text", width: 360 },
    { id: "size", title: "Size", kind: "number", width: 120 }],
  rows, ...extra });

test("allowed markup is built as elements: badges, emphasis, breaks, links and safe styles", async ({ page }) => {
  await open(page, view([
    { id: "a", cells: { name: "Alpha", size: 1, state: { value: "Active", html: '<span class="badge bg-success" title="Since May">Active</span> <b>now</b><br><a href="https://example.test/a" target="_blank">details</a> <span style="max-width: 80px; color: rgb(200, 0, 0); background-image: url(https://evil.test/x)">red</span>' } } },
    { id: "q", cells: { name: "Quoted", size: 2, state: { value: "q", html: '<span title="a > b" style="color: rgb(1, 2, 3)">quoted</span> <span title="Use style=color">plain</span>' } } }
  ]));
  const state = cell(page, "a", 1);
  await expect(state.locator(".cx-rich span.badge.bg-success")).toHaveText("Active");
  await expect(state.locator(".cx-rich span.badge")).toHaveAttribute("title", "Since May");
  await expect(state.locator(".cx-rich b")).toHaveText("now");
  await expect(state.locator(".cx-rich br")).toHaveCount(1);
  const link = state.locator(".cx-rich a");
  await expect(link).toHaveAttribute("href", "https://example.test/a");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  // The grid stays one Tab stop: the link is reached with cell navigation, not Tab.
  await expect(link).toHaveAttribute("tabindex", "-1");
  const styled = state.locator(".cx-rich span").nth(1);
  expect(await styled.evaluate(element => [element.style.maxWidth, element.style.color, element.style.backgroundImage])).toEqual(["80px", "rgb(200, 0, 0)", ""]);
  // A quoted > stays in its attribute and a quoted style= is text, not an attribute.
  const quoted = cell(page, "q", 1).locator(".cx-rich span");
  await expect(quoted.first()).toHaveText("quoted");
  expect(await quoted.first().evaluate(element => [element.title, element.style.color])).toEqual(["a > b", "rgb(1, 2, 3)"]);
  await expect(quoted.nth(1)).toHaveAttribute("title", "Use style=color");
  // The text the cell keeps for search, copy and exports stays hidden while the markup shows.
  await expect(state.locator(".cx-text")).toBeHidden();
  expect(page.pageErrors).toEqual([]);
});

test("scripts, handlers, unsafe addresses and unknown elements never reach the page", async ({ page }) => {
  await page.addInitScript(() => { window.__xss = 0; });
  await open(page, view([
    { id: "x", cells: { name: "X", size: 2, state: { value: "plain", html:
      '<img src=x onerror="window.__xss++"><script>window.__xss++</script><svg onload="window.__xss++"><text>svg text</text></svg>' +
      '<a href="javascript:window.__xss++">js</a> <a href=" JaVaScRiPt:alert(1)">mixed</a> <a href="data:text/html,x">data</a>' +
      '<custom-tag onclick="window.__xss++">kept text</custom-tag><iframe src="https://evil.test"></iframe><style>body{display:none}</style>' +
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="svg"><img src="https://example.test/i.png" alt="photo" width="16">' } } }
  ]));
  await page.waitForTimeout(100);
  const rich = cell(page, "x", 1).locator(".cx-rich");
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  expect(await rich.locator("script, svg, iframe, style, custom-tag").count()).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll(".cx-rich *")].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name))))).toBe(false);
  // Unsafe links keep their text without an address; unknown elements keep their text; svg and style go with theirs.
  expect(await rich.locator("a").evaluateAll(links => links.map(link => [link.textContent, link.getAttribute("href")]))).toEqual([["js", null], ["mixed", null], ["data", null]]);
  await expect(rich).toContainText("kept text");
  await expect(rich).not.toContainText("svg text");
  // Only raster data images and ordinary addresses load; the broken x image keeps no handler.
  expect(await rich.locator("img").evaluateAll(images => images.map(image => [image.getAttribute("alt"), image.getAttribute("src"), image.getAttribute("width")])))
    .toEqual([[null, "http://canopyx.test/x", null], ["svg", null, null], ["photo", "https://example.test/i.png", "16"]]);
});

test("a cell with html: null keeps its other decorations", async ({ page }) => {
  await open(page, view([{ id: "a", cells: { name: "Alpha", size: 1, state: { value: "On", html: null, title: "Kept tooltip" } } }]));
  await expect(cell(page, "a", 1)).toHaveAttribute("title", "Kept tooltip");
  await expect(cell(page, "a", 1).locator(".cx-rich")).toHaveCount(0);
});

test("search and sorting read the cell's value, not its markup", async ({ page }) => {
  await open(page, view([
    { id: "b", cells: { name: "Bravo", size: 2, state: { value: "Beta state", html: "<em>Beta</em> state" } } },
    { id: "a", cells: { name: "Alpha", size: 1, state: { value: "Alpha state", html: "<em>Alpha</em> <span class='hint'>em</span>" } } }
  ]));
  const ids = () => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")));
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "em" }));
  // "em" is a tag name and a class in the markup, but neither value holds it.
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "beta" }));
  await expect.poll(ids).toEqual(["b"]);
  await expect(cell(page, "b", 1).locator(".cx-rich em")).toHaveText("Beta");
});

test("footer rows show plain text under columns, alone or before aggregates", async ({ page }) => {
  await open(page, view([
    { id: "a", cells: { name: "Alpha", state: "On", size: 3 } }, { id: "b", cells: { name: "Bravo", state: "Off", size: 4 } }
  ], { footers: [
    { id: "notes", label: "Notes", scope: "all", aggregates: [], cells: { name: "Totals below", state: "<b>not markup</b>" } },
    { id: "total", label: "Total", scope: "all", cells: { name: "Total" }, aggregates: [{ id: "size", column: "size", operation: "sum", label: "Size" }] }
  ] }));
  const notes = page.locator('[data-cx-footer="notes"] .cx-footer-cell');
  await expect(notes.nth(0)).toHaveText("Totals below");
  await expect(notes.nth(1)).toHaveText("<b>not markup</b>");
  expect(await notes.nth(1).locator("b").count()).toBe(0);
  const total = page.locator('[data-cx-footer="total"] .cx-footer-cell');
  await expect(total.nth(0)).toHaveText("Total");
  await expect(total.nth(2)).toContainText("7");
  expect(page.pageErrors).toEqual([]);
});

test("a footer without aggregates or text is rejected", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const body = viewPage(view([{ id: "a", cells: { name: "Alpha", state: "On", size: 3 } }], { footers: [{ id: "empty", label: "Empty", scope: "all", aggregates: [] }] }));
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/rich");
  await expect.poll(async () => errors.join(" ") + " " + (await page.locator("[data-canopyx-host]").textContent())).toContain("invalid footer row");
});

const grouped = (extra = {}) => ({ protocol: "canopyx/2", type: "grid", id: "grouped", label: "Orders", rowHeight: 32, pageSize: 50, selection: "none",
  search: false, source: { kind: "inline" },
  columns: [{ id: "name", title: "Order", kind: "text", rowHeader: true, width: 220 }, { id: "region", title: "Region", kind: "text", sortable: true, width: 140 },
    { id: "amount", title: "Amount", kind: "number", width: 160 }],
  rows: [{ id: "1", cells: { name: "One", region: "East", amount: 10 } }, { id: "2", cells: { name: "Two", region: "West", amount: 5 } },
    { id: "3", cells: { name: "Three", region: "East", amount: 7 } }],
  reporting: { grouping: { column: "region", direction: "asc", footerTemplate: "{value}: {count} orders <b>end</b>" },
    aggregates: [{ id: "total", column: "amount", operation: "sum", label: "Total" }] }, ...extra });

test("a fixed grouping's footer template closes each group with its text and aggregates", async ({ page }) => {
  await open(page, grouped());
  const order = () => page.locator(".cx-row").evaluateAll(rows => rows.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map(row => row.dataset.cxGroupFooter ? "footer:" + row.dataset.cxGroupFooter : row.dataset.cxGroup ? "group" : row.dataset.cxId));
  await expect.poll(order).toEqual(["group", "1", "3", expect.stringMatching(/^footer:/), "group", "2", expect.stringMatching(/^footer:/)]);
  const east = page.locator(".cx-grid-group-footer").first();
  await expect(east.locator(".cx-grid-group-footer-text")).toHaveText("East: 2 orders <b>end</b>");
  expect(await east.locator("b").count()).toBe(0);
  await expect(east.locator(".cx-cell").nth(2)).toContainText("17");
  // The aggregates moved to the footer: the heading shows its value and count only.
  await expect(page.locator(".cx-row[data-cx-group]").first().locator(".cx-aggregate-button")).toHaveCount(0);
  // Down reaches the footer row; Enter and the arrows leave its group open.
  await page.locator('.cx-row[data-cx-id="3"]').click();
  await page.keyboard.press("ArrowDown");
  await expect(east).toBeFocused();
  for (const key of ["Enter", " ", "ArrowLeft"]) await page.keyboard.press(key);
  await expect(page.locator('.cx-row[data-cx-id="1"]')).toBeVisible();
  await expect(east).toBeFocused();
  // F2 enters the footer's cells, as on a heading, so its aggregate buttons stay reachable; Escape leaves them.
  await page.keyboard.press("F2");
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".cx-grid-group-footer") && document.activeElement !== document.activeElement.closest(".cx-row"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(east).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-row[data-cx-group]").nth(1)).toBeFocused();
  expect(page.pageErrors).toEqual([]);
});

test("a collapsed group hides its footer row; without a template headings keep their aggregates", async ({ page }) => {
  await open(page, grouped());
  await page.locator(".cx-grid-group-toggle").first().click();
  await expect(page.locator(".cx-grid-group-footer")).toHaveCount(1);
  await page.unrouteAll();
  const plain = grouped(); delete plain.reporting.grouping.footerTemplate;
  await open(page, plain);
  await expect(page.locator(".cx-grid-group-footer")).toHaveCount(0);
  await expect(page.locator(".cx-row[data-cx-group]").first().locator(".cx-aggregate-button")).toHaveCount(1);
});

// An inline grid that reads its rows from a JSON address: once, again on retry after a failure, and on its refresh interval.
const fromAddress = (source) => ({ protocol: "canopyx/2", type: "grid", id: "remote", label: "Users", rowHeight: 32, pageSize: 50, selection: "multiple",
  search: true, source: { kind: "inline", url: "data/users.json", ...source }, rows: [],
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true, sortable: true }, { id: "state", title: "State", kind: "text" }] });

test("rows come from the source address, are searched in the browser and are read again on retry", async ({ page }) => {
  let answers = [{ status: 500 }, { body: { rows: [{ id: "a", cells: { name: "Alpha", state: { value: "On", html: "<b>On</b>" } } }, { id: "b", cells: { name: "Bravo", state: "Off" } }] } }];
  const reads = [];
  await page.route("http://canopyx.test/data/users.json", route => {
    reads.push(route.request().headers().accept);
    const answer = answers.shift();
    return route.fulfill({ status: answer.status || 200, contentType: "application/json", body: JSON.stringify(answer.body || {}) });
  });
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(fromAddress()) }));
  await page.goto("http://canopyx.test/rich");
  await expect(page.locator("[data-canopyx-host]")).toContainText("HTTP 500");
  await page.getByRole("button", { name: /retry|try again/i }).first().click();
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  await expect(page.locator('.cx-row[data-cx-id="a"] .cx-rich b')).toHaveText("On");
  expect(reads).toEqual(["application/json", "application/json"]);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "bravo" }));
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(1);
  expect(reads).toHaveLength(2);
});

test("a refresh interval reads the rows again and keeps the reader's search", async ({ page }) => {
  await page.clock.install();
  let version = 1;
  await page.route("http://canopyx.test/data/users.json", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(Array.from({ length: version + 1 }, (_, i) => ({ id: "u" + i, cells: { name: "User " + i + (i === version ? " new" : ""), state: "On" } }))) }));
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(fromAddress({ refreshSeconds: 30 })) }));
  await page.goto("http://canopyx.test/rich");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ search: "new" }));
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(1);
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveAttribute("data-cx-id", "u1");
  version = 2;
  await page.clock.runFor(30000);
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveAttribute("data-cx-id", "u2");
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().search)).toBe("new");
});

test("an edited cell drops its old markup, and a refresh after the edit still reads the address", async ({ page }) => {
  await page.clock.install();
  let version = 1;
  const remote = fromAddress({ refreshSeconds: 30 });
  remote.columns[1].editable = true;
  // Each changed row is saved as it is left, with no service answer of its own.
  await serveGrid(page, { view: remote, script: "CanopyX.configure(\"remote\", { onRowCommit: () => ({ status: \"saved\" }) });",
    routes: { "/data/users.json": route => route.fulfill({ contentType: "application/json",
      body: JSON.stringify(Array.from({ length: version + 1 }, (_, i) => ({ id: "u" + i, cells: { name: "User " + i, state: { value: "On", html: "<b>On</b>" } } }))) }) } });
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  const state = page.locator('.cx-row[data-cx-id="u0"] .cx-cell').nth(1);
  await expect(state.locator(".cx-rich b")).toHaveText("On");
  await state.click(); await page.keyboard.press("F2");
  await state.locator("input.cx-editor").fill("Paused");
  await page.keyboard.press("Enter");
  await expect(state).toHaveText("Paused");
  await expect(state).not.toHaveClass(/cx-dirty/);
  await expect(state.locator(".cx-rich")).toHaveCount(0);
  version = 2;
  await page.clock.runFor(30000);
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(3);
});

// A paused clock moves only when a test advances it: drawing waits for those steps, and no deadline or interval fires on its own.
async function pauseClock(page) {
  const start = new Date("2026-11-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}
const drawn = (page, check) => expect.poll(async () => { await page.clock.runFor(16); return check(); }, { intervals: [0] }).toBe(true);
const rowIds = page => page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId).join());

test("a refresh while a search is still being typed keeps the typed search", async ({ page }) => {
  await pauseClock(page);
  let reads = 0, release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("http://canopyx.test/data/users.json", async route => {
    const version = ++reads;
    // The refresh's read waits until the search has been typed.
    if (version === 2) await held;
    await route.fulfill({ contentType: "application/json",
      body: JSON.stringify(Array.from({ length: version + 1 }, (_, i) => ({ id: "u" + i, cells: { name: "User " + i + (i === version ? " new" : ""), state: "On" } }))) });
  });
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html",
    body: viewPage({ ...fromAddress({ refreshSeconds: 30 }), searchDelayMs: 1000 }) }));
  await page.goto("http://canopyx.test/rich");
  await drawn(page, async () => await rowIds(page) === "u0,u1");
  await page.clock.runFor(30000);
  await expect.poll(() => reads).toBe(2);
  // The search waits a second before it runs; the clock stands still, so the refresh answers first.
  await page.getByRole("searchbox").fill("new");
  release();
  await drawn(page, async () => await rowIds(page) === "u2");
  await expect(page.getByRole("searchbox")).toHaveValue("new");
});

test("a large row set from an address searches in slices, and its facets count the rows that were read", async ({ page }) => {
  await page.route("http://canopyx.test/data/users.json", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(Array.from({ length: 25000 }, (_, i) => ({ id: "u" + String(i).padStart(5, "0"), cells: { name: (i % 5000 < 2 ? "Needle " : "Hay ") + i, state: i % 2 ? "Off" : "On" } }))) }));
  const view = fromAddress();
  view.reporting = { facetColumns: ["state"] };
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/rich");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
  const api = "document.querySelector('[data-canopyx-host]').canopyx";
  await page.evaluate(`${api}.setQuery({ search: "needle" })`);
  await expect.poll(() => page.evaluate(`${api}.getQuery().search`)).toBe("needle");
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(10);
  const facets = await page.evaluate(`${api}.getFacets("state", { includeCurrentFilter: false })`);
  expect(facets.items.map(item => [item.value, item.count])).toEqual([["Off", 5], ["On", 5]]);
});

test("a refresh updates the totals of a grouped grid whose rows come from an address", async ({ page }) => {
  await page.clock.install();
  let amount = 5;
  await page.route("http://canopyx.test/data/users.json", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify([{ id: "a", cells: { name: "A", state: "On", amount } }, { id: "b", cells: { name: "B", state: "On", amount: 1 } }]) }));
  const view = fromAddress({ refreshSeconds: 30 });
  view.columns.push({ id: "amount", title: "Amount", kind: "number" });
  view.columns[1].sortable = true;
  view.reporting = { grouping: { column: "state", direction: "asc", footerTemplate: "{value}" }, aggregates: [{ id: "sum", column: "amount", operation: "sum", label: "Sum" }] };
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/rich");
  await expect(page.locator(".cx-grid-group-footer")).toContainText("6");
  amount = 9;
  await page.clock.runFor(30000);
  await expect(page.locator(".cx-grid-group-footer")).toContainText("10");
});

test("a refresh keeps the reader's page and starts a new revision of the rows", async ({ page }) => {
  await page.clock.install();
  let count = 30;
  await page.route("http://canopyx.test/data/users.json", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: "u" + String(i).padStart(3, "0"), cells: { name: "User " + i, state: "On" } }))) }));
  const view = { ...fromAddress({ refreshSeconds: 30 }), presentation: "paged", pageLength: 10 };
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/rich");
  const api = "document.querySelector('[data-canopyx-host]').canopyx";
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "u000");
  await page.evaluate(`${api}.setQuery({ ...${api}.getQuery(), offset: 10 })`);
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "u010");
  expect(await page.evaluate(`${api}.getQuery().revision`)).toBe("url-1");
  count = 35;
  await page.clock.runFor(30000);
  await expect.poll(() => page.evaluate(`${api}.getQuery().revision`)).toBe("url-2");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toHaveAttribute("data-cx-id", "u010");
  expect(await page.evaluate(`${api}.getQuery().offset`)).toBe(10);
});

test("a read that does not answer within the request deadline fails, and Retry reads again", async ({ page }) => {
  await pauseClock(page);
  let reads = 0;
  await page.route("http://canopyx.test/data/users.json", route => {
    reads++;
    if (reads === 1) return; // never answers
    return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "a", cells: { name: "Alpha", state: "On" } }]) });
  });
  const html = viewPage(fromAddress()).replace("</head>", "<script>CanopyX.configure('remote', { requestTimeoutMs: 400 });</script></head>");
  await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/rich");
  await drawn(page, async () => /did not arrive|time/i.test(await page.locator("[data-canopyx-host]").textContent()));
  await page.getByRole("button", { name: /retry|try again/i }).first().click();
  // The clock stands still until the second read has answered and its rows are taken, so its deadline cannot pass first.
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.rows.length)).toBe(1);
  await drawn(page, async () => await rowIds(page) === "a");
  expect(reads).toBe(2);
});

test("an address on a host grid, an unsafe address or rows beside an address are rejected", async ({ page }) => {
  for (const [label, view] of [
    ["host", { ...fromAddress(), source: { kind: "host", url: "data/users.json" }, rows: undefined }],
    ["javascript", fromAddress({ url: "javascript:alert(1)" })],
    ["protocol-relative", fromAddress({ url: "//evil.test/rows.json" })],
    ["rows", { ...fromAddress(), rows: [{ id: "a", cells: { name: "A" } }] }],
    ["refresh", fromAddress({ refreshSeconds: 1 })],
    ["calculated", { ...fromAddress(), calculatedColumnsEditable: true }]
  ]) {
    const messages = [];
    const listener = error => messages.push(error.message);
    page.on("pageerror", listener);
    await page.route("http://canopyx.test/rich", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/rich");
    await expect.poll(async () => messages.join(" ") + " " + await page.locator("[data-canopyx-host]").textContent(), { message: label })
      .toMatch(label === "calculated" ? /cannot have calculated columns/ : /invalid grid source address or refresh/);
    page.off("pageerror", listener);
    await page.unroute("http://canopyx.test/rich");
  }
});

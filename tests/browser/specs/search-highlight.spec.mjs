// Search-hit highlighting (docs/search-highlight.md): marks for search and filter hits in cells, the record drawer and tree
// nodes, the match count, next/previous navigation with the buttons and keys, the switch and saved state, case and accent
// options, markup that stays intact, phone and dark captures, and the budget on 100,000 rows.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openExample, nextFrames } from "./support.mjs";
import { ticketView, treeView, open, call, settle } from "./view-modes-support.mjs";

const marks = (page, selector = ".cx-canvas mark.cx-hit") => page.locator(selector);
const countText = page => page.locator(".cx-matches-count");

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`the support tickets example marks search hits and moves through them (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await openExample(page, theme === "dark" ? "support-tickets-dark.html" : "support-tickets.html");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready); await nextFrames(page);
    // The example opens searching for "printer": every painted hit is a <mark>, and the count covers the whole result.
    await expect(marks(page).first()).toBeVisible();
    expect(await marks(page).evaluateAll(list => list.every(mark => mark.tagName === "MARK" && /^printer$/i.test(mark.textContent)))).toBe(true);
    const matches = await call(page, "getMatches");
    expect(matches).toMatchObject({ enabled: true, complete: true });
    expect(matches.total).toBeGreaterThan(20);
    await expect(countText(page)).toHaveText(matches.total + " matches");
    // The settled count is announced once through the live region; the count itself is not live.
    await expect(countText(page)).not.toHaveAttribute("role", /./);
    await expect(page.locator(".cx-live")).toHaveText(matches.total + " matches");
    // Next focuses the first match's cell and marks it current; the count shows the position.
    await page.getByRole("button", { name: "Next match" }).click();
    await expect(countText(page)).toHaveText("1 of " + matches.total);
    const current = page.locator("mark.cx-hit-current");
    await expect(current).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement.classList.contains("cx-cell") && !!document.activeElement.querySelector("mark.cx-hit-current"))).toBe(true);
    // F3 and Shift+F3 move on and back from the grid; Previous wraps to the last match.
    await page.keyboard.press("F3");
    await expect(countText(page)).toHaveText("2 of " + matches.total);
    await page.keyboard.press("Shift+F3");
    await expect(countText(page)).toHaveText("1 of " + matches.total);
    await page.getByRole("button", { name: "Previous match" }).click();
    await expect(countText(page)).toHaveText(matches.total + " of " + matches.total);
    expect(await page.evaluate(() => document.activeElement.closest(".cx-row")?.getAttribute("aria-rowindex"))).not.toBeNull();
    await expect(page.locator(".cx-live")).toContainText("Match " + matches.total + " of " + matches.total);
    // The search box's own buttons meet the touch size on phones.
    if (width === 390) expect((await page.getByRole("button", { name: "Next match" }).boundingBox()).height).toBeGreaterThanOrEqual(36);
    const axe = await new AxeBuilder({ page }).include(".cx-toolbar").include(".cx-canvas").disableRules(["scrollable-region-focusable"]).analyze();
    expect(axe.violations.filter(item => ["color-contrast", "aria-allowed-role", "button-name", "aria-required-children"].includes(item.id))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Enter in the search box steps through the matches and keeps typing focus there", async ({ page }) => {
  await open(page, ticketView());
  // An inline grid applies typed text at once; Enter then moves to the first match.
  await page.locator(".cx-search-input").fill("printer");
  await settle(page);
  const total = (await call(page, "getMatches")).total;
  expect(total).toBeGreaterThan(0);
  await page.locator(".cx-search-input").press("Enter");
  await expect(countText(page)).toHaveText("1 of " + total);
  await page.locator(".cx-search-input").press("Enter");
  await expect(countText(page)).toHaveText("2 of " + total);
  await page.locator(".cx-search-input").press("Shift+Enter");
  await expect(countText(page)).toHaveText("1 of " + total);
  await expect(page.locator(".cx-search-input")).toBeFocused();
  // The match row is the grid's focused row, so Tab lands on it.
  expect(await page.evaluate(() => document.querySelector(".cx-row[tabindex='0'] mark.cx-hit-current") !== null)).toBe(true);
});

test("search hits and filter hits are marked apart, with whole-cell marks for value conditions and a column tone", async ({ page }) => {
  await open(page, ticketView(120, { searchHighlight: { filterTones: { customer: "success" } } }));
  await call(page, "setQuery", { search: "printer", filters: [{ column: "status", operator: "eq", values: ["Open"] }, { column: "customer", operator: "contains", values: ["nowak"] }] });
  await settle(page);
  const search = marks(page, ".cx-canvas mark.cx-hit-search"), filter = marks(page, ".cx-canvas mark.cx-hit-filter");
  await expect(search.first()).toBeVisible();
  await expect(filter.first()).toBeVisible();
  // The status condition marks the whole pill text; the contains condition marks the matching part in the column's tone.
  expect(await filter.evaluateAll(list => list.map(mark => mark.textContent))).toEqual(expect.arrayContaining(["Open", "Nowak"]));
  expect(await page.locator(".cx-canvas mark.cx-hit-toned").first().evaluate(mark => mark.style.getPropertyValue("--cx-hit-tone"))).toBe("var(--cx-tone-success)");
  const [searchBg, filterBg] = await Promise.all([search.first(), filter.first()].map(mark => mark.evaluate(element => getComputedStyle(element).backgroundColor)));
  expect(searchBg).not.toBe(filterBg);
  // Filter hits count too: a whole-cell hit is one match.
  const rows = await page.locator(".cx-canvas .cx-row[data-cx-id]").count();
  expect((await call(page, "getMatches")).total).toBe(rows * 3);
});

test("marks wrap text only: links, pills and the painters' text nodes come back intact", async ({ page }) => {
  await open(page, ticketView(60));
  const snapshot = () => page.evaluate(() => [...document.querySelectorAll(".cx-canvas .cx-row[data-cx-id]")].map(row => row.innerHTML).join("\n"));
  const before = await snapshot();
  await call(page, "setQuery", { search: "article 1" });
  await settle(page);
  const link = page.locator(".cx-canvas a.p-link").first();
  await expect(link.locator("mark.cx-hit")).toHaveCount(1);
  expect(await link.getAttribute("href")).toMatch(/^https:\/\/example\.test\/kb\//);
  expect(await page.locator(".cx-canvas :is(button,svg) mark").count()).toBe(0);
  // Clearing the search unmarks every row: the same rows render the same markup as before.
  await call(page, "setQuery", { search: "" });
  await settle(page);
  expect(await page.locator("mark").count()).toBe(0);
  expect(await snapshot()).toBe(before);
});

test("match case and ignore accents narrow and widen what is marked, not which rows match", async ({ page }) => {
  const view = extra => ({ protocol: "canopyx/2", type: "grid", id: "menu", label: "Menu", pageSize: 100, selection: "none", search: true, rowHeight: 34,
    columns: [{ id: "name", title: "Name", kind: "text" }, { id: "note", title: "Note", kind: "text" }], source: { kind: "inline" },
    rows: [{ id: "a", cells: { name: "Cafe corner", note: "Café menu, cafe hours" } }, { id: "b", cells: { name: "Tea room", note: "No coffee" } }], ...extra });
  await open(page, view({ searchHighlight: true }));
  await call(page, "setQuery", { search: "Cafe" }); await settle(page);
  expect(await marks(page).allTextContents()).toEqual(["Cafe", "cafe"]);
  await page.unrouteAll();
  await open(page, view({ searchHighlight: { ignoreAccents: true } }));
  await call(page, "setQuery", { search: "cafe" }); await settle(page);
  expect(await marks(page).allTextContents()).toEqual(["Cafe", "Café", "cafe"]);
  await page.unrouteAll();
  await open(page, view({ searchHighlight: { matchCase: true } }));
  await call(page, "setQuery", { search: "Cafe" }); await settle(page);
  expect(await marks(page).allTextContents()).toEqual(["Cafe"]);
  expect(await page.locator(".cx-canvas .cx-row[data-cx-id]").count()).toBe(1);
});

test("the record drawer marks its values", async ({ page }) => {
  await open(page, ticketView());
  await call(page, "setQuery", { search: "printer", filters: [{ column: "status", operator: "eq", values: ["Open"] }] });
  await settle(page);
  const id = await page.locator(".cx-canvas .cx-row[data-cx-id]").first().getAttribute("data-cx-id");
  await call(page, "openDetails", id);
  const drawer = page.locator(".cx-drawer");
  await expect(drawer.locator("mark.cx-hit-search").first()).toHaveText(/printer/i);
  await expect(drawer.locator("mark.cx-hit-filter")).toHaveText("Open");
  // The next record repaints the drawer and marks it again.
  await drawer.getByRole("button", { name: "Next record" }).click();
  await expect(drawer.locator("mark.cx-hit-filter")).toHaveText("Open");
});

test("the switch turns marks off and on, and the choice is saved with the view", async ({ page }) => {
  await open(page, ticketView(120, { stateKey: "tickets", query: { search: "printer" } }));
  await expect(marks(page).first()).toBeVisible();
  await page.locator(".cx-grid-overflow > summary").click();
  const toggle = page.locator(".cx-matches-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(marks(page)).toHaveCount(0);
  await expect(page.locator(".cx-matches")).toBeHidden();
  expect((await call(page, "getState")).highlight).toBe(false);
  await call(page, "saveView", "Plain");
  await call(page, "setSearchHighlight", true); await settle(page);
  await expect(marks(page).first()).toBeVisible();
  await call(page, "applySavedView", "Plain"); await settle(page);
  await expect(marks(page)).toHaveCount(0);
  expect((await call(page, "getMatches")).enabled).toBe(false);
  // The remembered state brings the choice back after a reload.
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector("[data-cx-ready]"); await settle(page);
  expect((await call(page, "getMatches")).enabled).toBe(false);
});

test("scrolling recycles rows without stale marks", async ({ page }) => {
  await open(page, ticketView(4000, { query: { search: "printer" } }));
  const total = (await call(page, "getMatches")).total;
  expect(total).toBeGreaterThan(400);
  for (const top of [20000, 60000, 3000, 90000]) {
    await page.locator(".cx-grid").evaluate((grid, top) => { grid.scrollTop = top; }, top);
    await settle(page);
    const wrong = await page.evaluate(() => [...document.querySelectorAll(".cx-canvas .cx-row[data-cx-id]")].filter(row => {
      const subject = row.querySelectorAll(".cx-cell")[1], marked = [...subject.querySelectorAll("mark")].map(mark => mark.textContent.toLowerCase());
      return /printer/i.test(subject.textContent) !== marked.includes("printer") || marked.some(text => text !== "printer");
    }).length);
    expect(wrong).toBe(0);
  }
  // From the top, Previous wraps to the last match far below: navigation scrolls the virtual rows to it.
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = 0; });
  await settle(page);
  await call(page, "previousMatch");
  await expect(countText(page)).toHaveText(total + " of " + total);
  await expect(page.locator(".cx-canvas mark.cx-hit-current")).toBeVisible();
});

test("a host source counts the matches of the rows it has loaded", async ({ page }) => {
  const view = ticketView(0, { source: { kind: "host" }, rows: undefined, pageSize: 50 });
  delete view.rows;
  const rows = JSON.stringify(ticketView(400).rows);
  await open(page, [], { runtime: "grid" });
  await page.evaluate(([view, rows]) => {
    const all = JSON.parse(rows), host = document.createElement("div"); host.className = "cx-host"; host.style.height = "500px"; document.querySelector("main").appendChild(host);
    window.grid = CanopyX.createDataGrid(host, { view, source: { query: async query => {
      const matched = all.filter(row => !query.search || row.cells.subject.toLowerCase().includes(query.search.toLowerCase()));
      return { protocol: "canopyx/2", type: "gridPage", view: view.id, revision: "r1", offset: query.offset, total: all.length, matched: matched.length,
        items: matched.slice(query.offset, query.offset + query.limit) };
    } } });
    return window.grid.ready;
  }, [view, rows]);
  await page.evaluate(() => window.grid.setQuery({ search: "printer" }));
  await settle(page);
  const matches = await page.evaluate(() => window.grid.getMatches());
  expect(matches.complete).toBe(false);
  await expect(countText(page)).toHaveText(matches.total + " matches in loaded rows");
});

test("a tree's Enter chooses an open result without moving to a match, and Escape clears the marks", async ({ page }) => {
  await open(page, treeView());
  const input = page.locator(".cx-search-input");
  await input.fill("print");
  await expect(page.locator(".cx-results")).toBeVisible();
  await input.press("Enter");
  await expect(page.locator(".cx-row[data-cx-id='kb-printing']")).toHaveAttribute("aria-selected", "true");
  expect((await call(page, "getMatches")).current).toBe(0);
  await input.focus();
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect(marks(page)).toHaveCount(0);
});

test("a tree's current match stays on its node when a branch above opens or closes", async ({ page }) => {
  await open(page, treeView());
  await page.locator(".cx-search-input").fill("printer");
  await page.waitForTimeout(400);
  await page.locator(".cx-search-input").press("Escape");
  await call(page, "nextMatch"); await call(page, "nextMatch");
  expect(await page.evaluate(() => document.activeElement.closest(".cx-row")?.dataset.cxId)).toBe("kb-2");
  // Collapsing a branch below keeps the match; F3 at once moves on from it, not from its old position.
  await page.evaluate(() => { const grid = document.querySelector("[data-canopyx-host]").canopyx; return grid.setState({ ...grid.getState(), expanded: [["kb-printing"]] }); });
  await expect(page.locator(".cx-canvas mark.cx-hit-current")).toHaveText("printer");
  await call(page, "previousMatch");
  expect(await page.evaluate(() => document.activeElement.closest(".cx-row")?.dataset.cxId)).toBe("kb-1");
});

test("a tree marks its search words in the tree column and moves through them", async ({ page }) => {
  await open(page, treeView());
  await page.locator(".cx-search-input").fill("print");
  await page.waitForTimeout(400);
  await page.locator(".cx-search-input").press("Escape");
  await expect(marks(page)).toHaveCount(3);
  expect(await marks(page).allTextContents()).toEqual(["Print", "print", "print"]);
  // Word starts only: "print" does not mark the middle of a word.
  await page.locator(".cx-search-input").press("Enter");
  await expect(countText(page)).toHaveText("1 of 3");
  await page.keyboard.press("F3");
  await expect(countText(page)).toHaveText("2 of 3");
  expect(await page.evaluate(() => document.activeElement.closest(".cx-row")?.getAttribute("data-cx-id"))).toBe("kb-1");
  // Collapsing a branch counts the visible rows again.
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setState({ ...document.querySelector("[data-canopyx-host]").canopyx.getState(), expanded: [] }));
  await expect(countText(page)).toHaveText("1 match");
});

test("a paged grid moves through matches across pages and keeps the current match on the new page", async ({ page }) => {
  await open(page, ticketView(300, { presentation: "paged", pageLength: 25, query: { search: "printer" } }));
  const total = (await call(page, "getMatches")).total;
  expect(total).toBeGreaterThan(30);
  // Every result row holds one match: matches 1 to 25 are on the first page, the 26th turns the page.
  for (let step = 1; step <= 26; step++) {
    await call(page, "nextMatch");
    await expect(countText(page)).toHaveText(step + " of " + total);
  }
  expect((await call(page, "getPaging")).first).toBe(26);
  await expect(page.locator(".cx-canvas mark.cx-hit-current")).toBeVisible();
  await call(page, "previousMatch");
  await expect(countText(page)).toHaveText("25 of " + total);
});

test("a source that cannot count its result counts the loaded rows and keeps counting as pages arrive", async ({ page }) => {
  const rows = JSON.stringify(ticketView(400).rows);
  await open(page, [], { runtime: "grid" });
  await page.evaluate(([view, rows]) => {
    const all = JSON.parse(rows), host = document.createElement("div"); host.className = "cx-host"; host.style.height = "500px"; document.querySelector("main").appendChild(host);
    window.grid = CanopyX.createDataGrid(host, { view, source: { query: async query => {
      const matched = all.filter(row => !query.search || row.cells.subject.toLowerCase().includes(query.search.toLowerCase()));
      return { protocol: "canopyx/2", type: "gridPage", view: view.id, revision: "r1", offset: query.offset, total: all.length, matched: matched.length,
        items: matched.slice(query.offset, query.offset + query.limit) };
    } } });
    return window.grid.ready;
  }, [{ ...ticketView(0, { source: { kind: "host" }, pageSize: 20 }), rows: undefined }, rows]);
  await page.evaluate(() => window.grid.setQuery({ search: "printer" }));
  await settle(page);
  const first = await page.evaluate(() => window.grid.getMatches());
  expect(first.complete).toBe(false);
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
  await expect.poll(() => page.evaluate(() => window.grid.getMatches().total)).toBeGreaterThan(first.total);
});

test("match counts use the plural forms of the page language", async ({ page }) => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, cells: { name: "Item " + i, note: i < 1 ? "alpha" : i < 3 ? "beta" : "gamma" } }));
  const view = labels => ({ protocol: "canopyx/2", type: "grid", id: "plural", label: "Plural", pageSize: 100, selection: "none", search: true, rowHeight: 34,
    columns: [{ id: "name", title: "Name", kind: "text" }, { id: "note", title: "Note", kind: "text" }], source: { kind: "inline" }, rows, searchHighlight: true, labels });
  await open(page, view());
  for (const [search, text] of [["alpha", "1 match"], ["beta", "2 matches"], ["gamma", "9 matches"], ["zzz", "No matches"]]) {
    await call(page, "setQuery", { search }); await settle(page);
    await expect(countText(page)).toHaveText(text);
  }
  // Polish has one, few and many forms: 1 dopasowanie, 2 dopasowania, 9 dopasowań.
  await page.unrouteAll();
  await open(page, view({ matchesCount: "[one]{count} dopasowanie[few]{count} dopasowania[many]{count} dopasowań[other]{count} dopasowania" }),
    { script: "document.documentElement.lang = 'pl';" });
  for (const [search, text] of [["alpha", "1 dopasowanie"], ["beta", "2 dopasowania"], ["gamma", "9 dopasowań"]]) {
    await call(page, "setQuery", { search }); await settle(page);
    await expect(countText(page)).toHaveText(text);
  }
});

test("complete match counts include unpainted rows and Previous reaches the final match", async ({ page }) => {
  const count = 4097, total = Math.ceil(count / 7);
  // With no explicit sort, accepted rows use lexical id order: t994 follows the other printer matches.
  const last = "t994";
  await open(page, ticketView(count, { pageSize: 1000 }), { height: 700 });
  await call(page, "setQuery", { search: "printer" });
  await settle(page);
  await expect.poll(() => call(page, "getMatches")).toMatchObject({ complete: true, total });
  expect(await page.locator(".cx-canvas mark.cx-hit").count()).toBeGreaterThan(0);
  expect(await page.locator(".cx-row[data-cx-id]").count()).toBeLessThan(80);
  await call(page, "previousMatch");
  await expect(page.locator('.cx-row[data-cx-id="' + last + '"] mark.cx-hit-current')).toBeVisible();
  await expect(countText(page)).toHaveText(total + " of " + total);
});

test("search highlighting stays fast at 100,000 rows: painted rows only, with a sliced count", { tag: "@benchmark" }, async ({ page }) => {
  await open(page, ticketView(100000, { pageSize: 1000 }), { height: 700 });
  await page.evaluate(() => {
    window.longTasks = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.longTasks.push(entry.duration); }).observe({ type: "longtask" });
  });
  const timing = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, started = performance.now();
    await grid.setQuery({ search: "printer" });
    const queried = performance.now();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const painted = performance.now(), marked = document.querySelectorAll(".cx-canvas mark.cx-hit").length;
    window.longTasks.length = 0;
    while (!grid.getMatches().complete || !grid.getMatches().total) await new Promise(resolve => setTimeout(resolve, 10));
    return { query: queried - started, paint: painted - queried, count: performance.now() - queried, marked, total: grid.getMatches().total, longest: Math.max(0, ...window.longTasks) };
  });
  console.log("100k highlight budget", JSON.stringify(timing));
  expect(timing.marked).toBeGreaterThan(0);
  expect(timing.total).toBe(Math.ceil(100000 / 7));
  expect(timing.paint).toBeLessThan(200);
  expect(timing.count).toBeLessThan(4000);
  // The count yields between slices: no task of its own blocks input for long.
  expect(timing.longest).toBeLessThan(150);
  // Moving to the last match reaches row 99,996 through the virtual rows.
  await call(page, "previousMatch");
  await expect(page.locator(".cx-canvas mark.cx-hit-current")).toBeVisible();
});

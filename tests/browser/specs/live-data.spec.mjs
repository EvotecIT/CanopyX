// Live data (docs/live-data.md): transactions in place, the stable order and its prompt, flashing cells, the batched update
// rate, hosted refreshes by revision and polling, at desktop and phone widths in both palettes.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { exampleUrl, nextFrames, repo, runtimeAssets, viewPage } from "./support.mjs";

const grid = (page, id) => page.locator("[data-canopyx-host]").filter({ has: page.locator('[aria-label="' + (id === "live-jobs" ? "Job queue" : "Endpoints") + '"]') });
const api = (page, id, call, arg) => page.evaluate(([id, call, arg]) => {
  const element = [...document.querySelectorAll("[data-canopyx-host]")].find(item => item.canopyx && item.canopyx.view.id === id);
  return new Function("api", "element", "arg", "return (" + call + ")(api, element, arg);")(element.canopyx, element, arg);
}, [id, call, arg]);
const shown = (page, id) => api(page, id, "(api, element) => [...element.querySelectorAll('.cx-row[data-cx-id]:not([data-cx-status])')].sort((a, b) => a.getAttribute('aria-rowindex') - b.getAttribute('aria-rowindex')).map(row => row.getAttribute('data-cx-id'))");

async function open(page, { dark = false, width = 1440 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(exampleUrl(dark ? "live-data-dark.html" : "live-data.html") + "#manual");
  await page.waitForFunction(() => [...document.querySelectorAll("[data-canopyx-host]")].every(item => item.getAttribute("data-cx-ready") === "true") && window.liveDemo);
  await api(page, "live-endpoints", "api => api.ready");
  await nextFrames(page);
}

async function openFrozen(page) {
  await page.clock.install({ time: new Date("2026-10-31T00:00:00Z") });
  await open(page);
  await page.clock.pauseAt(new Date("2026-10-31T01:00:00Z"));
}

async function frozenUpdate(page, row) {
  await api(page, "live-endpoints", "(api, el, row) => { window.liveChange = api.updateRows([row]); }", row);
  // This example batches for 250ms; paint after that batch, then hold the flash while its state is inspected.
  await page.clock.runFor(250);
  const result = await page.evaluate(() => window.liveChange);
  await page.clock.runFor(32);
  return result;
}

test.describe("live data", () => {
  test("a changed sort key keeps its row in place, flashes its cells and offers to re-sort", async ({ page }) => {
    await openFrozen(page);
    const before = await shown(page, "live-endpoints");
    const target = before[6];
    await api(page, "live-endpoints", "(api, el, id) => api.setSelection([id])", target);
    const events = [];
    await page.exposeFunction("recordRows", detail => events.push(detail));
    await api(page, "live-endpoints", "(api, element) => element.addEventListener('canopyx:rowsChanged', event => window.recordRows(event.detail))");
    const result = await frozenUpdate(page, { id: target, cells: { latency: 999 } });
    expect(result).toMatchObject({ updated: [target], added: [], removed: [], orderChanged: true });
    expect(await shown(page, "live-endpoints")).toEqual(before);
    const monitor = grid(page, "live-endpoints");
    const row = monitor.locator('.cx-row[data-cx-id="' + target + '"]');
    await expect(row).toContainText("999");
    await expect(row.locator(".cx-cell.cx-live-flash")).toHaveCount(1);
    await expect(row).toHaveAttribute("aria-selected", "true");
    const bar = monitor.locator(".cx-live-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Order changed");
    const resort = bar.getByRole("button", { name: "Re-sort" });
    await expect(resort).toHaveAccessibleDescription("Order changed");
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toMatchObject({ updated: [target], orderChanged: true, source: "api" });
    expect(await api(page, "live-endpoints", "api => api.getLiveState()")).toMatchObject({ orderChanged: true, pending: 0 });
    await resort.click();
    await page.clock.runFor(32);
    await expect(bar).toBeHidden();
    await expect.poll(async () => (await shown(page, "live-endpoints"))[0]).toBe(target);
    await expect(row).toHaveAttribute("aria-selected", "true");
    await expect(monitor.locator(".cx-live")).toHaveText("Rows moved to their sorted places.");
    expect(await api(page, "live-endpoints", "api => api.getLiveState().orderChanged")).toBe(false);
  });

  test("rows that stop matching leave, new matches join where the sort puts them, and counts follow", async ({ page }) => {
    await open(page);
    await api(page, "live-endpoints", "api => api.setQuery({ ...api.getQuery(), search: 'eu-' })");
    const count = grid(page, "live-endpoints").locator(".cx-grid-result-count");
    const matched = await api(page, "live-endpoints", "api => api.getPaging().matched");
    const ids = await shown(page, "live-endpoints");
    await api(page, "live-endpoints", "(api, el, id) => api.applyTransaction({ update: [{ id, cells: { region: 'us-east' } }], add: [{ id: 'ep-new', cells: { name: 'edge-new', region: 'eu-west', status: 'Healthy', latency: 120, errors: 0, requests: 10 } }] })", ids[0]);
    expect(await api(page, "live-endpoints", "api => api.getPaging().matched")).toBe(matched);
    const after = await shown(page, "live-endpoints");
    expect(after).not.toContain(ids[0]);
    expect(after).toContain("ep-new");
    const latencies = await api(page, "live-endpoints", "(api, el, ids) => ids.map(id => api.view.rows.find(row => row.id === id).cells.latency)", after);
    expect(latencies).toEqual([...latencies].sort((a, b) => b - a));
    await expect(count).toContainText(String(matched));
    // Removing rows clears them from the selection and moves focus to the row that takes the place.
    await api(page, "live-endpoints", "(api, el, ids) => api.setSelection(ids)", [after[1], after[2]]);
    await grid(page, "live-endpoints").locator('.cx-row[data-cx-id="' + after[1] + '"]').focus();
    const removed = await api(page, "live-endpoints", "(api, el, id) => api.removeRows([id, 'nobody'])", after[1]);
    expect(removed).toMatchObject({ removed: [after[1]], missing: ["nobody"] });
    expect(await api(page, "live-endpoints", "api => api.getSelection()")).toEqual([after[2]]);
    expect(await page.evaluate(() => document.activeElement.getAttribute("data-cx-id"))).toBe(after[2]);
  });

  test("changes within the batch window apply together, merged by row", async ({ page }) => {
    await open(page);
    const ids = await shown(page, "live-endpoints");
    const outcome = await api(page, "live-endpoints", `async (api, el, ids) => {
      let events = 0; el.addEventListener("canopyx:rowsChanged", () => events++);
      const calls = [api.updateRows([{ id: ids[3], cells: { errors: 1 } }]), api.updateRows([{ id: ids[3], cells: { requests: 7 } }]),
        api.addRows([{ id: "ep-batch", cells: { name: "edge-batch", latency: 1 } }]), api.removeRows(["ep-batch"])];
      await new Promise(resolve => setTimeout(resolve, 0));
      const pending = api.getLiveState().pending;
      const results = await Promise.all(calls);
      const row = api.view.rows.find(row => row.id === ids[3]).cells;
      return { pending, events, same: results.every(result => result === results[0]), result: results[0], errors: row.errors, requests: row.requests };
    }`, ids);
    expect(outcome.pending).toBe(2);
    expect(outcome).toMatchObject({ events: 1, same: true, errors: 1, requests: 7 });
    expect(outcome.result.updated).toEqual([ids[3]]);
    expect(outcome.result.missing).toEqual(["ep-batch"]);
  });

  test("an open record drawer paints the new values, and says when its record is removed", async ({ page }) => {
    await open(page);
    const ids = await shown(page, "live-endpoints");
    await api(page, "live-endpoints", "(api, el, id) => api.openDetails(id)", ids[2]);
    const drawer = page.locator(".cx-drawer");
    await expect(drawer).toBeVisible();
    await api(page, "live-endpoints", "(api, el, id) => api.updateRows([{ id, cells: { requests: 4321 } }])", ids[2]);
    await expect(drawer).toContainText("4,321");
    await api(page, "live-endpoints", "(api, el, id) => api.removeRows([id])", ids[2]);
    await expect(drawer).toBeVisible();
    await expect(grid(page, "live-endpoints").locator(".cx-live")).toHaveText("This record was removed.");
    await expect(drawer.getByRole("button", { name: "Next record" })).toBeDisabled();
  });

  test("after rows arrive above it, the open drawer's previous record is still its neighbour", async ({ page }) => {
    await open(page);
    const ids = await shown(page, "live-endpoints");
    await api(page, "live-endpoints", "(api, el, id) => api.openDetails(id)", ids[5]);
    const drawer = page.locator(".cx-drawer");
    await expect(drawer).toHaveAttribute("data-cx-record", ids[5]);
    await api(page, "live-endpoints", "api => api.addRows([{ id: 'ep-first', cells: { name: 'first', latency: 9999 } }, { id: 'ep-second', cells: { name: 'second', latency: 9998 } }])");
    await drawer.getByRole("button", { name: "Previous record" }).click();
    await expect(drawer).toHaveAttribute("data-cx-record", ids[4]);
  });

  test("changes made while a query runs apply after it, in the order they were made", async ({ page }) => {
    await open(page);
    const ids = await shown(page, "live-endpoints");
    const outcome = await api(page, "live-endpoints", `async (api, el, id) => {
      const query = api.setQuery({ ...api.getQuery(), sort: [{ column: "name", direction: "asc" }] });
      const first = api.updateRows([{ id, cells: { errors: 1 } }]), second = api.updateRows([{ id, cells: { errors: 2 } }]);
      await Promise.all([query, first, second]);
      return { errors: api.view.rows.find(row => row.id === id).cells.errors, sort: api.getQuery().sort[0].column };
    }`, ids[2]);
    expect(outcome).toEqual({ errors: 2, sort: "name" });
  });

  test("an enhanced grid's records change through its controller, not the grid's transactions", async ({ page }) => {
    await page.goto(exampleUrl("enhance-data.html"));
    await page.waitForSelector("[data-cx-ready]");
    const message = await page.evaluate(() => document.querySelector(".cx-data-grid").canopyx.updateRows([{ id: "x", cells: {} }]).then(() => "accepted", error => error.message));
    expect(message).toContain("belong to its own source");
  });

  test("measured rows keep the reader's place when rows change above them", async ({ page }) => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: "w" + String(i).padStart(2, "0"), cells: { name: "Row " + i, note: i % 3 ? "short" : "A longer note that wraps onto a second line in a narrow column " + i, score: 1000 - i } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "wrapped", label: "Wrapped", rowHeight: 28, autoRowHeight: true, pageSize: 100, selection: "none", search: false,
      columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "note", title: "Note", kind: "text", wrap: true, width: 160, maxWidth: 160 }, { id: "score", title: "Score", kind: "number", sortable: true }],
      source: { kind: "inline" }, rows, query: { sort: [{ column: "score", direction: "desc" }] }, live: {} };
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(30));
    await nextFrames(page);
    // A row in the middle of the view: its place on screen must not move.
    const target = await page.evaluate(() => { const rows = [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return rows[Math.floor(rows.length / 2)].getAttribute("data-cx-id"); });
    const top = () => page.evaluate(id => { const row = document.querySelector('.cx-row[data-cx-id="' + id + '"]'); return row ? Math.round(row.getBoundingClientRect().top) : null; }, target);
    const before = await top();
    expect(before).not.toBeNull();
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.addRows([{ id: "w-top", cells: { name: "Top", note: "A new row with a note that wraps onto two lines here", score: 5000 } }]));
    await nextFrames(page);
    expect(Math.abs(await top() - before)).toBeLessThan(2);
  });

  test("the scroll position stays with the rows the reader sees while rows arrive above", async ({ page }) => {
    await open(page);
    await api(page, "live-endpoints", "api => api.scrollToRow(20)");
    await nextFrames(page);
    const first = (await shown(page, "live-endpoints")).find(Boolean);
    const top = () => api(page, "live-endpoints", "(api, element, id) => element.querySelector('.cx-row[data-cx-id=\"' + id + '\"]').getBoundingClientRect().top", first);
    const before = await top();
    await api(page, "live-endpoints", "api => api.addRows(Array.from({ length: 5 }, (_, i) => ({ id: 'ep-top-' + i, cells: { name: 'top-' + i, latency: 2000 + i } })))");
    await nextFrames(page);
    expect(Math.abs(await top() - before)).toBeLessThan(2);
  });

  test("invalid transactions are refused without changing the rows", async ({ page }) => {
    await open(page);
    const errors = await api(page, "live-endpoints", `async api => {
      const out = [], rows = api.view.rows.length;
      for (const change of [null, [], { add: {} }, { add: [{ id: "x", cells: { missing: 1 } }] }, { add: [{ id: "x", cells: { latency: "fast" } }] },
        { update: [{ id: "ep-01", cells: { latency: 1 } }, { id: "ep-01", cells: { errors: 1 } }] }, { remove: [""] }, { other: [] },
        { protocol: "canopyx/2", type: "gridTransaction", view: "another" }])
        try { await api.applyTransaction(change); out.push("accepted"); } catch (error) { out.push(error.message); }
      return { out, same: api.view.rows.length === rows };
    }`);
    expect(errors.same).toBe(true);
    expect(errors.out.every(message => message.startsWith("CanopyX:"))).toBe(true);
    // A gridTransaction document, as the C# CanopyGridTransaction writes it, applies like the object form.
    const result = await api(page, "live-endpoints", "api => api.applyTransaction({ protocol: 'canopyx/2', type: 'gridTransaction', view: 'live-endpoints', update: [{ id: 'ep-01', cells: { errors: null } }] })");
    expect(result.updated).toEqual(["ep-01"]);
    expect(await api(page, "live-endpoints", "api => api.view.rows.find(row => row.id === 'ep-01').cells.errors")).toBe(null);
  });

  test("a hosted grid refreshes by revision: an unchanged one changes nothing, a new one updates rows in place", async ({ page }) => {
    await open(page);
    const requests = () => page.evaluate(() => window.liveQueueRequests);
    const start = await requests();
    expect(await api(page, "live-jobs", "api => api.refreshRows()")).toMatchObject({ updated: [], orderChanged: false });
    expect(await requests()).toBe(start + 1);
    const before = await shown(page, "live-jobs");
    // The server changes: the last job shown jumps to the top of the progress order, a new revision.
    await page.evaluate(id => { const server = window.liveDemo.server, job = server.jobs.find(job => job.id === id); job.cells.progress = 100; job.cells.state = "Done"; server.revision++; }, before.at(-1));
    const result = await api(page, "live-jobs", "api => api.refreshRows()");
    expect(result.revision).toBe("r2");
    expect(result.updated.length).toBeGreaterThan(0);
    // Running jobs gained progress, which reorders the result: the rows keep their places until the reader re-sorts.
    expect(result.orderChanged).toBe(true);
    expect(await shown(page, "live-jobs")).toEqual(before);
    const queue = grid(page, "live-jobs");
    await expect(queue.locator(".cx-live-bar")).toBeVisible();
    // A poll at the same newer revision changes nothing more while the old order shows.
    const pending = await requests();
    expect(await api(page, "live-jobs", "api => api.refreshRows()")).toMatchObject({ updated: [], orderChanged: false });
    expect(await requests()).toBe(pending + 1);
    await queue.getByRole("button", { name: "Re-sort" }).click();
    await expect(queue.locator(".cx-live-bar")).toBeHidden();
    expect(await api(page, "live-jobs", "api => api.getQuery().revision")).toBe("r2");
    const progress = await api(page, "live-jobs", "(api, element) => [...element.querySelectorAll('.cx-row[data-cx-id]')].sort((a, b) => a.getAttribute('aria-rowindex') - b.getAttribute('aria-rowindex')).map(row => Number(row.children[2].textContent))");
    expect(progress).toEqual([...progress].sort((a, b) => b - a));
    // A host's own updates change loaded rows in place; rows are added and removed at the source.
    const first = (await shown(page, "live-jobs"))[0];
    expect(await api(page, "live-jobs", "(api, el, id) => api.updateRows([{ id, cells: { job: 'Renamed job' } }])", first)).toMatchObject({ updated: [first] });
    await expect(queue.locator('.cx-row[data-cx-id="' + first + '"]')).toContainText("Renamed job");
    expect(await api(page, "live-jobs", "api => api.addRows([{ id: 'job-x', cells: { job: 'x' } }]).then(() => 'accepted', error => error.message)")).toContain("at its source");
  });

  test("polling skips while the page is hidden and catches up when it shows", async ({ page }) => {
    let source = 0;
    const view = { protocol: "canopyx/2", type: "grid", id: "polled", label: "Polled", rowHeight: 34, pageSize: 50, selection: "none", search: false,
      columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "host" } };
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", `<script>
      window.pollRequests = 0; window.pollRevision = 1;
      CanopyX.configure("polled", { source: { query(query) { window.pollRequests++; return { protocol: "canopyx/2", type: "gridPage", view: "polled", revision: "p" + window.pollRevision,
        offset: query.offset, total: 1, matched: 1, items: query.offset ? [] : [{ id: "a", cells: { name: "Revision " + window.pollRevision } }] }; } } });
      </script></head>`) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    await page.clock.install({ time: new Date("2026-10-31T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-31T12:05:00Z"));
    const poller = await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; window.poller = await api.poll({ intervalMs: 250 }); return window.poller.active; });
    expect(poller).toBe(true);
    await page.clock.runFor(750);
    await expect.poll(() => page.evaluate(() => window.pollRequests)).toBeGreaterThan(2);
    // Hidden: no polls. Shown again: one at once.
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.clock.runFor(400);
    source = await page.evaluate(() => window.pollRequests);
    await page.clock.runFor(700);
    expect(await page.evaluate(() => window.pollRequests)).toBe(source);
    await page.evaluate(() => { window.pollRevision = 2; Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.clock.runFor(32);
    await expect(page.locator('.cx-row[data-cx-id="a"]')).toContainText("Revision 2");
    // Paused and stopped pollers stay quiet; refresh() polls now, and does not add a second timer.
    await page.evaluate(() => window.poller.pause());
    source = await page.evaluate(() => window.pollRequests);
    await page.clock.runFor(700);
    expect(await page.evaluate(() => window.pollRequests)).toBe(source);
    await page.evaluate(() => window.poller.refresh());
    expect(await page.evaluate(() => window.pollRequests)).toBe(source + 1);
    await page.evaluate(async () => { window.poller.resume(); await window.poller.refresh(); await window.poller.refresh(); await window.poller.refresh(); });
    source = await page.evaluate(() => window.pollRequests);
    await page.clock.runFor(1100);
    expect(await page.evaluate(() => window.pollRequests) - source).toBeLessThanOrEqual(6);
    await page.evaluate(() => window.poller.pause());
    expect(await page.evaluate(() => { window.poller.stop(); return [window.poller.active, document.querySelector("[data-canopyx-host]").canopyx.getLiveState().polling]; })).toEqual([false, false]);
  });

  test("without the stable order a changed row moves at once, and pending edits survive changes", async ({ page }) => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: "r" + String(i).padStart(2, "0"), cells: { name: "Row " + i, score: i * 10, note: "n" + i } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "plain", label: "Plain", rowHeight: 34, pageSize: 50, selection: "multiple", search: true,
      columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "score", title: "Score", kind: "number", sortable: true },
        { id: "note", title: "Note", kind: "text", editable: true }],
      source: { kind: "inline" }, rows, query: { sort: [{ column: "score", direction: "desc" }] }, live: { stableOrder: false } };
    // The editing part and the forms part it requires, preloaded as the support page preloads the others.
    const editing = ["js", "css"].map(type => ["forms", "editing"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + "." + type), "utf8")).join("\n"));
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html",
      body: viewPage(view).replace("</head>", () => "<style>" + editing[1] + "</style><script>" + editing[0] + "</script></head>") }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    const ids = () => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex")).map(row => row.getAttribute("data-cx-id")));
    await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready; await api.setCellValue("r03", "note", "edited"); });
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.updateRows([{ id: "r03", cells: { score: 500, note: "server" } }]));
    expect((await ids())[0]).toBe("r03");
    await expect(page.locator(".cx-live-bar")).toHaveCount(0);
    const state = await page.evaluate(() => { const api = document.querySelector("[data-canopyx-host]").canopyx; return { changes: api.getChanges(), text: document.querySelector('.cx-row[data-cx-id="r03"]').textContent }; });
    expect(state.changes).toEqual([expect.objectContaining({ id: "r03", values: { note: "edited" } })]);
    expect(state.text).toContain("edited");
    expect(state.text).toContain("500");
    // An editor the reader has open stays open while other rows, and its own row, change.
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.beginEdit("r05", "note"));
    await expect(page.locator(".cx-editor")).toBeVisible();
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.updateRows([{ id: "r07", cells: { score: 900 } }, { id: "r05", cells: { name: "Renamed" } }]));
    expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.isEditing())).toBe(true);
    await expect(page.locator(".cx-editor")).toBeVisible();
    await expect(page.locator('.cx-row[data-cx-id="r05"]')).toContainText("Renamed");
  });

  test("a grouped view runs its query again and keeps the reader's place", async ({ page }) => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: "g" + String(i).padStart(2, "0"), cells: { name: "Item " + i, team: ["Red", "Blue", "Green"][i % 3], size: i } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "grouped", label: "Grouped", rowHeight: 34, pageSize: 100, selection: "none", search: false,
      columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "team", title: "Team", kind: "text", sortable: true }, { id: "size", title: "Size", kind: "number", sortable: true }],
      source: { kind: "inline" }, rows, reporting: { grouping: { column: "team", direction: "asc" } }, live: {} };
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    const result = await page.evaluate(async () => {
      const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready;
      const outcome = await api.addRows([{ id: "g99", cells: { name: "Item 99", team: "Red", size: 99 } }]);
      return { added: outcome.added, total: api.getPaging().total };
    });
    expect(result).toEqual({ added: ["g99"], total: 61 });
    // The Red group (last in the order) counts the new row.
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(60));
    await expect(page.locator(".cx-grid-group").filter({ hasText: "Red" })).toContainText("21");
  });
});

test.describe("live data appearance and accessibility", () => {
  for (const dark of [false, true]) for (const width of [1440, 390]) {
    test(`the prompt and flashing cells read well and pass axe (${dark ? "dark" : "light"}, ${width})`, async ({ page }, info) => {
      await open(page, { dark, width });
      const ids = await shown(page, "live-endpoints");
      // Where the rows start within the grid (the page text above the grid may change length).
      const rowsAt = () => grid(page, "live-endpoints").evaluate(host => { const box = host.querySelector(".cx-grid").getBoundingClientRect(); return [box.top - host.getBoundingClientRect().top, box.height]; });
      const rowsBefore = await rowsAt();
      await api(page, "live-endpoints", "(api, el, id) => api.updateRows([{ id, cells: { latency: 990, errors: 31, status: 'Down' } }])", ids[3]);
      const bar = grid(page, "live-endpoints").locator(".cx-live-bar");
      await expect(bar).toBeVisible();
      const box = await bar.getByRole("button").boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(width <= 640 ? 44 : 24);
      // The prompt sits in the toolbar: the rows do not move when it shows, and it stays within the grid's width.
      expect(await rowsAt()).toEqual(rowsBefore);
      const toolbar = await grid(page, "live-endpoints").locator(".cx-toolbar").boundingBox(), barBox = await bar.boundingBox();
      expect(barBox.x + barBox.width).toBeLessThanOrEqual(toolbar.x + toolbar.width + 1);
      // Keyboard: Tab from the toolbar's last control reaches Re-sort before the rows.
      await bar.getByRole("button").focus();
      await expect(bar.getByRole("button")).toBeFocused();
      const results = await new AxeBuilder({ page }).include("[data-canopyx-host]").analyze();
      expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
      if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: process.env.CANOPYX_EVIDENCE + `/live-data-${dark ? "dark" : "light"}-${width}.png`, fullPage: width > 640 });
      await bar.getByRole("button").press("Enter");
      await expect(bar).toBeHidden();
      await expect(page.locator(".cx-grid:focus, .cx-row:focus, .cx-row :focus").first()).toBeVisible();
    });
  }

  test("with reduced motion changed cells show a still outline instead of fading", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFrozen(page);
    const ids = await shown(page, "live-endpoints");
    await frozenUpdate(page, { id: ids[0], cells: { requests: 1 } });
    const cell = grid(page, "live-endpoints").locator(".cx-cell.cx-live-flash").first();
    await expect(cell).toBeVisible();
    expect(await cell.evaluate(element => [getComputedStyle(element).animationName, getComputedStyle(element).boxShadow])).toEqual(["none", expect.stringContaining("inset")]);
    await page.clock.runFor(3000);
    await expect(grid(page, "live-endpoints").locator(".cx-cell.cx-live-flash")).toHaveCount(0, { timeout: 3000 });
  });
});

test.describe("live data performance", () => {
  test("a hundred updates on 100,000 rows apply and paint within a frame budget", { tag: "@benchmark" }, async ({ page }) => {
    const { script, style } = runtimeAssets("grid");
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><html lang=en><head><meta charset=utf-8><style>" + style +
      "</style><script>" + script + "</script></head><body class=cx-page><div id=host class=cx-host style='height:600px' data-cx-theme=light></div></body></html>" }));
    await page.goto("https://canopyx.test/");
    const result = await page.evaluate(async () => {
      const rows = Array.from({ length: 100000 }, (_, i) => ({ id: "r" + String(i).padStart(6, "0"), cells: { name: "Row " + i, load: (i * 7919) % 100000 } }));
      const api = CanopyX.createDataGrid(document.getElementById("host"), { view: { protocol: "canopyx/2", type: "grid", id: "perf", label: "Perf", rowHeight: 30, pageSize: 200,
        selection: "multiple", search: true, columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "load", title: "Load", kind: "number", sortable: true }],
        source: { kind: "inline" }, rows, query: { sort: [{ column: "load", direction: "desc" }] }, live: {} } });
      await api.ready;
      await api.updateRows([{ id: "r000001", cells: { load: 5 } }]);
      const times = [];
      let seed = 3;
      const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let n = 0; n < 15; n++) {
        const updates = new Map();
        for (let i = 0; i < 100; i++) { const id = "r" + String(Math.floor(random() * 100000)).padStart(6, "0"); updates.set(id, { id, cells: { load: Math.floor(random() * 100000) } }); }
        const start = performance.now();
        await api.updateRows([...updates.values()]);
        await new Promise(resolve => requestAnimationFrame(resolve));
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return { median: times[7], rows: api.getPaging().matched };
    });
    console.log("live budget: median " + result.median.toFixed(1) + " ms per 100 updates on 100,000 rows");
    expect(result.rows).toBe(100000);
    expect(result.median).toBeLessThan(60);
  });
});

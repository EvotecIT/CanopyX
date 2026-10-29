import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { exampleUrl, repo } from "./support.mjs";

async function board(page, settings = {}) {
  await page.goto(exampleUrl("board.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.addScriptTag({ content: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-live.js"), "utf8") });
  await page.addStyleTag({ content: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-live.css"), "utf8") });
  await page.evaluate(async options => {
    const host = document.querySelector("[data-canopyx-host]"), previous = host.canopyx;
    await previous.ready;
    const view = JSON.parse(JSON.stringify(previous.view)); previous.destroy(); host.replaceChildren();
    view.id = "board-test"; delete view.stateKey; delete view.facets; delete view.reporting;
    view.columns = [
      { id: "title", title: "Task", kind: "text", rowHeader: true, sortable: true },
      { id: "status", title: "Status", kind: "text", filterable: true, editable: true },
      { id: "team", title: "Team", kind: "text", filterable: true },
      { id: "priority", title: "Priority", kind: "text" }
    ];
    view.board = { column: "status", titleColumn: "title", fields: ["team", "priority"], editable: true,
      lanes: [{ value: "todo", label: "To do" }, { value: "doing", label: "In progress", wipLimit: options.limit || 10 }, { value: "done", label: "Complete" }] };
    if (options.swimlanes) view.board.swimlaneColumn = "team";
    view.search = true; view.rows = Array.from({ length: options.count || 12 }, (_, index) => ({ id: "r" + index,
      cells: { title: "Task " + index, status: index % 3 === 0 ? "doing" : "todo", team: index % 2 ? "Platform" : "Operations", priority: "Normal" } }));
    if (options.typedLane) {
      const date = options.typedLane === "datetime"; view.columns[1].kind = date ? "datetime" : "text";
      const values = date ? ["2026-10-25T14:00:00+02:00", "2026-10-25T12:00:00Z", null] : [true, "true", null, ""];
      view.rows = values.map((status, index) => ({ id: "r" + index, cells: { title: "Task " + index, status, team: "Platform" } }));
      view.board.lanes = date ? [{ value: "2026-10-25T12:00:00.000Z", label: "Window" }, { value: null, label: "Unassigned" }] :
        [{ value: true, label: "Boolean" }, { value: "true", label: "Text" }, { value: null, label: "Unassigned" }, { value: "", label: "Empty text" }];
    }
    view.query = { search: "", sort: [], filters: [] };
    view.source = { kind: "inline" }; view.presentation = "continuous"; view.pageSize = 100;
    const opts = { view, editing: { isEditable: () => !window.lockBoard }, onBoardMove: options.deferred ? () => new Promise(resolve => { window.acceptMove = resolve; }) : options.accept ? () => true : () => false };
    if (options.hosted) {
      const rows = view.rows; window.hostRows = rows; window.hostRevision = "board-snapshot"; delete view.rows; view.source = { kind: "host" }; window.boardRequests = [];
      opts.source = { query(query) { window.boardRequests.push(query); return { protocol: "canopyx/2", type: "gridPage", view: view.id,
        revision: window.hostRevision, offset: query.offset, total: rows.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }; } };
    }
    if (options.rejectWriter) opts.editing = { commit: batch => ({ protocol: "canopyx/2", type: "gridCommitResult", view: view.id,
      rows: batch.rows.map(row => ({ id: row.id, status: "error", error: "Host refused the change" })) }) };
    window.boardApi = CanopyX.createDataGrid(host, opts); window.boardErrors = [];
    host.addEventListener("canopyx:error", event => window.boardErrors.push(event.detail.error.message));
    window.boardProposals = []; host.addEventListener("canopyx:boardMove", event => window.boardProposals.push(event.detail.proposal));
    await window.boardApi.ready;
  }, settings);
  await expect(page.locator(".cx-board-card").first()).toBeVisible();
}
const lane = (page, value) => page.locator(".cx-board-lane").filter({ has: page.getByRole("heading", { name: value, exact: true }) });
const card = (page, id) => page.locator('[data-cx-board-record="' + id + '"]');

test("board rejected host proposal and failed writer preserve the original lane", async ({ page }) => {
  for (const settings of [{}, { accept: true, rejectWriter: true }]) {
    await board(page, settings);
    await card(page, "r1").locator(".cx-board-move").selectOption('"done"');
    await expect(lane(page, "To do").locator('[data-cx-board-record="r1"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.boardApi.getChanges().length)).toBe(0);
    const proposals = await page.evaluate(() => window.boardProposals);
    expect(proposals[0]).toMatchObject({ protocol: "canopyx/2", type: "gridCommit", view: "board-test", rows: [{ id: "r1", values: { status: "done" } }] });
  }
});

test("board keyboard move is a governed edit and announces its result", async ({ page }) => {
  await board(page, { accept: true });
  await card(page, "r1").focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect(lane(page, "In progress").locator('[data-cx-board-record="r1"]')).toBeVisible();
  await expect(page.locator(".cx-live")).toContainText("Task 1 moved to In progress");
  await expect.poll(() => page.evaluate(() => window.boardApi.view.rows.find(row => row.id === "r1").cells.status.value ?? window.boardApi.view.rows.find(row => row.id === "r1").cells.status)).toBe("doing");
  await expect(card(page, "r1")).toBeFocused();
});

test("board work limits include records hidden by search", async ({ page }) => {
  await board(page, { accept: true, limit: 4 });
  await page.evaluate(() => window.boardApi.setQuery({ search: "Task 1" }));
  await expect(lane(page, "In progress").locator(".cx-board-count")).toHaveText("4 / 4");
  await card(page, "r1").focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect(lane(page, "To do").locator('[data-cx-board-record="r1"]')).toBeVisible();
  expect(await page.evaluate(() => window.boardProposals.length)).toBe(0);
});

test("board stale asynchronous proposal cannot change a new query", async ({ page }) => {
  await board(page, { deferred: true });
  await card(page, "r1").locator(".cx-board-move").selectOption('"done"');
  await page.waitForFunction(() => typeof window.acceptMove === "function");
  await page.evaluate(async () => { await window.boardApi.setQuery({ search: "Task 2" }); window.acceptMove(true); });
  await expect.poll(() => page.evaluate(() => window.boardApi.getChanges().length)).toBe(0);
  expect(await page.evaluate(() => window.boardApi.view.rows.find(row => row.id === "r1").cells.status)).toBe("todo");
});

test("board virtualises 5000 cards and reaches the last record in a lane", async ({ page }) => {
  await board(page, { count: 5000, swimlanes: true });
  expect(await page.locator(".cx-board-card").count()).toBeLessThan(30);
  const todo = lane(page, "To do").locator(".cx-board-scroll");
  await todo.evaluate(node => { node.scrollTop = node.scrollHeight; });
  // Non-numeric identities sort by code unit, so r998 is the final Operations card in the accepted query.
  await expect(card(page, "r998")).toBeVisible();
  await expect(card(page, "r998").locator(".cx-board-title")).toHaveText("Task 998");
  expect(await page.locator(".cx-board-card").count()).toBeLessThan(30);
});

test("board phone lane picker and saved views retain shared filters and lane", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await board(page);
  await page.getByLabel("Lane", { exact: true }).selectOption('"doing"');
  await expect(lane(page, "In progress")).toBeVisible(); await expect(lane(page, "To do")).toBeHidden();
  await page.evaluate(async () => { await window.boardApi.setQuery({ search: "Task", filters: [{ column: "team", operator: "eq", values: ["Platform"] }] }); await window.boardApi.saveView("Platform work"); });
  await page.getByLabel("Lane", { exact: true }).selectOption('"done"');
  await page.evaluate(async () => { await window.boardApi.setQuery({ search: "Task 2" }); await window.boardApi.applySavedView("Platform work"); });
  await expect(page.getByLabel("Lane", { exact: true })).toHaveValue('"doing"');
  expect(await page.evaluate(() => window.boardApi.getQuery().filters)).toMatchObject([{ column: "team", operator: "eq", values: ["Platform"] }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("board card opens the shared record panel and print materialises virtual cards", async ({ page }) => {
  await board(page, { count: 120 });
  await card(page, "r1").locator(".cx-board-title").click();
  await expect(page.getByRole("dialog")).toBeVisible(); await expect(page.getByRole("dialog")).toContainText("Task 1");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator(".cx-board-card")).toHaveCount(120);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect(await page.locator(".cx-board-card").count()).toBeLessThan(30);
  expect(await page.evaluate(() => window.boardErrors)).toEqual([]);
});

test("board drag offers the same edit proposal as keyboard movement", async ({ page }) => {
  await board(page, { accept: true });
  await card(page, "r1").dragTo(lane(page, "Complete").locator(".cx-board-scroll"));
  await expect(lane(page, "Complete").locator('[data-cx-board-record="r1"]')).toBeVisible();
  expect(await page.evaluate(() => window.boardProposals[0].rows)).toEqual([{ id: "r1", values: { status: "done" } }]);
});

test("board concurrent pending proposals reserve the last work slot", async ({ page }) => {
  await board(page, { deferred: true, limit: 5 });
  await card(page, "r1").focus(); await page.keyboard.press("Alt+ArrowRight");
  await page.waitForFunction(() => typeof window.acceptMove === "function");
  await card(page, "r2").focus(); await page.keyboard.press("Alt+ArrowRight");
  expect(await page.evaluate(() => window.boardProposals.length)).toBe(1);
  await page.evaluate(() => window.acceptMove(true));
  await expect(lane(page, "In progress").locator('[data-cx-board-record="r1"]')).toBeVisible();
  await expect(lane(page, "To do").locator('[data-cx-board-record="r2"]')).toBeVisible();
});

test("hosted board loads complete revision-bound pages and opens records beyond the grid cache", async ({ page }) => {
  await board(page, { count: 350, hosted: true });
  const todo = lane(page, "To do").locator(".cx-board-scroll"); await todo.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await card(page, "r349").locator(".cx-board-title").click();
  await expect(page.getByRole("dialog")).toContainText("Task 349");
  const requests = await page.evaluate(() => window.boardRequests);
  expect(requests.some(query => query.revision === "board-snapshot" && query.limit === 10000)).toBe(true);
  expect(await page.evaluate(() => window.boardErrors)).toEqual([]);
});

test("board uses the existing facet panel to update its accepted query", async ({ page }) => {
  await page.goto(exampleUrl("board.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx?.ready);
  await page.evaluate(async () => { const api = document.querySelector("[data-canopyx-host]").canopyx; await api.ready; });
  const facet = page.getByRole("complementary", { name: "Refine" });
  await facet.getByRole("checkbox", { name: /Platform/ }).check();
  await expect.poll(() => page.locator(".cx-board-card").count()).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filters))
    .toEqual(expect.arrayContaining([expect.objectContaining({ column: "team", values: ["Platform"] })]));
});

test("board honors read-only changes after it has mounted", async ({ page }) => {
  await board(page, { accept: true }); await page.evaluate(() => window.boardApi.setReadOnly(true));
  await expect(card(page, "r1").locator(".cx-board-move")).toBeDisabled();
  await card(page, "r1").focus(); await page.keyboard.press("Alt+ArrowRight");
  expect(await page.evaluate(() => window.boardProposals.length)).toBe(0);
  await page.evaluate(() => window.boardApi.setReadOnly(false));
  await expect(card(page, "r1").locator(".cx-board-move")).toBeEnabled();
});

test("board typed lane identities match dates by instant and preserve boolean null and empty text", async ({ page }) => {
  await board(page, { typedLane: "datetime" });
  await expect(lane(page, "Window").locator(".cx-board-count")).toHaveText("2");
  await expect(lane(page, "Unassigned").locator(".cx-board-count")).toHaveText("1");
  await board(page, { typedLane: "text" });
  for (const label of ["Boolean", "Text", "Unassigned", "Empty text"]) await expect(lane(page, label).locator(".cx-board-count")).toHaveText("1");
});

test("board deferred approval rechecks read-only and per-record editing permission", async ({ page }) => {
  for (const permission of ["readOnly", "record"]) {
    await board(page, { deferred: true });
    await card(page, "r1").locator(".cx-board-move").selectOption('\"done\"');
    await page.waitForFunction(() => typeof window.acceptMove === "function");
    await page.evaluate(kind => { if (kind === "readOnly") window.boardApi.setReadOnly(true); else window.lockBoard = true; window.acceptMove(true); }, permission);
    await expect(card(page, "r1").locator(".cx-board-move")).toBeDisabled();
    await expect(lane(page, "To do").locator('[data-cx-board-record="r1"]')).toBeVisible();
    expect(await page.evaluate(() => window.boardApi.view.rows.find(row => row.id === "r1").cells.status)).toBe("todo");
    expect(await page.evaluate(() => window.boardApi.getChanges())).toEqual([]);
  }
});

test("board live transactions reconcile cards and work limits and retire pending approvals", async ({ page }) => {
  await board(page, { deferred: true, limit: 5 });
  await card(page, "r1").focus(); await page.keyboard.press("Alt+ArrowRight");
  await page.waitForFunction(() => typeof window.acceptMove === "function");
  await page.evaluate(async () => {
    await window.boardApi.updateRows([{ id: "r2", cells: { status: "doing", title: "Updated task" } }]);
    await window.boardApi.removeRows(["r4"]);
  });
  await expect(lane(page, "In progress").locator(".cx-board-count")).toHaveText("5 / 5");
  await expect(lane(page, "In progress").locator('[data-cx-board-record="r2"]')).toContainText("Updated task");
  await expect(card(page, "r4")).toHaveCount(0);
  await page.evaluate(() => window.acceptMove(true));
  await expect(card(page, "r1").locator(".cx-board-move")).toBeEnabled();
  await expect(lane(page, "To do").locator('[data-cx-board-record="r1"]')).toBeVisible();
  expect(await page.evaluate(() => window.boardApi.getChanges())).toEqual([]);
});

test("hosted board follows held-row pushes and a refreshed source revision", async ({ page }) => {
  await board(page, { hosted: true });
  await page.evaluate(() => window.boardApi.updateRows([{ id: "r1", cells: { status: "done", title: "Pushed task" } }]));
  await expect(lane(page, "Complete").locator('[data-cx-board-record="r1"]')).toContainText("Pushed task");
  await page.evaluate(async () => {
    window.hostRows.find(row => row.id === "r2").cells.status = "done";
    window.hostRows.find(row => row.id === "r2").cells.title = "Refreshed task";
    window.hostRevision = "board-next"; await window.boardApi.refreshRows();
  });
  await expect(lane(page, "Complete").locator('[data-cx-board-record="r2"]')).toContainText("Refreshed task");
  await expect(lane(page, "To do").locator('[data-cx-board-record="r1"]')).toContainText("Task 1");
});

test("destroying a board releases its host for an ordinary grid", async ({ page }) => {
  await board(page);
  await page.evaluate(async () => {
    const api = window.boardApi, host = document.querySelector("[data-canopyx-host]"), view = JSON.parse(JSON.stringify(api.view));
    api.destroy(); host.replaceChildren(); delete view.board;
    window.boardApi = CanopyX.createDataGrid(host, { view }); await window.boardApi.ready;
  });
  await expect(page.locator(".cx-grid")).toBeVisible();
  await expect(page.locator(".cx-board")).toHaveCount(0);
});

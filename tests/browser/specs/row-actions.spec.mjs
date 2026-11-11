import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

// Row actions (docs/row-actions.md): the actions column raises host proposals and applies nothing itself.
// The example's mock scheduler answers at once with #instant; the other tests mount a grid whose hook they control.
const cell = (page, id) => page.locator('[data-cx-id="' + id + '"] .cx-row-actions-cell');
const action = (page, id, name) => cell(page, id).locator('[data-cx-row-action="' + name + '"]');

async function example(page) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(exampleUrl("row-actions.html") + "#instant");
  await page.waitForSelector("[data-cx-ready]", { state: "attached" });
  await expect(action(page, "backup", "run")).toBeVisible();
  await page.evaluate(() => {
    window.outcomes = [];
    document.querySelector("[data-canopyx-host]").addEventListener("canopyx:rowAction", event => window.outcomes.push(event.detail));
  });
  return errors;
}

// A grid of three rows whose onRowAction returns a promise the test settles: window.answer(value) or window.fail(message).
async function controlled(page, extra = {}) {
  await page.goto(exampleUrl("row-actions.html"));
  await page.waitForSelector("[data-cx-ready]", { state: "attached" });
  await page.evaluate(async extra => {
    const host = document.querySelector("[data-canopyx-host]"), previous = host.canopyx;
    previous.destroy(); host.replaceChildren();
    window.calls = []; window.outcomes = [];
    const view = { protocol: "canopyx/2", type: "grid", id: "controlled", label: "Controlled", rowHeight: 40, pageSize: 50, selection: "single", search: false,
      columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }, { id: "state", title: "State", kind: "text" }],
      source: { kind: "inline" }, rows: [
        { id: "a", cells: { name: "Alpha", state: "idle" } }, { id: "b", cells: { name: "Beta", state: "idle" } }, { id: "c", cells: { name: "Gamma", state: "busy" } }],
      rowActions: { inline: 1, reveal: extra.reveal, actions: [
        { id: "start", label: "Start", icon: "play", disabledWhen: { operator: "and", filters: [{ column: "state", operator: "eq", values: ["busy"] }], groups: [] }, disabledReason: "Already running." },
        { id: "edit", label: "Edit", icon: "edit" }, { id: "remove", label: "Remove", icon: "delete", tone: "danger" }] } };
    host.addEventListener("canopyx:rowAction", event => window.outcomes.push(event.detail));
    window.grid = CanopyX.createDataGrid(host, { view, interactionTimeoutMs: extra.timeout, onRowAction: (proposal, request) => new Promise((resolve, reject) => {
      window.calls.push({ proposal, reason: request.reason, revision: request.revision, frozen: Object.isFrozen(proposal) && Object.isFrozen(proposal.row) });
      window.answer = resolve; window.fail = message => reject(new Error(message));
      request.signal.addEventListener("abort", () => { window.aborted = request.signal.reason?.name; }, { once: true });
    }) });
    await window.grid.ready;
  }, extra);
  await expect(action(page, "a", "start")).toBeVisible();
}

test("the example's actions follow each job's state, lock system jobs and stay out of static output", async ({ page }) => {
  const errors = await example(page);
  await expect(action(page, "backup", "run")).toHaveAttribute("aria-label", "Run now");
  await expect(action(page, "index", "pause")).toHaveAttribute("aria-label", "Pause");
  await expect(action(page, "digest", "resume")).toHaveAttribute("aria-label", "Resume");
  await expect(cell(page, "index").locator("[data-cx-row-action=run]")).toHaveCount(0);
  await expect(cell(page, "backup").getByRole("group", { name: "Actions" })).toBeVisible();
  // Disabled per row: the button stays reachable, says why, and raises nothing.
  await expect(action(page, "reports", "run")).toHaveAttribute("aria-disabled", "true");
  await expect(action(page, "reports", "run")).toHaveAttribute("aria-description", "Enable the job before running it.");
  await action(page, "reports", "run").click({ force: true });
  expect(await page.evaluate(() => window.outcomes.length)).toBe(0);
  // A locked row shows a named lock and no buttons.
  await expect(cell(page, "audit").getByRole("img", { name: "System job: read-only" })).toBeVisible();
  await expect(cell(page, "audit").locator("button")).toHaveCount(0);
  // The column is the grid's own: neither the source's view nor CSV exports carry it.
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.view.columns.some(column => column.id === "cx-row-actions"))).toBe(false);
  const csv = await page.evaluate(async () => await document.querySelector("[data-canopyx-host]").canopyx.toCsv({ scope: "all" }));
  expect(csv.split(/\r?\n/)[0]).not.toContain("Actions");
  await page.goto(exampleUrl("row-actions-static.html"));
  await expect(page.locator("table")).toContainText("Nightly backup");
  await expect(page.locator("button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a pointer proposal is accepted or rejected by the host, with the message shown and announced", async ({ page }) => {
  const errors = await example(page);
  await action(page, "backup", "run").click();
  const status = page.locator(".cx-ra-status");
  await expect(status).toHaveAttribute("role", "alert");
  await expect(status).toContainText("The backup target is offline.");
  await expect(action(page, "backup", "run")).toHaveAttribute("data-cx-state", "rejected");
  await expect(action(page, "backup", "run")).toHaveAttribute("aria-description", /backup target is offline/);
  // Accepted: the host's own live update changes the row, and its actions follow.
  await action(page, "warmup", "run").click();
  await expect(status).toBeHidden();
  await expect(action(page, "warmup", "pause")).toBeVisible();
  await expect(page.locator(".cx-data-grid .cx-live")).toHaveText("Run now: done");
  expect(await page.evaluate(() => window.outcomes.map(item => [item.proposal.id, item.proposal.action, item.accepted, item.reason, item.message])))
    .toEqual([["backup", "run", false, "pointer", "The backup target is offline. Try again when it is reachable."], ["warmup", "run", true, "pointer", null]]);
  expect(errors).toEqual([]);
});

test("keyboard reaches the buttons through cell navigation and opens the More menu", async ({ page }) => {
  const errors = await example(page);
  await page.locator('[data-cx-id="certs"]').focus();
  await page.keyboard.press("End");
  await expect(cell(page, "certs")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(action(page, "certs", "run")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const more = action(page, "certs", "");
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-haspopup", "menu");
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("menuitem")).toHaveText(["Edit", "Delete"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-ra-status")).toContainText("Another job depends on Certificate renewal.");
  await expect(action(page, "certs", "")).toBeFocused();
  expect(await page.evaluate(() => window.outcomes.map(item => [item.proposal.action, item.accepted, item.reason]))).toEqual([["delete", false, "keyboard"]]);
  // Escape from a button returns to the row; the grid keeps one Tab stop.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-cx-id="certs"]')).toBeFocused();
  expect(await cell(page, "certs").locator("button").evaluateAll(buttons => buttons.map(button => button.tabIndex))).toEqual([-1, -1]);
  expect(errors).toEqual([]);
});

test("a right click lists every action of the row", async ({ page }) => {
  const errors = await example(page);
  await page.locator('[data-cx-id="index"] [role=gridcell]').first().click({ button: "right" });
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Pause", "Edit", "Delete"]);
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("a pending proposal keeps its row busy, leaves other rows free and settles on the host's answer", async ({ page }) => {
  await controlled(page);
  await action(page, "a", "start").click();
  await expect(action(page, "a", "start")).toHaveAttribute("aria-busy", "true");
  await expect(action(page, "a", "start")).toHaveAttribute("aria-description", "Start: working");
  await expect(page.locator(".cx-data-grid .cx-live")).toHaveText("Start: working");
  expect(await page.evaluate(() => window.calls.map(call => [call.proposal.id, call.proposal.action, call.proposal.row.cells.name, call.frozen])))
    .toEqual([["a", "start", "Alpha", true]]);
  // The same row takes no second proposal; another row does.
  expect(await page.evaluate(() => window.grid.requestRowAction("a", "edit"))).toEqual({ accepted: false, reason: "api", message: null });
  await action(page, "b", "start").click();
  expect(await page.evaluate(() => window.calls.length)).toBe(2);
  await page.evaluate(() => window.answer({ accepted: false, message: "Beta is locked by another user." }));
  await expect(page.locator(".cx-ra-status")).toContainText("Beta is locked by another user.");
  await expect(action(page, "a", "start")).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.outcomes.map(item => [item.proposal.id, item.accepted, item.message]))).toEqual([["b", false, "Beta is locked by another user."]]);
});

test("the API resolves with acceptance, a failure is reported and cancellation aborts the host's signal", async ({ page }) => {
  await controlled(page);
  const accepted = page.evaluate(() => window.grid.requestRowAction("a", "edit", { reason: "shortcut" }));
  await page.waitForFunction(() => window.calls?.length === 1);
  await page.evaluate(() => window.answer(true));
  expect(await accepted).toEqual({ accepted: true, reason: "shortcut", message: null });
  expect(await page.evaluate(() => window.outcomes.at(-1).reason)).toBe("shortcut");
  const failed = page.evaluate(() => window.grid.requestRowAction("a", "start"));
  await page.waitForFunction(() => window.calls.length === 2);
  await page.evaluate(() => window.fail("Scheduler unavailable"));
  // The caller hears what the status line shows.
  expect(await failed).toEqual({ accepted: false, reason: "api", message: "Start failed: Scheduler unavailable" });
  await expect(page.locator(".cx-ra-status")).toContainText("Start failed: Scheduler unavailable");
  const cancelled = page.evaluate(() => window.grid.requestRowAction("b", "start"));
  await page.waitForFunction(() => window.calls.length === 3);
  expect(await page.evaluate(() => window.grid.cancelRowAction("b"))).toBe(true);
  expect(await cancelled).toEqual({ accepted: false, reason: "api", message: null });
  expect(await page.evaluate(() => window.aborted)).toBe("AbortError");
  await expect(action(page, "b", "start")).not.toHaveAttribute("aria-busy", "true");
  // Disabled by condition: the API refuses as the button does.
  expect((await page.evaluate(() => window.grid.requestRowAction("c", "start"))).accepted).toBe(false);
  // A host veto cancels before the hook.
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").addEventListener("canopyx:beforeRowAction", event => event.preventDefault(), { once: true }));
  expect(await page.evaluate(() => window.grid.requestRowAction("a", "edit"))).toEqual({ accepted: false, reason: "api", message: null });
  expect(await page.evaluate(() => window.calls.length)).toBe(3);
});

test("the deadline settles a proposal the host never answers", async ({ page }) => {
  await controlled(page, { timeout: 200 });
  expect(await page.evaluate(() => window.grid.requestRowAction("a", "start"))).toMatchObject({ accepted: false, message: "Start failed: no answer within 200 ms" });
  await expect(page.locator(".cx-ra-status")).toContainText("Start failed: no answer within 200 ms");
  expect(await page.evaluate(() => window.aborted)).toBe("TimeoutError");
});

test("hover reveal keeps buttons reachable, and the column stays pinned at the end edge, also right to left", async ({ page }) => {
  await controlled(page, { reveal: "hover" });
  const start = action(page, "b", "start");
  // The cell repaints once the part has started; read the button that is in the page.
  await expect.poll(() => start.evaluate(button => getComputedStyle(button).opacity)).toBe("0");
  await page.locator('[data-cx-id="b"]').hover();
  await expect.poll(() => start.evaluate(button => getComputedStyle(button).opacity)).toBe("1");
  await page.mouse.move(0, 0);
  await page.locator('[data-cx-id="a"]').focus();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await expect(action(page, "a", "start")).toBeFocused();
  await expect.poll(() => action(page, "a", "start").evaluate(button => getComputedStyle(button).opacity)).toBe("1");
  await expect(cell(page, "a")).toHaveAttribute("data-cx-pin", "right");
  // The narrow column keeps its name for assistive technology and shows no clipped title.
  const header = page.locator('.cx-hcell[data-cx-column="cx-row-actions"]');
  await expect(header).toHaveAccessibleName("Actions");
  expect(await header.locator(".cx-htext").evaluate(text => getComputedStyle(text).visibility)).toBe("hidden");
  await page.evaluate(() => { document.querySelector("[data-canopyx-host]").dir = "rtl"; });
  const [grid, actions] = await Promise.all([page.locator(".cx-grid").boundingBox(), cell(page, "a").boundingBox()]);
  expect(actions.x - grid.x).toBeLessThan(40);
});

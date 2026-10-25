// Task lists, dialogs, pick steps, records fields and host sections (docs/flow.md): the hub and its host states, Save and
// return, a dialog that keeps focus and asks before discarding, a picker whose selection and tray are the answer, typed
// confirmation and a conditional acknowledgement, records rows with their checks, and fields a host section swaps.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, next, stepTitle } from "./flow-support.mjs";

const task = (page, id) => page.locator(`.cx-flow-task[data-cx-task="${id}"]`);

test("a task list opens on its hub with the host's states, and Save and return brings the reader back", async ({ page }) => {
  await page.clock.install();
  await openFlow(page, "flow-setup-tasks.html");
  await expect(stepTitle(page)).toHaveText("Tasks");
  await expect(page.locator(".cx-flow-hub-progress")).toHaveText("0 of 3 tasks complete");
  await expect(task(page, "licence")).toHaveAttribute("data-cx-state", "blocked");
  await expect(task(page, "licence").locator(".cx-flow-task-blockers")).toHaveText("Waiting for the licence email");
  await expect(task(page, "licence").locator("button")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".cx-flow-task-group .cx-flow-section-title")).toHaveText(["Connect", "Content", "Access"]);
  await expect(page.locator(".cx-flow-actions .cx-flow-next")).toHaveAttribute("aria-disabled", "true");

  await task(page, "mail").locator("button").click();
  await expect(stepTitle(page)).toHaveText("Choose who gets notified");
  await field(page, "admins").locator("input").first().fill("admin@example.com");
  await page.getByRole("button", { name: "Save and return" }).click();
  await expect(stepTitle(page)).toHaveText("Tasks");
  await expect(task(page, "mail")).toHaveAttribute("data-cx-state", "complete");
  await expect(task(page, "mail").locator("button")).toBeFocused();
  // Returning to the hub starts the example's 150 ms status refresh. Complete that host answer
  // before testing a later explicit override; either operation may legitimately replace an earlier state.
  await page.clock.runFor(200);
  await flowCall(page, "setStepState", "licence", { state: "complete", summary: "Activated" });
  await expect(task(page, "licence")).toHaveAttribute("data-cx-state", "complete");
  await expect(task(page, "licence").locator(".cx-flow-task-summary")).toHaveText("Activated");
});

test("a host section loads its fields for the chosen engine and swaps them when the engine changes", async ({ page }) => {
  await openFlow(page, "flow-setup-tasks.html");
  await task(page, "database").locator("button").click();
  await expect(field(page, "sqlInstance")).toBeVisible();
  await page.getByText("PostgreSQL").click();
  await expect(field(page, "pgSchema").locator("input")).toHaveValue("public");
  await expect(field(page, "sqlInstance")).toHaveCount(0);
  await field(page, "server").locator("input").fill("db01.example.com");
  await field(page, "pgSchema").locator("input").fill("reports");
  expect(await flowCall(page, "getValues")).toMatchObject({ engine: "pg", pgSchema: "reports", pgSsl: "require" });
});

test("records rows are added, checked row by row and counted on the hub", async ({ page }) => {
  await openFlow(page, "flow-setup-tasks.html");
  await task(page, "schedules").locator("button").click();
  const rows = page.locator(".cx-flow-records-row");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Add to Schedules" }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Save and return" }).click();
  await expect(field(page, "schedule").locator(".cx-flow-error")).toHaveText(/^Row 2: /);
  await rows.nth(1).locator("select").selectOption({ label: "Usage" });
  await rows.nth(1).locator("input[type=time]").fill("18:30");
  await page.getByRole("button", { name: "Remove row 1" }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Save and return" }).click();
  await expect(task(page, "schedules")).toHaveAttribute("data-cx-state", "complete");
  expect((await flowCall(page, "getValues")).schedule).toEqual([{ report: "usage", time: "18:30", weekdays: false }]);
});

test("a dialog flow keeps focus inside, asks before discarding answers, and returns focus to its launcher", async ({ page }) => {
  await openFlow(page, "flow-act-on-rows.html");
  const launcher = page.getByRole("button", { name: "Retire servers…" });
  await launcher.click();
  const dialog = page.locator("dialog.cx-flow-dialog");
  await expect(dialog).toHaveJSProperty("open", true);
  await expect(stepTitle(page)).toBeFocused();
  // Untouched answers close at once.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveJSProperty("open", false);
  await expect(launcher).toBeFocused();

  await launcher.click();
  await page.locator(".cx-flow-pick-view .cx-grid-row-select").first().check();
  // The grid keeps Escape for itself; from the step's heading it closes the dialog.
  await stepTitle(page).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveJSProperty("open", true);
  await expect(page.locator(".cx-flow-discard")).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.locator(".cx-flow-discard")).toBeHidden();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toHaveJSProperty("open", false);
  await expect(launcher).toBeFocused();
  await launcher.click();
  expect((await flowCall(page, "getValues")).servers).toEqual([]);
});

test("a pick step's selection is the answer, the tray removes picks, and the review asks for typed consent", async ({ page }) => {
  await openFlow(page, "flow-act-on-rows.html");
  await page.evaluate(() => document.addEventListener("canopyx:flowSubmit", event => { window.__proposal = JSON.parse(JSON.stringify(event.detail)); }, { capture: true }));
  await page.getByRole("button", { name: "Retire servers…" }).click();
  await next(page);
  await expect(field(page, "servers").locator(".cx-flow-error")).toHaveText("Which servers? is required.");
  const boxes = page.locator(".cx-flow-pick-view .cx-grid-row-select");
  for (const index of [0, 2, 5]) await boxes.nth(index).check();
  const tray = page.locator(".cx-flow-tray");
  await expect(tray.locator(".cx-flow-tray-label")).toHaveText(["SRV-OSL-01", "SRV-POR-03", "SRV-OSL-06"]);
  await expect(tray.locator(".cx-flow-count")).toHaveText("3 chosen");
  await tray.getByRole("button", { name: "Remove SRV-POR-03" }).click();
  await expect(tray.locator(".cx-flow-tray-label")).toHaveText(["SRV-OSL-01", "SRV-OSL-06"]);
  await expect(boxes.nth(2)).not.toBeChecked();
  await next(page);
  await expect(stepTitle(page)).toHaveText("When and why?");
  await field(page, "reason").locator("textarea").fill("Replaced by new hardware");
  await next(page);
  await expect(page.locator(".cx-flow-acknowledge")).toHaveCount(0);
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-confirm .cx-flow-error")).toHaveText("Type RETIRE exactly to continue.");
  await expect(page.locator(".cx-flow-confirm input")).toBeFocused();
  // Removing the history needs an acknowledgement as well.
  await page.getByRole("button", { name: "Change Monitoring history" }).click();
  await page.getByText("Remove it").click();
  await next(page);
  await page.locator(".cx-flow-confirm input").fill("RETIRE");
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-review").getByText("Confirm this before you submit.")).toBeVisible();
  await page.locator(".cx-flow-acknowledge input").check();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toContainText("2 servers will be retired on 2026-11-02.");
  const proposal = await page.evaluate(() => window.__proposal);
  expect(proposal.values.servers).toEqual([{ id: "srv-01", label: "SRV-OSL-01" }, { id: "srv-06", label: "SRV-OSL-06" }]);
  expect(proposal.values.history).toBe("remove");
});

test("onLeaving returning false keeps a dialog flow open, as cancelling flowLeaving does", async ({ page }) => {
  await openFlow(page, "flow-act-on-rows.html");
  await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), doc = host.canopyx.flow;
    host.canopyx.destroy(); host.innerHTML = "";
    window.__leaving = 0;
    window.CanopyX.createFlow(host, { flow: doc, onLeaving: () => { window.__leaving++; return false; } });
  });
  await page.waitForSelector("[data-canopyx-host][data-cx-ready]", { state: "attached" });
  await page.getByRole("button", { name: "Retire servers…" }).click();
  await page.locator(".cx-flow-pick-view .cx-grid-row-select").first().check();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog.cx-flow-dialog")).toHaveJSProperty("open", true);
  await expect(page.locator(".cx-flow-discard")).toBeHidden();
  expect(await page.evaluate(() => window.__leaving)).toBe(1);
  expect(await flowCall(page, "close")).toBe(false);
});

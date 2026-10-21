import { test, expect } from "@playwright/test";
import { mountRuntime, documentOf, reviewStep } from "./flow-host-regression-support.mjs";

const flow = documentOf([{ id: "schedules", title: "Schedules", group: "Content", fields: [{
  id: "schedule", type: "records", label: "Schedules", columns: [{ id: "name", title: "Name", type: "text" }], default: [{ name: "Daily" }]
}] }, reviewStep], { mode: "tasks" });
const hooks = `({ hooks: { status: () => new Promise(resolve => { window.__status = resolve; }) } })`;
const task = page => page.locator('[data-cx-task="schedules"]');

async function press(page, button, input) {
  if (input === "space") { await button.focus(); await page.keyboard.down("Space"); }
  else { const box = await button.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); }
}
async function release(page, input) {
  if (input === "space") await page.keyboard.up("Space"); else await page.mouse.up();
}
async function answerStatus(page, state) {
  await page.evaluate(state => window.__status({ schedules: { state, summary: "Status received" } }), state);
  await expect(task(page).locator(".cx-flow-task-summary")).toHaveText("Status received");
}

for (const input of ["pointer", "space"]) test(`an asynchronous task status update preserves a pending ${input} activation`, async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow, hooks)).toBeNull();
  await press(page, task(page).getByRole("button"), input);
  await answerStatus(page, "notStarted");
  await release(page, input);
  await expect(page.locator(".cx-flow-records-row")).toHaveCount(1);
  expect(await page.evaluate(() => window.__api.getStep())).toBe("schedules");
  expect(await page.evaluate(() => [window.__errors, window.__rejections])).toEqual([[], []]);
});

test("an asynchronous status update preserves a pending hub review click", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow, hooks)).toBeNull();
  // Keep the row's height stable so this case isolates control replacement, not a release outside a moved button.
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "complete", summary: "Previous status" }));
  await press(page, page.locator(".cx-flow-next"), "pointer");
  await answerStatus(page, "complete");
  await release(page, "pointer");
  await expect.poll(() => page.evaluate(() => window.__api.getStep())).toBe("review");
});

test("a task blocked between pointer down and up cannot open", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow, hooks)).toBeNull();
  await press(page, task(page).getByRole("button"), "pointer");
  await answerStatus(page, "blocked");
  await release(page, "pointer");
  expect(await page.evaluate(() => window.__api.getStep())).toBe("#tasks");
  await expect(task(page).getByRole("button")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".cx-flow-records-row")).toHaveCount(0);
});

test("a hub review action blocked between pointer down and up cannot open review", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow, hooks)).toBeNull();
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "complete", summary: "Previous status" }));
  await press(page, page.locator(".cx-flow-next"), "pointer");
  await answerStatus(page, "blocked");
  await release(page, "pointer");
  expect(await page.evaluate(() => window.__api.getStep())).toBe("#tasks");
  await expect(page.locator(".cx-flow-next")).toHaveAttribute("aria-disabled", "true");
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
});

test("a responsive hub repaint preserves a pending Space activation", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow)).toBeNull();
  await press(page, task(page).getByRole("button"), "space");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator(".cx-flow")).toHaveClass(/cx-flow-narrow/);
  await release(page, "space");
  await expect(page.locator(".cx-flow-records-row")).toHaveCount(1);
  expect(await page.evaluate(() => window.__api.getStep())).toBe("schedules");
});

for (const status of ["error", "conflict"]) test(`a task hub without review displays a host ${status} and clears it on reset`, async ({ page }, testInfo) => {
  const withoutReview = documentOf(flow.steps.filter(step => step.type !== "review"), { mode: "tasks" });
  expect(await mountRuntime(page, testInfo, withoutReview, `({ hooks: { submit: () => ({ status: "${status}", message: "Host could not save the tasks." }) } })`)).toBeNull();
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "complete" }));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Host could not save the tasks.");
  if (status === "conflict") await expect(page.getByRole("button", { name: "Reload current settings", exact: true })).toBeVisible();
  await page.evaluate(() => window.__api.reset());
  await expect(page.locator(".cx-flow-answer-banner")).toHaveCount(0);
  expect(await page.evaluate(() => [window.__errors, window.__rejections])).toEqual([[], []]);
});

test("a retried task submission replaces its message and status updates preserve a pending conflict reload", async ({ page }, testInfo) => {
  const withoutReview = documentOf(flow.steps.filter(step => step.type !== "review"), { mode: "tasks" });
  expect(await mountRuntime(page, testInfo, withoutReview, `({ hooks: { submit: () => {
    window.__attempt = (window.__attempt || 0) + 1;
    return { status: window.__attempt === 1 ? "error" : "conflict", message: "Attempt " + window.__attempt };
  } }, onReload: () => { window.__reloads = (window.__reloads || 0) + 1; } })`)).toBeNull();
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "complete" }));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Attempt 1");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Attempt 2");
  const reload = page.getByRole("button", { name: "Reload current settings", exact: true });
  await reload.focus(); await page.keyboard.down("Space");
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "complete", summary: "Status refreshed" }));
  await page.keyboard.up("Space");
  await expect.poll(() => page.evaluate(() => window.__reloads || 0)).toBe(1);
  expect(await page.evaluate(() => [window.__errors, window.__rejections])).toEqual([[], []]);
});

for (const lifecycle of ["reset", "restore"]) for (const initial of ["pending", "settled"]) test(`${lifecycle} on the hub renews ${initial} host status ownership without refreshing ordinary repaints`, async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, flow, `({ hooks: { status: (values, { signal }) => new Promise(resolve => {
    (window.__statuses ||= []).push({ values, signal, resolve });
  }) } })`)).toBeNull();
  await page.waitForFunction(() => window.__statuses?.length === 1);
  if (initial === "settled") {
    await page.evaluate(() => window.__statuses[0].resolve({ schedules: { state: "complete", summary: "Previous host state" } }));
    await expect(task(page)).toHaveAttribute("data-cx-state", "complete");
  }
  await page.evaluate(lifecycle => lifecycle === "reset" ? window.__api.reset() : window.__api.setState(window.__api.getState()), lifecycle);
  await expect.poll(() => page.evaluate(() => window.__statuses.length)).toBe(2);
  expect(await page.evaluate(() => window.__statuses[0].signal.aborted)).toBe(true);
  await page.evaluate(() => {
    window.__statuses[0].resolve({ schedules: { state: "complete", summary: "Retired host state" } });
    window.__statuses[1].resolve({ schedules: { state: "blocked", summary: "Current host state" } });
  });
  await expect(task(page)).toHaveAttribute("data-cx-state", "blocked");
  await expect(task(page).locator(".cx-flow-task-summary")).toHaveText("Current host state");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator(".cx-flow")).toHaveClass(/cx-flow-narrow/);
  await page.evaluate(() => window.__api.setStepState("schedules", { state: "blocked", summary: "Host pushed an update" }));
  expect(await page.evaluate(() => window.__statuses.length)).toBe(2);
  expect(await page.evaluate(() => [window.__errors, window.__rejections])).toEqual([[], []]);
});

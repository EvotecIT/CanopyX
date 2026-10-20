// Server checks (docs/flow.md#server-checks): a check runs through hooks.check with a signal, shows running, pass, warning
// and fail with details, marks its result stale when a tested answer changes, gates Next as the document asks, reads each
// secret it tests once, can be cancelled, fails in place on the host's timeout, and reports its result in the proposal.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, next, stepTitle, recordEvents } from "./flow-support.mjs";

const check = (page, id) => page.locator(`.cx-flow-check-item[data-cx-check="${id}"]`);

test("a check runs, shows its details, and goes stale when a tested answer changes", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  const events = await recordEvents(page);
  await page.getByRole("button", { name: "Test the connection" }).click();
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "running");
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "pass");
  await expect(check(page, "connection").locator(".cx-flow-check-details")).toContainText("220 mail.example.com ESMTP ready");
  await field(page, "host").locator("input").fill("other.example.com");
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "stale");
  // A field the check does not test leaves its result alone.
  await field(page, "port").locator("input").fill("587");
  expect((await events()).filter(event => event.name === "error")).toEqual([]);
});

test("Next runs a required check, and a warning needs an acknowledgement first", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await field(page, "host").locator("input").fill("slow.example.com");
  await next(page);
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "warning");
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
  await expect(page.locator(".cx-flow-summary")).toContainText("Test the connection");
  await check(page, "connection").locator(".cx-flow-check-ack input").check();
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
});

test("a failed check shows the host's field messages and keeps the reader on the step", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await field(page, "host").locator("input").fill("fail.example.com");
  await next(page);
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "fail");
  await expect(field(page, "host").locator(".cx-flow-error")).toHaveText("Not reachable from the service.");
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
});

test("a pass-required check reads the typed secret once and blocks Next until it passes", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await page.evaluate(() => {
    window.__reads = [];
    document.addEventListener("canopyx:flowCheck", event => window.__reads.push(event.detail.result.status), true);
  });
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  await field(page, "password").locator("input").fill("short");
  await next(page);
  await expect(check(page, "sign-in-test")).toHaveAttribute("data-cx-state", "fail");
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  await field(page, "password").locator("input").fill("long-enough-password");
  await expect(check(page, "sign-in-test")).toHaveAttribute("data-cx-state", "stale");
  await next(page);
  await expect(stepTitle(page)).toHaveText("Where does the mail go?");
  expect(await page.evaluate(() => window.__reads)).toEqual(["pass", "fail", "pass"]);
});

test("Cancel aborts a running check through its signal, and a slow hook fails on the timeout", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await page.getByRole("button", { name: "Test the connection" }).click();
  await check(page, "connection").getByRole("button", { name: "Cancel" }).click();
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "none");

  await page.evaluate(() => {
    const old = document.querySelector("[data-canopyx-host]");
    const doc = old.canopyx.flow;
    old.canopyx.destroy(); old.remove();
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    document.querySelector(".cx-main").prepend(host);
    window.__aborted = false;
    window.CanopyX.createFlow(host, { flow: doc, timeout: 150, hooks: { check: (id, values, { signal }) => new Promise(() => signal.addEventListener("abort", () => { window.__aborted = true; })) } });
  });
  await page.waitForSelector("[data-canopyx-host][data-cx-ready]", { state: "attached" });
  expect(await flowCall(page, "runCheck", "connection")).toMatchObject({ status: "fail" });
  await expect(check(page, "connection")).toHaveAttribute("data-cx-state", "fail");
  await expect(check(page, "connection")).toContainText("The host did not answer in time.");
  expect(await page.evaluate(() => window.__aborted)).toBe(true);
});

test("the proposal carries the checks that ran on the submitted answers", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await page.evaluate(() => document.addEventListener("canopyx:flowSubmit", event => { window.__checks = event.detail.checks; }, { capture: true }));
  await flowCall(page, "runCheck", "connection");
  await flowCall(page, "runCheck", "sign-in-test");
  await flowCall(page, "setValues", { host: "other.example.com" });
  await flowCall(page, "runCheck", "connection");
  // A stale result stays out of the proposal: the sign-in test ran on the old server name.
  expect(await flowCall(page, "submit")).toBeNull();
  await flowCall(page, "runCheck", "sign-in-test");
  expect(await flowCall(page, "submit")).toMatchObject({ status: "saved" });
  await expect(page.locator(".cx-flow-result")).toBeVisible();
  const checks = await page.evaluate(() => window.__checks);
  expect(Object.keys(checks).sort()).toEqual(["connection", "sign-in-test"]);
  expect(checks.connection.status).toBe("pass");
  expect(Date.parse(checks.connection.at)).not.toBeNaN();
});

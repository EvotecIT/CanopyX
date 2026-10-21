import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { mountRuntime, documentOf, checkedStep, reviewStep, deferredCheck, checkItem } from "./flow-host-regression-support.mjs";

for (const source of ["edit", "state"]) test(`a check cannot certify answers changed during its run through ${source}`, async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([checkedStep, reviewStep]), deferredCheck)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks?.length === 1);
  if (source === "edit") await field(page, "name").locator("input").fill("changed");
  else await page.evaluate(() => window.__api.setState({ values: { name: "changed" } }));
  await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
});

test("restoring changed answers invalidates a completed check and reloads its dependent options", async ({ page }, testInfo) => {
  const step = { ...checkedStep, fields: [...checkedStep.fields, { id: "relay", type: "select", label: "Relay", source: "host", dependsOn: ["name"] }] };
  expect(await mountRuntime(page, testInfo, documentOf([step, reviewStep]), `({ hooks: {
    check: () => ({ status: "pass" }), options: (id, values) => { (window.__options ||= []).push(values.name); return [{ value: values.name }]; }
  } })`)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__options)).toEqual(["original"]);
  await page.evaluate(() => window.__api.runCheck("test"));
  await page.evaluate(() => window.__api.setState({ values: { name: "restored" } }));
  await expect.poll(() => page.evaluate(() => window.__options)).toEqual(["original", "restored"]);
  expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
});

test("a check consumes each named secret once", async ({ page }, testInfo) => {
  const step = { ...checkedStep, fields: [...checkedStep.fields, { id: "password", type: "secret", label: "Password" }],
    checks: [{ ...checkedStep.checks[0], fields: ["name", "password"] }] };
  expect(await mountRuntime(page, testInfo, documentOf([step]), `({ hooks: { check: (id, values, { secret }) => {
    window.__reads = [secret("password"), secret("password"), secret("name")]; return { status: "pass" };
  } } })`)).toBeNull();
  await field(page, "password").locator("input").fill("Private-value");
  await page.evaluate(() => window.__api.runCheck("test"));
  expect(await page.evaluate(() => window.__reads)).toEqual(["Private-value", null, null]);
});

for (const boundary of ["cancel", "reset", "destroy"]) test(`an unread check secret is revoked at ${boundary}`, async ({ page }, testInfo) => {
  const step = { ...checkedStep, fields: [{ id: "password", type: "secret", label: "Password" }], checks: [{ ...checkedStep.checks[0], fields: ["password"] }] };
  expect(await mountRuntime(page, testInfo, documentOf([step]), deferredCheck)).toBeNull();
  await field(page, "password").locator("input").fill("Discarded-value");
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks?.length === 1);
  if (boundary === "cancel") await checkItem(page).getByRole("button", { name: "Cancel" }).click();
  else await page.evaluate(boundary => window.__api[boundary](), boundary);
  expect(await page.evaluate(() => window.__checks[0].context.secret("password"))).toBeNull();
  await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test("Cancel settles an uncooperative check and late completion cannot replace its successor", async ({ page }, testInfo) => {
  await page.clock.install();
  expect(await mountRuntime(page, testInfo, documentOf([checkedStep]), deferredCheck)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test").then(value => { window.__cancelled = value === null; }); });
  await page.waitForFunction(() => window.__checks?.length === 1);
  await checkItem(page).getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => page.evaluate(() => window.__cancelled)).toBe(true);
  await page.evaluate(() => { window.__new = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks.length === 2);
  await page.evaluate(() => window.__checks[1].resolve({ status: "fail", message: "Current failure" }));
  expect((await page.evaluate(() => window.__new)).status).toBe("fail");
  await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
  await page.clock.runFor(30001);
  await expect(checkItem(page)).toHaveAttribute("data-cx-state", "fail");
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test("a required check rerun cannot submit its previous passing result", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([checkedStep, reviewStep]), deferredCheck)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks?.length === 1);
  await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
  await page.evaluate(() => window.__pending);
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks.length === 2);
  expect(await page.evaluate(() => window.__api.submit())).toBeNull();
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
  await page.evaluate(() => window.__checks[1].resolve({ status: "fail" }));
  await page.evaluate(() => window.__pending);
});

test("an uncooperative check still fails in place when its actual timeout expires", async ({ page }, testInfo) => {
  await page.clock.install();
  expect(await mountRuntime(page, testInfo, documentOf([checkedStep]), deferredCheck)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
  await page.waitForFunction(() => window.__checks?.length === 1);
  await page.clock.runFor(30001);
  expect((await page.evaluate(() => window.__pending)).status).toBe("fail");
  expect(await page.evaluate(() => window.__checks[0].context.signal.aborted)).toBe(true);
  expect(await page.evaluate(() => window.__errors)).toEqual([{ hook: "check", message: "The host did not answer in time." }]);
});

test("a later check pass clears only its previous field errors", async ({ page }, testInfo) => {
  const step = { ...checkedStep, fields: [...checkedStep.fields, { id: "other", type: "text", label: "Other" }] };
  expect(await mountRuntime(page, testInfo, documentOf([step]), `({ hooks: { check: () => ++window.__count === 1
    ? { status: "fail", fieldErrors: { name: "Check failure" } } : { status: "pass" } }, onReady: () => { window.__count = 0; } })`)).toBeNull();
  await page.evaluate(() => window.__api.runCheck("test"));
  await expect(field(page, "name").locator(".cx-flow-error")).toHaveText("Check failure");
  await page.evaluate(() => window.__api.setFieldError("other", "Independent host error"));
  await page.evaluate(() => window.__api.runCheck("test"));
  await expect(field(page, "name").locator(".cx-flow-error")).toBeHidden();
  await expect(field(page, "other").locator(".cx-flow-error")).toHaveText("Independent host error");
});

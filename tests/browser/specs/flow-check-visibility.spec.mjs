import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { mountRuntime, documentOf, checkedStep, reviewStep, deferredCheck } from "./flow-host-regression-support.mjs";

const when = field => ({ operator: "and", filters: [{ field, operator: "eq", values: [true] }] });
function conditionalFlow(boundary) {
  const detail = { id: "detail", type: "text", label: "Detail", default: "checked" };
  const step = { ...checkedStep, checks: [{ ...checkedStep.checks[0], fields: ["name", "detail"] }] };
  const controls = [{ id: "show", type: "toggle", label: "Show detail", default: true },
    { id: "unrelated", type: "text", label: "Unrelated", default: "before" }];
  if (boundary === "chain") controls.push({ id: "middle", type: "toggle", label: "Middle", default: true, when: when("show") });
  if (boundary === "section") { step.fields = checkedStep.fields; step.sections = [{ id: "details", label: "Details", when: when("show"), fields: [detail] }]; }
  else if (boundary === "step") { step.fields = checkedStep.fields; }
  else { detail.when = when(boundary === "chain" ? "middle" : "show"); step.fields = [...checkedStep.fields, detail]; }
  const steps = [{ id: "controls", title: "Controls", fields: controls }, step];
  if (boundary === "step") steps.push({ id: "details", title: "Details", when: when("show"), fields: [detail] });
  return documentOf([...steps, reviewStep], { mode: "free" });
}

for (const boundary of ["field", "section", "step", "chain"]) {
  for (const phase of ["settled", "pending"]) test(`a ${phase} check is invalidated by its ${boundary} visibility controller`, async ({ page }, testInfo) => {
    expect(await mountRuntime(page, testInfo, conditionalFlow(boundary), deferredCheck)).toBeNull();
    await page.evaluate(() => { window.__pending = window.__api.runCheck("test"); });
    await page.waitForFunction(() => window.__checks?.length === 1);
    if (phase === "settled") {
      await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
      await page.evaluate(() => window.__pending);
    }
    // An unrelated answer must not invalidate a check with explicit field dependencies.
    await field(page, "unrelated").locator("input").fill("after");
    if (phase === "pending") expect(await page.evaluate(() => window.__checks[0].context.signal.aborted)).toBe(false);
    else expect((await page.evaluate(() => window.__api.validate())).valid).toBe(true);
    await field(page, "show").locator("label").click();
    if (phase === "pending") {
      expect(await page.evaluate(() => window.__checks[0].context.signal.aborted)).toBe(true);
      await page.evaluate(() => window.__checks[0].resolve({ status: "pass" }));
      expect(await page.evaluate(() => window.__pending)).toBeNull();
    }
    expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
    expect(await page.evaluate(() => window.__api.submit())).toBeNull();
    expect(await page.evaluate(() => window.__submissions)).toEqual([]);
    // A fresh run sees the new effective inputs and restores the gate.
    await page.evaluate(() => { window.__next = window.__api.runCheck("test"); });
    await page.waitForFunction(() => window.__checks.length === 2);
    expect(await page.evaluate(() => Object.hasOwn(window.__checks[1].values, "detail"))).toBe(false);
    await page.evaluate(() => window.__checks[1].resolve({ status: "pass" }));
    await page.evaluate(() => window.__next);
    expect((await page.evaluate(() => window.__api.validate())).valid).toBe(true);
  });
}

test("restoring a visibility controller invalidates its check", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, conditionalFlow("chain"), `({ hooks: { check: () => ({ status: "pass" }) } })`)).toBeNull();
  await page.evaluate(() => window.__api.runCheck("test"));
  await page.evaluate(() => window.__api.setState({ values: { show: false, unrelated: "before", middle: true, name: "original", detail: "checked" } }));
  expect((await page.evaluate(() => window.__api.validate())).valid).toBe(false);
});

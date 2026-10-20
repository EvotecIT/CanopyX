import { test, expect } from "@playwright/test";
import { mountContract as mount } from "./flow-contract-support.mjs";

for (const metadata of [{ baseline: "r1" }, { storedSecrets: ["token"] }]) {
  test(`edit metadata ${Object.keys(metadata)[0]} never applies create defaults`, async ({ page }) => {
    await mount(page, [
      { id: "count", type: "number", label: "Count", path: "count", default: 7 },
      { id: "token", type: "secret", label: "Token" }
    ], "({onSubmit:detail=>{window.__proposal=detail;return {status:'saved'};}})", undefined, metadata);
    expect(await page.evaluate(() => window.__api.getValues())).toEqual({ count: null });
    await page.evaluate(() => window.__api.submit());
    expect(await page.evaluate(() => window.__proposal.mode)).toBe("edit");
    expect(await page.evaluate(() => window.__proposal.patch)).toEqual([]);
  });
}

test("revealing a required field retires its step completion", async ({ page }) => {
  await mount(page, [], "({})", undefined, { steps: [
    { id: "one", title: "First", fields: [{ id: "show", type: "toggle", label: "Show", default: false }] },
    { id: "two", title: "Second", fields: [{ id: "detail", type: "text", label: "Detail", required: true,
      when: { operator: "and", filters: [{ field: "show", operator: "eq", values: [true] }] } }] },
    { id: "three", title: "Third", type: "info" }
  ] });
  await page.evaluate(async () => { await window.__api.next(); await window.__api.next(); await window.__api.goTo("one"); window.__api.setValues({ show: true }); await window.__api.next(); });
  expect(await page.evaluate(() => window.__api.getState().completed)).not.toContain("two");
  await page.evaluate(() => window.__api.goTo("three"));
  expect(await page.evaluate(() => window.__api.getStep())).toBe("two");
});

test("render-time mount failure releases earlier editors and the root before remount", async ({ page }) => {
  await mount(page, []);
  const result = await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]"); window.__api.destroy();
    let disposed = 0;
    const fields = [{ id: "first", type: "custom", label: "First", editor: "first" }, { id: "bad", type: "custom", label: "Bad", editor: "bad" }];
    const flow = { kind: "flow", version: 1, id: "failed", title: "Failed", steps: [{ id: "one", title: "One", fields }] };
    const broken = window.CanopyX.createFlow(host, { flow, editors: {
      first: { create: () => ({ element: document.createElement("input"), getValue: () => null, destroy: () => disposed++ }) },
      bad: { create: () => { throw new Error("Editor failed"); } }
    } });
    await broken.ready.catch(() => {}); broken.destroy();
    const leftover = host.querySelectorAll(".cx-flow").length;
    const replacement = window.CanopyX.createFlow(host, { flow: { ...flow, steps: [{ id: "one", title: "One", fields: [] }] } });
    await replacement.ready; window.__api = replacement;
    return { disposed, leftover, roots: host.querySelectorAll(".cx-flow").length };
  });
  expect(result).toEqual({ disposed: 1, leftover: 0, roots: 1 });
});

for (const action of ["reset", "destroy"]) test(`navigation stops after its host callback calls ${action}`, async ({ page }) => {
  await mount(page, [], "({})", undefined, { steps: [{ id: "one", title: "One", type: "info" }, { id: "two", title: "Two", type: "info" }] });
  const result = await page.evaluate(async action => {
    const host = document.querySelector("[data-canopyx-host]"); let changed = 0;
    host.addEventListener("canopyx:flowStepChanged", () => changed++);
    host.addEventListener("canopyx:flowStepChanging", () => window.__api[action](), { once: true });
    const moved = await window.__api.next();
    return { moved, changed, step: action === "reset" ? window.__api.getStep() : null, roots: host.querySelectorAll(".cx-flow").length };
  }, action);
  expect(result).toEqual({ moved: false, changed: 0, step: action === "reset" ? "one" : null, roots: action === "reset" ? 1 : 0 });
});

// Public flow contracts at asynchronous host boundaries and across JSON value shapes.
import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { mountContract as mount } from "./flow-contract-support.mjs";

const name = { id: "name", type: "text", label: "Name", required: true, default: "valid" };

for (const action of ["change", "reset", "destroy", "cancel"]) test(`a rejected event response stays observed after ${action}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await mount(page, [name]);
  await page.evaluate(action => {
    const host = document.querySelector("[data-canopyx-host]");
    host.addEventListener("canopyx:flowSubmit", event => {
      event.detail.respondWith(new Promise((resolve, reject) => window.__reject = reject));
      if (action === "change") window.__api.setValues({ name: "new answer" });
      else if (action === "cancel") event.preventDefault();
      else window.__api[action]();
    });
    window.__pending = window.__api.submit();
  }, action);
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  await page.evaluate(async () => { window.__reject(new Error("Superseded host failure")); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(errors).toEqual([]);
  await expect(page.locator(".cx-flow-result, .cx-flow-progress, .cx-flow-answer-banner")).toHaveCount(0);
});

for (const [boundary, source] of [["callback", "api"], ["callback", "typing"], ["hook", "api"], ["event", "api"]])
test(`a pending ${boundary} submission cannot settle newer ${source} answers`, async ({ page }) => {
  const wait = "detail => new Promise(resolve => { window.__proposal = detail; window.__release = resolve; })";
  const options = boundary === "callback" ? `({ onSubmit: ${wait} })` : boundary === "hook" ? `({ hooks: { submit: ${wait} } })` : "({})";
  await mount(page, [name], options);
  await page.evaluate(boundary => {
    window.__settlements = 0;
    const host = document.querySelector("[data-canopyx-host]");
    host.addEventListener("canopyx:flowSubmitted", () => window.__settlements++);
    if (boundary === "event") host.addEventListener("canopyx:flowSubmit", event => {
      window.__proposal = event.detail;
      event.detail.respondWith(new Promise(resolve => window.__release = resolve));
    });
    window.__pending = window.__api.submit();
  }, boundary);
  await page.waitForFunction(() => !!window.__release);
  expect(await page.evaluate(() => window.__proposal.values.name)).toBe("valid");
  if (source === "typing") await field(page, "name").locator("input").fill("new answer");
  else await page.evaluate(() => window.__api.setValues({ name: "new answer" }));
  await page.evaluate(() => window.__release({ status: "saved", message: "Previous answer saved" }));
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  expect(await page.evaluate(() => window.__settlements)).toBe(0);
  await expect(field(page, "name").locator("input")).toHaveValue("new answer");
  await expect(page.locator(".cx-flow-result")).toHaveCount(0);
  await page.evaluate(() => { window.__release = null; window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => !!window.__release);
  expect(await page.evaluate(() => window.__proposal.values.name)).toBe("new answer");
  await page.evaluate(() => window.__release({ status: "saved", message: "Current answer saved" }));
  await page.evaluate(() => window.__pending);
  await expect(page.locator(".cx-flow-result")).toContainText("Current answer saved");
});

test("submit never proposes answers changed during the whole-flow check", async ({ page }) => {
  await mount(page, [name], `({ hooks: { validateFlow: () => new Promise(resolve => window.__release = resolve) },
    onSubmit: detail => { window.__proposal = detail; return { status: "saved" }; } })`);
  await page.evaluate(() => { window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => !!window.__release);
  await field(page, "name").locator("input").fill("");
  await page.evaluate(() => window.__release(null));
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  expect(await page.evaluate(() => !!window.__proposal)).toBe(false);
  await expect(page.locator(".cx-flow-result")).toHaveCount(0);
});

for (const boundary of ["validation", "answer"]) test(`reset invalidates the previous submission during ${boundary}`, async ({ page }) => {
  const options = boundary === "validation"
    ? `({ hooks: { validateFlow: () => new Promise(resolve => window.__release = resolve) }, onSubmit: () => { window.__submitted = true; return {status:"saved"}; } })`
    : `({ onSubmit: () => new Promise(resolve => window.__release = resolve) })`;
  await mount(page, [name], options);
  await page.evaluate(() => { window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => !!window.__release);
  await page.evaluate(() => { window.__api.reset(); window.__api.setValues({ name: "fresh" }); window.__release({ status: "saved", message: "Old result" }); });
  await page.evaluate(() => window.__pending);
  await expect(field(page, "name").locator("input")).toHaveValue("fresh");
  await expect(page.locator(".cx-flow-result")).toHaveCount(0);
  expect(await page.evaluate(() => !!window.__submitted)).toBe(false);
  // The reset form can submit even while the superseded host work is unrelated to its lifecycle.
  await expect(page.locator(".cx-flow-next")).toBeEnabled();
});

for (const action of ["complete", "setProgress"]) test(`accepted callbacks can call ${action} immediately`, async ({ page }) => {
  await mount(page, [name], `({ onSubmit: () => ({ status: "accepted" }), onSubmitted: answer => {
    if (answer.status === "accepted") window.__accepted = window.__api.${action}(${action === "complete" ? '{status:"saved",message:"Finished immediately"}' : '{done:1,total:2,message:"Already started"}'});
  } })`);
  await page.evaluate(() => window.__api.submit());
  expect(await page.evaluate(() => window.__accepted)).toBe(true);
  await expect(page.locator(action === "complete" ? ".cx-flow-result" : ".cx-flow-progress")).toContainText(action === "complete" ? "Finished immediately" : "Already started");
});

test("valid identifiers matching Object members do not become field errors", async ({ page }) => {
  const ids = ["constructor", "toString", "hasOwnProperty"];
  await mount(page, ids.map(id => ({ id, type: "text", label: id, default: "answer" })),
    `({ hooks: { validateStep: () => ({fieldErrors:{}}), validateFlow: () => ({fieldErrors:{}}) }, onSubmit: () => ({status:"saved"}) })`);
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({ valid: true, errors: [] });
  await page.evaluate(() => window.__api.submit());
  await expect(page.locator(".cx-flow-result")).toBeVisible();
});

test("nullable collections mount and submit as empty answers", async ({ page }) => {
  await mount(page, [
    { id: "tags", type: "list", label: "Tags" },
    { id: "choices", type: "multiChoice", label: "Choices", options: [{value:"a",label:"A"}] }
  ], `({ onSubmit: detail => { window.__proposal = detail; return {status:"saved"}; } })`, { tags: null, choices: null });
  expect(await page.evaluate(() => window.__api.validate())).toMatchObject({ valid: true });
  await page.evaluate(() => window.__api.submit());
  expect(await page.evaluate(() => window.__proposal.values)).toEqual({ tags: null, choices: null });
  await expect(page.locator(".cx-flow-result")).toBeVisible();
});

test("submit cleanup preserves busy state acquired by a correction callback", async ({ page }) => {
  await mount(page, [name], `({ hooks: { validators: { name: () => window.__correcting ? new Promise(resolve => window.__release = resolve) : null } },
    onSubmit: () => ({status:"error",message:"Correct the answer"}), onSubmitted: answer => {
      if (answer.status === "error") { window.__correcting = true; window.__next = window.__api.next(); }
    } })`);
  await page.evaluate(() => window.__api.submit());
  await page.waitForFunction(() => !!window.__release);
  expect(await page.evaluate(() => window.__api.goTo("one"))).toBe(false);
  await page.evaluate(() => { window.__release(null); return window.__next; });
  expect(await page.evaluate(() => window.__api.goTo("one"))).toBe(true);
});

for (const source of ["api", "typing"]) test(`a pending field error cannot attach to a newer ${source} answer`, async ({ page }) => {
  await mount(page, [name], `({ hooks: { validators: { name: value => value === "old"
    ? (window.__check = new Promise(resolve => window.__release = resolve)) : null } } })`);
  const input = field(page, "name").locator("input");
  await input.fill("old"); await input.press("Tab");
  await page.waitForFunction(() => !!window.__release);
  if (source === "api") await page.evaluate(() => window.__api.setValues({ name: "new" }));
  else await input.fill("new");
  await page.evaluate(async () => { window.__release("Old name is unavailable"); await window.__check; await new Promise(requestAnimationFrame); });
  await expect(field(page, "name").locator("input")).toHaveValue("new");
  await expect(field(page, "name").locator(".cx-flow-error")).toBeHidden();
});

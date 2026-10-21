import { test, expect } from "@playwright/test";
import { field } from "./flow-support.mjs";
import { trackScriptLoads } from "./support.mjs";
import { mountRuntime, documentOf, nameField, reviewStep } from "./flow-host-regression-support.mjs";

const hostStep = { id: "two", title: "Host fields", sections: [{ id: "extra", label: "Extra", source: "host" }] };
const draftOptions = `(() => { window.__writes = []; window.__stored = null; return { hooks: {
  draftStore: { load: () => null, save: (id, draft) => new Promise(resolve => window.__writes.push({ draft, finish: () => { window.__stored = draft; resolve(); } })),
    clear: () => { window.__clears = (window.__clears || 0) + 1; window.__stored = null; } }, submit: () => ({ status: "saved" })
} }; })()`;

for (const answer of ["required", "failure", "default"]) test(`submit before visiting a host section waits for its ${answer} definition`, async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "First", fields: [nameField] }, hostStep, reviewStep]), `({ hooks: {
    fields: () => new Promise((resolve, reject) => { window.__definition = { resolve, reject }; }), submit: () => ({ status: "saved" })
  } })`)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.submit(); });
  // A field definition is needed even though this step has never built any inputs.
  await expect.poll(() => page.evaluate(() => !!window.__definition)).toBe(true);
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
  await page.evaluate(answer => {
    if (answer === "failure") window.__definition.reject(new Error("Definitions unavailable"));
    else window.__definition.resolve([{ id: "detail", type: "text", label: "Detail", required: true, ...(answer === "default" ? { default: "Ready" } : {}) }]);
  }, answer);
  const result = await page.evaluate(() => window.__pending);
  if (answer === "default") {
    expect(result).toMatchObject({ status: "saved" });
    expect(await page.evaluate(() => window.__submissions[0].values.detail)).toBe("Ready");
  } else {
    expect(result).toBeNull();
    expect(await page.evaluate(() => window.__submissions)).toEqual([]);
  }
});

test("a failed visible host section blocks Next until its definitions can be retried", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([hostStep, reviewStep]), `({ hooks: { fields: () => { throw new Error("Definitions unavailable"); } } })`)).toBeNull();
  await expect(page.locator(".cx-flow-loading")).toContainText("Definitions unavailable");
  expect(await page.evaluate(() => window.__api.next())).toBe(false);
  expect(await page.evaluate(() => window.__api.getStep())).toBe("two");
});

test("a dependency change replaces pending definitions on an unvisited step before submission", async ({ page }, testInfo) => {
  const step = { ...hostStep, sections: [{ ...hostStep.sections[0], dependsOn: ["name"] }] };
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "First", fields: [nameField] }, step]), `({ hooks: {
    fields: (id, values, { signal }) => new Promise(resolve => { (window.__definitions ||= []).push({ value: values.name, signal, resolve }); }),
    submit: () => ({ status: "saved" })
  } })`)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => window.__definitions?.length === 1);
  await page.evaluate(() => window.__api.setValues({ name: "changed" }));
  await expect.poll(() => page.evaluate(() => window.__definitions.length)).toBe(2);
  expect(await page.evaluate(() => window.__definitions[0].signal.aborted)).toBe(true);
  await page.evaluate(() => window.__definitions[0].resolve([{ id: "obsolete", type: "text", label: "Obsolete", default: "Old" }]));
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
  await page.evaluate(() => window.__definitions[1].resolve([{ id: "current", type: "text", label: "Current", default: "New" }]));
  expect(await page.evaluate(() => window.__pending)).toMatchObject({ status: "saved" });
  expect(await page.evaluate(() => window.__submissions[0].values)).toEqual({ name: "changed", current: "New" });
});

for (const hidden of ["section", "step"]) test(`a ${hidden} hidden during prerequisite loading cannot block submission with its old failure`, async ({ page }, testInfo) => {
  const when = { operator: "and", filters: [{ field: "enabled", operator: "eq", values: [true] }] };
  const step = { ...hostStep, ...(hidden === "step" ? { when } : { sections: [{ ...hostStep.sections[0], when }] }) };
  expect(await mountRuntime(page, testInfo, documentOf([
    { id: "one", title: "First", fields: [{ id: "enabled", type: "toggle", label: "Enabled", default: true }] }, step
  ]), `({ hooks: { fields: () => new Promise((resolve, reject) => { window.__definition = { resolve, reject }; }), submit: () => ({ status: "saved" }) } })`)).toBeNull();
  await page.evaluate(() => { window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => !!window.__definition);
  await page.evaluate(() => { window.__api.setValues({ enabled: false }); window.__definition.reject(new Error("Obsolete failure")); });
  expect(await page.evaluate(() => window.__pending)).toMatchObject({ status: "saved" });
  expect(await page.evaluate(() => window.__submissions[0].values)).toEqual({ enabled: false });
});

test("restoring a dependency reloads the host section definitions", async ({ page }, testInfo) => {
  const step = { ...hostStep, fields: [nameField], sections: [{ ...hostStep.sections[0], dependsOn: ["name"] }] };
  expect(await mountRuntime(page, testInfo, documentOf([step]), `({ hooks: { fields: (id, values) => {
    (window.__definitions ||= []).push(values.name); return [{ id: "detail", type: "text", label: "Detail", default: values.name }];
  } } })`)).toBeNull();
  await expect(field(page, "detail").locator("input")).toHaveValue("original");
  await page.evaluate(() => window.__api.setState({ values: { name: "restored" } }));
  await expect.poll(() => page.evaluate(() => window.__definitions)).toEqual(["original", "restored"]);
});

test("host draft saves retain answer order when an older save is still pending", async ({ page }, testInfo) => {
  await page.clock.install();
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Answers", fields: [nameField] }], { draft: "host" }), draftOptions)).toBeNull();
  await page.evaluate(() => { window.__first = window.__api.saveDraft(); });
  await page.waitForFunction(() => window.__writes.length === 1);
  await page.evaluate(() => { window.__api.setValues({ name: "newer" }); window.__second = window.__api.saveDraft(); });
  // The second call has been made; it must not enter the store ahead of the pending first write.
  expect(await page.evaluate(() => window.__writes.length)).toBe(1);
  await page.evaluate(() => window.__writes[0].finish());
  await page.waitForFunction(() => window.__writes.length === 2);
  await page.evaluate(() => window.__writes[1].finish());
  expect(await page.evaluate(() => Promise.all([window.__first, window.__second]))).toEqual([true, true]);
  expect(await page.evaluate(() => window.__stored.values.name)).toBe("newer");
});

test("successful submission clears a draft after the pending save finishes", async ({ page }, testInfo) => {
  await page.clock.install();
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Answers", fields: [nameField] }], { draft: "host" }), draftOptions)).toBeNull();
  await page.evaluate(() => { window.__first = window.__api.saveDraft(); });
  await page.waitForFunction(() => window.__writes.length === 1);
  expect(await page.evaluate(() => window.__api.submit())).toMatchObject({ status: "saved" });
  await page.evaluate(() => window.__writes[0].finish());
  await page.evaluate(() => window.__first);
  await expect.poll(() => page.evaluate(() => window.__clears)).toBe(1);
  expect(await page.evaluate(() => window.__stored)).toBeNull();
});

test("reset skips a queued draft save belonging to the previous form", async ({ page }, testInfo) => {
  await page.clock.install();
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Answers", fields: [nameField] }], { draft: "host" }), draftOptions)).toBeNull();
  await page.evaluate(() => { window.__first = window.__api.saveDraft(); });
  await page.waitForFunction(() => window.__writes.length === 1);
  await page.evaluate(() => { window.__second = window.__api.saveDraft(); });
  await page.evaluate(() => { window.__api.reset(); window.__writes[0].finish(); });
  await page.evaluate(() => window.__first);
  expect(await page.evaluate(() => window.__writes.length)).toBe(1);
  expect(await page.evaluate(() => window.__second)).toBe(false);
  expect(await page.evaluate(() => window.__writes.length)).toBe(1);
  await expect(page.locator(".cx-flow-draft-note")).toHaveCount(0);
});

for (const state of ["blocked", "needsAction"]) test(`a task becoming ${state} on review prevents submission`, async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Task", fields: [nameField] }, reviewStep], { mode: "tasks" }), `({ hooks: { submit: () => ({ status: "saved" }) } })`)).toBeNull();
  await page.evaluate(() => window.__api.setStepState("one", { state: "complete" }));
  expect(await page.evaluate(() => window.__api.goTo("review"))).toBe(true);
  await page.evaluate(state => window.__api.setStepState("one", { state }), state);
  expect(await page.evaluate(() => window.__api.submit())).toBeNull();
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
});

test("an API submit on the hub cannot bypass a host blocked task", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Task", fields: [nameField] }, reviewStep], { mode: "tasks" }), `({ hooks: { submit: () => ({ status: "saved" }) } })`)).toBeNull();
  await page.evaluate(() => window.__api.setStepState("one", { state: "blocked" }));
  expect(await page.evaluate(() => window.__api.submit())).toBeNull();
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
});

test("a task blocked during host validation cannot reach the submission hook", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Task", fields: [nameField] }], { mode: "tasks" }), `({ hooks: {
    validateFlow: () => new Promise(resolve => { window.__validation = resolve; }), submit: () => ({ status: "saved" })
  } })`)).toBeNull();
  await page.evaluate(() => { window.__api.setStepState("one", { state: "complete" }); window.__pending = window.__api.submit(); });
  await page.waitForFunction(() => !!window.__validation);
  await page.evaluate(() => { window.__api.setStepState("one", { state: "blocked" }); window.__validation(null); });
  expect(await page.evaluate(() => window.__pending)).toBeNull();
  expect(await page.evaluate(() => window.__submissions)).toEqual([]);
});

test("malformed status entries report errors without dropping later valid states", async ({ page }, testInfo) => {
  expect(await mountRuntime(page, testInfo, documentOf([
    { id: "one", title: "First", fields: [nameField] }, { id: "two", title: "Second", fields: [] }
  ], { mode: "tasks" }), `({ hooks: { status: () => ({ one: { state: "done" }, two: { state: "blocked", summary: "Waiting" } }) } })`)).toBeNull();
  await expect(page.locator('[data-cx-task="two"]')).toHaveAttribute("data-cx-state", "blocked");
  expect(await page.evaluate(() => window.__errors.map(error => error.hook))).toEqual(["status"]);
  expect(await page.evaluate(() => window.__rejections)).toEqual([]);
});

test("an explicit document options source mounts with only the plain flow parts", async ({ page }, testInfo) => {
  const scripts = await trackScriptLoads(page);
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", title: "Choice", fields: [
    { id: "region", type: "select", label: "Region", source: "document", options: [{ value: "eu", label: "Europe" }] }
  ] }]))).toBeNull();
  await field(page, "region").locator("select").selectOption({ label: "Europe" });
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ region: "eu" });
  expect([...new Set((await scripts()).map(url => new URL(url).pathname.split("/").pop()))].sort()).toEqual(["canopyx-flow-entry.js", "canopyx-flow.js", "canopyx-forms.js"]);
});

test("a picker keeps a bounded display snapshot of a long label without changing its id", async ({ page }, testInfo) => {
  const id = "x".repeat(256), label = "Label ".repeat(80);
  const view = { protocol: "canopyx/2", type: "grid", id: "choices", label: "Choices", rowHeight: 34, pageSize: 100, columns: [{ id: "name", title: "Name", kind: "text", width: 160 }],
    source: { kind: "inline", navigation: "offset" }, rows: [{ id, cells: { name: label } }] };
  expect(await mountRuntime(page, testInfo, documentOf([{ id: "one", type: "pick", title: "Pick", pick: {
    field: { id: "chosen", label: "Chosen", required: true }, view, label: "name"
  } }]), `({ hooks: { submit: () => ({ status: "saved" }) } })`, "reporting")).toBeNull();
  await page.locator(".cx-grid-row-select").check();
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ chosen: [{ id, label: label.slice(0, 400) }] });
  expect(await page.evaluate(() => window.__api.submit())).toMatchObject({ status: "saved" });
});

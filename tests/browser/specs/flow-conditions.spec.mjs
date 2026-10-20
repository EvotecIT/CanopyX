// The browser evaluates flow conditions exactly as C# does: every case of tests/fixtures/flow-conditions.json (which
// CanopyX.Tests evaluates with CanopyFlowCondition.Evaluate) becomes a tiny flow with one field per value and a probe field
// whose condition is the case's; the probe must show exactly when the case expects the condition to hold.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo } from "./support.mjs";
import { openFlow } from "./flow-support.mjs";

const cases = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/flow-conditions.json"), "utf8"));

/** The fields a condition reads. */
function referenced(condition, into = new Set()) {
  for (const filter of condition.filters || []) into.add(filter.field);
  for (const group of condition.groups || []) referenced(group, into);
  return into;
}

/** A field that holds a value of this shape, or null with the reason no field can. */
function fieldFor(id, value) {
  if (value === null || value === undefined || typeof value === "string") return { field: { id, type: "text", label: id } };
  if (typeof value === "number") return { field: { id, type: "number", label: id } };
  if (typeof value === "boolean") return { field: { id, type: "toggle", label: id } };
  if (Array.isArray(value) && value.every(item => typeof item === "string")) return { field: { id, type: "list", label: id } };
  // Arrays of numbers are multiple-choice answers: their items are option values.
  if (Array.isArray(value) && value.every(item => typeof item === "number")) return { field: { id, type: "multiChoice", label: id, options: value.map(item => ({ value: item })) } };
  return { skip: "no field type holds " + JSON.stringify(value) };
}

/** The flow document of a case, the starting values and any reason the case cannot be expressed. */
function build(entry) {
  const fields = [], values = {};
  for (const id of new Set([...Object.keys(entry.values), ...referenced(entry.condition)])) {
    const value = entry.values[id];
    const made = fieldFor(id, value);
    if (made.skip) return { skip: made.skip };
    fields.push(made.field);
    if (value !== undefined && value !== null) values[id] = value;
  }
  fields.push({ id: "probe", type: "text", label: "Probe", when: entry.condition });
  return { flow: { kind: "flow", version: 1, id: "conditions", title: "Conditions", steps: [{ id: "only", title: "Only", fields }] }, values };
}

test("the browser agrees with C# on every shared condition case", async ({ page }) => {
  await openFlow(page, "flow-pause.html");
  const built = cases.map(entry => ({ name: entry.name, expected: entry.expected, ...build(entry) }));
  const skipped = built.filter(entry => entry.skip).map(entry => entry.name + ": " + entry.skip);
  const results = await page.evaluate(async entries => {
    const out = [];
    for (const entry of entries) {
      if (entry.skip) continue;
      const host = document.body.appendChild(document.createElement("div"));
      try {
        const flow = window.CanopyX.createFlow(host, { flow: entry.flow, values: entry.values });
        await flow.ready;
        out.push({ name: entry.name, expected: entry.expected, actual: Object.hasOwn(flow.getValues(), "probe"),
          hidden: host.querySelector('[data-cx-field="probe"]').hidden });
        flow.destroy();
      } catch (error) {
        out.push({ name: entry.name, expected: entry.expected, error: String(error && error.message || error) });
      } finally { host.remove(); }
    }
    return out;
  }, built);
  test.info().annotations.push({ type: "skipped cases", description: String(skipped.length) + (skipped.length ? ": " + skipped.join("; ") : "") });
  expect(skipped).toEqual([]);
  expect(results.length).toBe(cases.length);
  expect(cases.length).toBeGreaterThanOrEqual(40);
  const wrong = results.filter(result => result.error || result.actual !== result.expected || result.hidden === result.expected);
  expect(wrong).toEqual([]);
});

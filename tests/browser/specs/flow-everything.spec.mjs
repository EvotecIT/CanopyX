// The browser reads every document C# writes: tests/fixtures/flow-document-everything.json is FlowSamples.Everything()
// .ToContract() (CanopyX.Tests keeps it current), a flow with every field type, sections, conditions, edit mode, stored
// secrets and labels. It mounts, reports the visible answers, and every visible step renders when opened.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo } from "./support.mjs";
import { openFlow } from "./flow-support.mjs";

const everything = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/flow-document-everything.json"), "utf8"));

test("the browser mounts the document C# writes with every feature", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openFlow(page, "flow-pause.html");
  expect(everything.mode).toBe("free");
  // The document's custom field names the editor "stars", which the host registers.
  await page.evaluate(doc => {
    document.querySelector("[data-canopyx-host]").canopyx.destroy();
    const host = document.createElement("div");
    host.id = "everything";
    host.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    document.querySelector(".cx-main").prepend(host);
    const stars = { create: context => {
      const input = document.createElement("input");
      input.type = "number"; input.min = "1"; input.max = "5"; input.value = context.value ?? "";
      return { element: input, getValue: () => input.value === "" ? null : Number(input.value) };
    } };
    window.__everything = window.CanopyX.createFlow(host, { flow: doc, editors: { stars } });
  }, everything);
  await page.waitForSelector("#everything[data-cx-ready]");
  expect(await page.evaluate(() => window.__everything.ready.then(() => true))).toBe(true);
  await expect(page.locator("#everything .cx-flow-title")).toHaveText(everything.title);

  // Open every step in turn; collect the visible fields that are not secrets.
  const visibleFields = new Set(), opened = [];
  for (const step of everything.steps) {
    const moved = await page.evaluate(id => window.__everything.goTo(id), step.id);
    const current = await page.evaluate(() => window.__everything.getStep());
    if (!moved || current !== step.id) continue;
    opened.push(step.id);
    await expect(page.locator("#everything .cx-flow-stage .cx-flow-step-title")).toHaveText(step.title ?? "Check your answers");
    if (step.type === "review") await expect(page.locator("#everything .cx-flow-review .cx-flow-banner-title")).toBeVisible();
    for (const id of await page.locator("#everything .cx-flow-stage [data-cx-field]:not([hidden]):not(.cx-flow-type-secret)").evaluateAll(
      elements => elements.filter(element => !element.closest("[hidden]")).map(element => element.dataset.cxField))) visibleFields.add(id);
  }
  // The delivery step's condition does not hold for the starting answers; every other step opens.
  expect(opened).toEqual(everything.steps.map(step => step.id).filter(id => id !== "delivery"));
  const values = await page.evaluate(() => window.__everything.getValues());
  expect(Object.keys(values).sort()).toEqual([...visibleFields].sort());
  expect(values).toMatchObject({ name: "Weekly summary", format: "html", sections: ["summary", "trends"], retries: 3, window: "PT2H", weekends: false, rating: null });
  expect(values).not.toHaveProperty("token");
  expect(values).not.toHaveProperty("recipients");
  expect(errors).toEqual([]);
});

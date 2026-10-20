// Host options and dependent fields (docs/flow.md#host-options-and-dependent-fields): options load through hooks.options
// with a signal as the reader reaches the field, load again when a field they depend on changes (the earlier request is
// aborted and a late answer dropped), keep an answer the new options still allow, fail in place with Retry, and reload on
// refreshOptions; a dependent field without host options starts empty again.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, waitForFlow } from "./flow-support.mjs";

const DOC = {
  kind: "flow", version: 1, id: "relay", title: "Relay",
  steps: [{ id: "route", title: "Route", fields: [
    { id: "region", type: "select", label: "Region", options: [{ value: "eu", label: "Europe" }, { value: "us", label: "United States" }] },
    { id: "relay", type: "select", label: "Relay", source: "host", dependsOn: ["region"] },
    { id: "note", type: "text", label: "Note", dependsOn: ["region"] }
  ] }]
};

/** Mounts the relay flow with a hook the test drives: each request waits until the test answers or fails it. */
async function mount(page) {
  await openFlow(page, "flow-mail-checks.html");
  await page.evaluate(doc => {
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx.destroy(); old.remove();
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    document.querySelector(".cx-main").prepend(host);
    window.__requests = [];
    window.CanopyX.createFlow(host, { flow: doc, hooks: { options: (field, values, { signal }) => new Promise((resolve, reject) => {
      const request = { field, region: values.region ?? null, aborted: false, resolve, reject };
      signal.addEventListener("abort", () => { request.aborted = true; });
      window.__requests.push(request);
    }) } });
  }, DOC);
  await waitForFlow(page);
}

const requests = page => page.evaluate(() => window.__requests.map(({ field, region, aborted }) => ({ field, region, aborted })));
const answer = (page, index, options) => page.evaluate(([index, options]) => window.__requests[index].resolve(options), [index, options]);
const fail = (page, index, message) => page.evaluate(([index, message]) => window.__requests[index].reject(new Error(message)), [index, message]);
const relayOptions = page => field(page, "relay").locator("option").evaluateAll(options => options.map(option => option.textContent));

test("options load as the field shows, and a newer request drops the earlier answer", async ({ page }) => {
  await mount(page);
  await expect.poll(() => requests(page)).toEqual([{ field: "relay", region: null, aborted: false }]);
  await expect(field(page, "relay").locator(".cx-flow-loading")).toHaveText("Loading options…");
  await answer(page, 0, [{ value: "any-1", label: "Any relay" }]);
  await expect(field(page, "relay").locator(".cx-flow-loading")).toBeHidden();
  expect(await relayOptions(page)).toContain("Any relay");

  await field(page, "region").locator("select").selectOption({ label: "Europe" });
  await field(page, "region").locator("select").selectOption({ label: "United States" });
  await expect.poll(async () => (await requests(page)).slice(1)).toEqual([{ field: "relay", region: "eu", aborted: true }, { field: "relay", region: "us", aborted: false }]);
  await answer(page, 2, [{ value: "us-1", label: "US relay 1" }, { value: "us-2", label: "US relay 2" }]);
  // The aborted request answering late changes nothing.
  await answer(page, 1, [{ value: "eu-1", label: "EU relay 1" }]);
  await expect.poll(() => relayOptions(page)).toEqual(expect.arrayContaining(["US relay 1", "US relay 2"]));
  expect(await relayOptions(page)).not.toContain("EU relay 1");
});

test("an answer the new options still allow is kept, any other is cleared, and a dependent field starts empty", async ({ page }) => {
  await mount(page);
  await answer(page, 0, [{ value: "shared", label: "Shared relay" }, { value: "eu-1", label: "EU relay" }]);
  await field(page, "relay").locator("select").selectOption({ label: "Shared relay" });
  await field(page, "note").locator("input").fill("keep me?");
  await field(page, "region").locator("select").selectOption({ label: "Europe" });
  await answer(page, 1, [{ value: "shared", label: "Shared relay" }]);
  await expect.poll(async () => (await flowCall(page, "getValues")).relay).toBe("shared");
  expect((await flowCall(page, "getValues")).note).toBeNull();
  await field(page, "region").locator("select").selectOption({ label: "United States" });
  await answer(page, 2, [{ value: "us-1", label: "US relay" }]);
  await expect.poll(async () => (await flowCall(page, "getValues")).relay).toBeNull();
});

test("a failed load says why and offers Try again, and refreshOptions loads again", async ({ page }) => {
  await mount(page);
  await fail(page, 0, "The relay list is offline.");
  await expect(field(page, "relay").locator(".cx-flow-loading")).toContainText("The options could not load: The relay list is offline.");
  await field(page, "relay").getByRole("button", { name: "Try again" }).click();
  await expect.poll(async () => (await requests(page)).length).toBe(2);
  await answer(page, 1, [{ value: "r1", label: "Relay one" }]);
  await expect(field(page, "relay").locator(".cx-flow-loading")).toBeHidden();
  const refreshed = page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.refreshOptions("relay"));
  await expect.poll(async () => (await requests(page)).length).toBe(3);
  await answer(page, 2, [{ value: "r2", label: "Relay two" }]);
  await refreshed;
  expect(await relayOptions(page)).toContain("Relay two");
  // The relay field describes its loading line while it shows, never after.
  await expect(field(page, "relay").locator("select")).not.toHaveAttribute("aria-describedby", /-note/);
});

test("a host section's field may not carry a command parameter, which the server could not write", async ({ page }) => {
  await openFlow(page, "flow-setup-tasks.html");
  await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), doc = host.canopyx.flow;
    host.canopyx.destroy(); host.innerHTML = "";
    window.CanopyX.createFlow(host, { flow: doc, hooks: { fields: () => [{ id: "folder", type: "text", label: "Folder", parameter: "Folder" }] } });
  });
  await page.waitForSelector("[data-canopyx-host][data-cx-ready]", { state: "attached" });
  await page.locator('.cx-flow-task[data-cx-task="database"] button').click();
  await expect(page.locator('.cx-flow-stage .cx-flow-error').filter({ hasText: "parameter" })).toBeVisible();
  await expect(field(page, "folder")).toHaveCount(0);
});
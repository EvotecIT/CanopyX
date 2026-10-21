// The browser reads every host-connected document C# writes: tests/fixtures/flow-document-host.json is
// FlowHostContractTests.Everything() as CanopyFlow.ToContract writes it (checks, host options and sections, records, a pick
// step, a task list in a dialog, the command, presets, drafts, deep links and an endpoint).
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { openFlow, waitForFlow, field, stepTitle } from "./flow-support.mjs";

const DOC = JSON.parse(fs.readFileSync(new URL("../../fixtures/flow-document-host.json", import.meta.url), "utf8"));

test("the C# host document mounts, opens as a dialog task list, and its pick step picks", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await openFlow(page, "flow-workbench.html");
  await page.evaluate(doc => {
    window.__errors = [];
    document.addEventListener("canopyx:error", event => window.__errors.push(String(event.detail?.error?.message || event.detail?.error)), true);
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx.destroy(); old.innerHTML = "";
    old.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    // Hooks of the host's own take precedence over the document's endpoint routes; draft "host" without a store keeps none.
    window.CanopyX.createFlow(old, { flow: doc, hooks: {
      options: () => [{ value: "eu", label: "Europe" }],
      fields: () => [{ id: "folder", type: "text", label: "Folder" }],
      check: () => ({ status: "pass", message: "Connected." }),
      submit: detail => ({ status: "saved", message: detail.command })
    } });
  }, DOC);
  await waitForFlow(page);
  await page.getByRole("button", { name: "Set up the relay" }).click();
  await expect(stepTitle(page)).toHaveText("Tasks");
  await page.locator('.cx-flow-task[data-cx-task="server"] button').click();
  await expect(field(page, "folder").locator("input")).toBeVisible();
  await field(page, "host").locator("input").fill("relay.example.com");
  await expect(field(page, "region").locator("option", { hasText: "Europe" })).toHaveCount(1);
  await page.getByRole("button", { name: "Test the connection" }).click();
  await expect(page.locator('.cx-flow-check-item[data-cx-check="connect"]')).toHaveAttribute("data-cx-state", "pass");
  await page.getByRole("button", { name: "Save and return" }).click();
  await page.locator('.cx-flow-task[data-cx-task="servers"] button').click();
  await page.locator(".cx-flow-pick-view .cx-grid-row-select").first().check();
  await expect(page.locator(".cx-flow-tray-label")).toHaveText(["SRV-1"]);
  await page.getByRole("button", { name: "Save and return" }).click();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(stepTitle(page)).toHaveText("Check your answers");
  await page.locator(".cx-flow-confirm input").fill("RELAY");
  await page.locator(".cx-flow-acknowledge input").check();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toContainText("set-relay --host relay.example.com --servers s1");
  expect(await page.evaluate(() => location.hash)).toBe("#relay/review");
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test("what hooks answer is text: markup in options, fields, checks, previews and task states never becomes elements", async ({ page }) => {
  await openFlow(page, "flow-workbench.html");
  const HTML = "<img src=x onerror=\"window.__xss=1\"><b>bold</b>";
  await page.evaluate(([doc, html]) => {
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx.destroy(); old.innerHTML = "";
    window.CanopyX.createFlow(old, { flow: doc, hooks: {
      options: () => [{ value: "eu", label: html, description: html, badge: "b" }],
      fields: () => [{ id: "folder", type: "text", label: html, help: html }],
      check: () => ({ status: "warning", message: html, details: [{ label: html, value: html }] }),
      status: () => ({ server: { state: "needsAction", summary: html, blockers: [html] } }),
      preview: () => ({ title: html, rows: [{ label: html, value: html }], notes: [html] }),
      commands: { csharp: () => html }
    } });
  }, [DOC, HTML]);
  await waitForFlow(page);
  await page.getByRole("button", { name: "Set up the relay" }).click();
  await expect(page.locator(".cx-flow-task-summary")).toHaveText(HTML);
  await page.locator('.cx-flow-task[data-cx-task="server"] button').click();
  await field(page, "host").locator("input").fill("relay.example.com");
  await page.getByRole("button", { name: "Test the connection" }).click();
  await expect(page.locator(".cx-flow-check-message")).toHaveText(HTML);
  await expect(field(page, "folder").locator("label")).toContainText(HTML);
  await expect(page.locator(".cx-flow img, .cx-flow b")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

test("public sample stream coalesces repeated endpoint picks into accepted ticks", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(exampleUrl("live-data.html") + "#manual");
  await page.waitForFunction(() => window.liveDemo && [...document.querySelectorAll("[data-canopyx-host]")].every(host => host.getAttribute("data-cx-ready") === "true"));
  const result = await page.evaluate(async () => {
    const api = [...document.querySelectorAll("[data-canopyx-host]")].find(host => host.canopyx?.view.id === "live-endpoints").canopyx;
    const rejected = [], updated = [], added = [];
    for (let tick = 1; tick <= 60; tick++) {
      const step = Promise.resolve().then(() => window.liveDemo.step()).then(result => ({ result }), error => ({ error: error.message }));
      await Promise.resolve();
      await api.flushTransactions();
      const outcome = await step;
      if (outcome.error) rejected.push({ tick, error: outcome.error });
      else { updated.push(...outcome.result.updated); added.push(...outcome.result.added); }
    }
    return { rejected, updates: updated.length, additions: added.length, pending: api.getLiveState().pending };
  });
  expect(result.rejected).toEqual([]);
  expect(result.updates).toBeGreaterThan(180);
  expect(result.additions).toBe(10);
  expect(result.pending).toBe(0);
  expect(errors).toEqual([]);
});

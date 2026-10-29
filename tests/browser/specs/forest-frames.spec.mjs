import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl } from "./support.mjs";

for (const name of ["path", "stack", "time-matrix", "time-propagation"]) for (const sample of [{ width: 1440, dark: false }, { width: 390, dark: true }]) {
  test("generated " + name + " stays readable at " + sample.width + (sample.dark ? " dark" : " light"), async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: sample.width, height: sample.dark ? 844 : 1000 });
    const file = name + (sample.dark ? "-dark" : "") + ".html";
    await page.goto(process.env.CANOPYX_FRAME_BASE_URL ? process.env.CANOPYX_FRAME_BASE_URL + "/" + file : exampleUrl(file));
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    const selector = name === "path" ? ".cx-path" : name === "stack" ? ".cx-stack" : ".cx-time";
    await expect(page.locator(selector)).toBeVisible(); await page.evaluate(() => document.fonts.ready);
    if (name === "path" || name === "stack") {
      await expect(page.locator(".cx-toolbar")).toBeHidden();
      await expect(page.locator(selector + " h2")).toBeVisible();
      expect(await page.locator(selector).evaluate(element => element.clientHeight)).toBeGreaterThan(300);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (name.startsWith("time-")) {
      await page.getByRole("button", { name: "Next snapshot", exact: true }).click();
      expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.playback.getState().index)).toBe(1);
      await page.getByRole("button", { name: "Previous snapshot", exact: true }).click();
      await expect(page.locator(".cx-time-stamp")).toContainText("Rollout started");
    }
    const results = await new AxeBuilder({ page }).include(selector).analyze();
    expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact)).map(item => item.id)).toEqual([]);
    expect(errors).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) {
      if (!process.env.CANOPYX_FRAME_BASE_URL) throw new Error("Visual captures need the owned loopback preview URL.");
      await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + "-" + sample.width + (sample.dark ? "-dark" : "-light") + ".png"), fullPage: true });
    }
  });
}

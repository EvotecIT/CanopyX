import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl } from "./support.mjs";

for (const name of ["board", "plan"]) for (const sample of [{ width: 1440, dark: false }, { width: 390, dark: true }]) {
  test("generated " + name + " stays finished at " + sample.width + (sample.dark ? " dark" : " light"), async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: sample.width, height: sample.dark ? 844 : 1000 });
    const file = name + (sample.dark ? "-dark" : "") + ".html";
    await page.goto(process.env.CANOPYX_FRAME_BASE_URL ? process.env.CANOPYX_FRAME_BASE_URL + "/" + file : exampleUrl(file));
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    await expect(page.locator(name === "board" ? ".cx-board-card" : ".cx-plan-task").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const results = await new AxeBuilder({ page }).include(name === "board" ? ".cx-board" : ".cx-cal").analyze();
    expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact)).map(item => item.id)).toEqual([]);
    expect(errors).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) {
      if (!process.env.CANOPYX_FRAME_BASE_URL) throw new Error("Visual captures need the owned loopback preview URL.");
      await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + "-" + sample.width + (sample.dark ? "-dark" : "-light") + ".png"), fullPage: true });
    }
  });
}

for (const invalid of ["cycle", "missing endpoint", "negative lag"]) {
  test("raw plan definition rejects " + invalid, async ({ page }) => {
    await page.goto(exampleUrl("plan.html"));
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    const error = await page.evaluate(async kind => {
      const original = document.querySelector("[data-canopyx-host]").canopyx; await original.ready;
      const view = JSON.parse(JSON.stringify(original.view)); view.id = "invalid-plan";
      if (kind === "cycle") view.plan.dependencies.push({ predecessor: "release", successor: "prepare" });
      if (kind === "missing endpoint") view.plan.dependencies.push({ predecessor: "absent", successor: "prepare" });
      if (kind === "negative lag") view.plan.dependencies[0].lagMinutes = -1;
      const host = document.createElement("div"); document.body.appendChild(host);
      let api;
      try { api = CanopyX.createDataGrid(host, { view }); await api.ready; return null; }
      catch (error) { return error.message; }
      finally { api?.destroy(); host.remove(); }
    }, invalid);
    expect(error).toMatch(invalid === "cycle" ? /cycle/ : invalid === "missing endpoint" ? /unknown task/ : /nonnegative lag/);
  });
}

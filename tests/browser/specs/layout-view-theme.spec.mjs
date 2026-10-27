import { test, expect } from "@playwright/test";
import path from "node:path";
import { exampleUrl } from "./support.mjs";

// A host can change its palette after mount without replacing any optional view.
for (const [name, surface] of [["board", ".cx-board"], ["plan", ".cx-plan-legend"], ["path", ".cx-path"],
  ["stack", ".cx-stack"], ["time-matrix", ".cx-time"], ["time-propagation", ".cx-time"]]) {
  test(name + " follows live host roles and uses the shared surface frame", async ({ page }) => {
    await page.goto(exampleUrl(name + ".html"));
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    await expect(page.locator(surface)).toBeVisible();
    const result = await page.evaluate(selector => {
      const host = document.querySelector("[data-canopyx-host]");
      host.style.setProperty("--hfx-color-text", "rgb(63, 84, 105)");
      host.style.setProperty("--hfx-color-text-muted", "rgb(63, 84, 105)");
      host.style.setProperty("--hfx-font-sans", "Arial");
      const style = getComputedStyle(host.querySelector(selector));
      return { color: style.color, border: style.borderTopWidth, family: style.fontFamily };
    }, surface);
    expect(result.color).toBe("rgb(63, 84, 105)");
    expect(result.family).toContain("Arial");
    // Internal record/lane outlines convey structure; the view root adds no second frame.
    if (name !== "plan") expect(result.border).toBe("0px");
  });
}

test("board virtual positions follow the host spacing roles", async ({ page }) => {
  await page.goto(exampleUrl("board.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect(page.locator(".cx-board-card").first()).toBeVisible();
  await page.evaluate(async () => {
    const host = document.querySelector("[data-canopyx-host]");
    host.style.setProperty("--hfx-space-1", "8px");
    await host.canopyx.setQuery({ search: " " });
  });
  await expect.poll(() => page.evaluate(() => {
    const cards = [...document.querySelector(".cx-board-scroll").querySelectorAll(".cx-board-card")];
    if (cards.length < 2) return false;
    const [first, second] = cards.map(card => card.getBoundingClientRect());
    return second.top >= first.bottom;
  })).toBe(true);
});

for (const [name, width, selector] of [["path", 390, ".cx-path-title"], ["stack", 1440, ".cx-stack-title"]]) {
  test(name + " record controls use the shared drawer with the host palette", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const file = name + (width === 390 ? "-dark" : "") + ".html";
    await page.goto(process.env.CANOPYX_FRAME_BASE_URL ? process.env.CANOPYX_FRAME_BASE_URL + "/" + file : exampleUrl(file));
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    const foreground = width === 390 ? "rgb(210, 220, 230)" : "rgb(63, 84, 105)";
    await page.evaluate(color => document.querySelector("[data-canopyx-host]").style.setProperty("--hfx-color-text", color), foreground);
    const trigger = page.locator(selector).first();
    await trigger.click();
    const drawer = page.locator(".cx-drawer");
    await expect(drawer).toBeVisible();
    await page.evaluate(() => Promise.all(document.querySelector(".cx-drawer").getAnimations({ subtree: true }).map(animation => animation.finished)));
    await expect.poll(() => drawer.evaluate(element => getComputedStyle(element).color)).toBe(foreground);
    if (process.env.CANOPYX_EVIDENCE) {
      if (!process.env.CANOPYX_FRAME_BASE_URL) throw new Error("Captures require the owned loopback preview.");
      await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + "-panel-" + width + (width === 390 ? "-dark" : "-light") + ".png"), fullPage: true });
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

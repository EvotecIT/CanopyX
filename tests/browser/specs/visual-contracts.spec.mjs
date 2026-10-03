// The example shell follows the view theme without changing the engine's keyboard model.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, openExample, row } from "./support.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
async function accessible(page) {
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
}

for (const theme of ["light", "dark"]) {
  test(`the compact gallery exposes offline example navigation without overflow (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(exampleUrl("index.html"));
    await accessible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Host actions", exact: true }).click();
    await expect(page.getByRole("treegrid")).toBeVisible();
    await page.getByRole("link", { name: "CanopyX examples", exact: true }).click();
    await expect(page.getByRole("heading", { name: "CanopyX examples", exact: true })).toBeVisible();
  });

  test(`host controls and interaction panels remain readable in the page theme (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await openExample(page, "interactions.html");
    await page.getByRole("checkbox", { name: "Dark theme", exact: true }).setChecked(theme === "dark");
    await nextFrames(page);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      theme === "dark" ? "rgb(13, 17, 23)" : "rgb(255, 255, 255)");
    await page.evaluate(() => document.querySelector(".cx-host").canopyx.expandPath(["atlas", "task-0"], { focus: true }));
    await row(page, "task-0").focus();
    await page.keyboard.press("Alt+Enter");
    await accessible(page);
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row(page, "task-0")).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(row(page, "task-0")).toBeFocused();
  });
}

test("selected rows and keyboard focus remain distinguishable in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openExample(page, "interactions.html");
  await row(page, "atlas").focus();
  await page.keyboard.press("Space");
  await expect(row(page, "atlas")).toHaveAttribute("aria-selected", "true");
  const appearance = await row(page, "atlas").evaluate(el => {
    const style = getComputedStyle(el);
    return { border: style.borderLeftStyle, width: style.borderLeftWidth, outline: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(appearance).toEqual({ border: "solid", width: "1px", outline: "solid", outlineWidth: "2px" });
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "beacon")).toBeFocused();
});

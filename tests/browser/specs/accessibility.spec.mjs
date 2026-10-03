// Accessibility contract: axe-core finds no violations in light or dark, and the row-focus keyboard model behaves as
// docs/architecture.md describes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { focusedId, nextFrames, openExample, row } from "./support.mjs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoViolations(page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = result.violations.map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", "));
  expect(summary).toEqual([]);
}

/** Opens a folder, a version detail row, and selects a row, so axe sees every row kind. */
async function openEverything(page) {
  await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    const view = JSON.parse(document.querySelector("script.cx-config").textContent);
    const stack = view.roots.map((node) => [node, [node.id]]).reverse();
    let path = null;
    while (stack.length && !path) {
      const [node, ids] = stack.pop();
      if (node.detail) {
        path = ids;
      }
      (node.children || []).slice().reverse().forEach((child) => stack.push([child, ids.concat(child.id)]));
    }
    await api.expandPath(path.slice(0, -1), { expandLast: true });
  });
  await nextFrames(page);
}

for (const theme of ["light", "dark"]) {
  test(`axe finds no violations on the inline example (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openExample(page, "inline.html");
    // The auto theme follows the system preference, so the dark run really scans dark colours.
    const surface = await page.evaluate(() => getComputedStyle(document.querySelector(".cx-host")).backgroundColor);
    expect(surface).toBe(theme === "dark" ? "rgb(13, 17, 23)" : "rgb(255, 255, 255)");
    await openEverything(page);
    await expectNoViolations(page);
    // Transient states: the column chooser, the search results, and a filtered tree with a "show more" row.
    await page.getByText("Columns", { exact: true }).click();
    await expectNoViolations(page);
    await page.getByText("Columns", { exact: true }).click();
    await page.getByRole("combobox").fill("budget");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");
    await page.getByLabel("Only changed in the last 7 days").check();
    await expectNoViolations(page);
  });
}

test("axe finds no violations on the bundle example and the static outline", async ({ page }) => {
  await openExample(page, "bundle/index.html");
  await row(page, "share-b").locator(".cx-exp").click();
  await expect(row(page, "share-b/d0")).toBeVisible();
  await expectNoViolations(page);
  await page.goto((await page.url()).replace(/bundle\/index\.html.*$/, "outline.html"));
  await expectNoViolations(page);
});

test("keyboard walkthrough follows the row-focus model", async ({ page }) => {
  await openExample(page, "inline.html");
  await page.evaluate(() => {
    const outlet = document.createElement("button"); outlet.textContent = "After tree"; outlet.type = "button";
    document.body.appendChild(outlet);
  });
  await row(page, "share-a").click();
  expect(await focusedId(page)).toBe("share-a");

  await page.keyboard.press("ArrowDown");
  expect(await focusedId(page)).toBe("share-a/d0");
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "share-a/d0")).toHaveAttribute("aria-expanded", "true");
  expect(await focusedId(page)).toBe("share-a/d0");
  await page.keyboard.press("ArrowRight");
  expect(await focusedId(page)).toBe("share-a/d0/p0");
  await page.keyboard.press("ArrowLeft");
  expect(await focusedId(page)).toBe("share-a/d0");
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "share-a/d0")).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("End");
  const rowCount = Number(await page.getByRole("treegrid").getAttribute("aria-rowcount"));
  await expect(page.locator(".cx-row:focus")).toHaveAttribute("aria-rowindex", String(rowCount));
  await page.keyboard.press("Home");
  expect(await focusedId(page)).toBe("share-a");
  await page.keyboard.press("PageDown");
  expect(Number(await page.locator(".cx-row:focus").getAttribute("aria-rowindex"))).toBeGreaterThan(5);

  await page.keyboard.press("Home");
  await page.keyboard.type("leg");
  await expect(page.locator(".cx-row:focus")).toContainText("Legal");

  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-row:focus")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".cx-row:focus")).toHaveAttribute("aria-expanded", "true");
  // Space within the type-ahead window (600 ms) continues the typed term, so wait it out before toggling the selection.
  await page.waitForTimeout(900);
  await page.keyboard.press(" ");
  await expect(page.locator(".cx-row:focus")).toHaveAttribute("aria-selected", "false");

  await expect(page.locator(".cx-row[tabindex='0']")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "After tree", exact: true })).toBeFocused();
});

test("rows are back in DOM order once scrolling pauses", async ({ page }) => {
  await openExample(page, "bundle/index.html");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.expandPath(["share-a", "share-a/d0", "share-a/d0/p0"], { expandLast: true, select: false, focus: false }));
  const box = await page.locator(".cx-grid").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(20);
  }
  const inOrder = () => page.evaluate(() => {
    const indexes = [...document.querySelectorAll(".cx-canvas > .cx-row")].map((r) => Number(r.getAttribute("aria-rowindex")));
    return indexes.length > 10 && indexes.every((value, i) => i === 0 || value > indexes[i - 1]);
  });
  await expect.poll(inOrder, { timeout: 5000 }).toBe(true);
});

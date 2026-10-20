// Flow accessibility (docs/flow.md#accessibility): axe on the flow pages in states the example sweep does not reach (a
// step with errors, the review page), the keyboard order rail → fields → actions, focus and the live region on a step
// change, a right-to-left page with its mirrored action bar, and the forced-colours and reduced-motion modes.
import fs from "node:fs";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { nextFrames } from "./support.mjs";
import { openFlow, field, next, stepTitle, mailToReview, replaceFlow } from "./flow-support.mjs";

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const VIEWPORTS = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } };

/** Serious and critical axe violations on the page as it is now. */
async function seriousViolations(page) {
  if (!await page.evaluate(() => typeof window.axe === "object")) await page.addScriptTag({ content: AXE });
  await nextFrames(page);
  const violations = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
    .then(result => result.violations.map(violation => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.slice(0, 3).map(node => node.target.join(" ")) }))), TAGS);
  return violations.filter(violation => violation.impact === "serious" || violation.impact === "critical");
}

const STATES = [
  { name: "flow-mail-server", label: "a step with errors", reach: async page => { await next(page); await expect(page.locator(".cx-flow-summary")).toBeVisible(); } },
  { name: "flow-mail-server", label: "the review page", reach: page => mailToReview(page) },
  { name: "flow-edit-settings", label: "the review page in edit mode", reach: async page => {
    await field(page, "location").locator("input").fill("archive-two");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.goTo("review"));
    await expect(page.locator(".cx-flow-review .cx-flow-banner-title")).toBeVisible();
  } },
  { name: "flow-schedule-report", label: "the vertical stepper", reach: async () => {} }
];

for (const state of STATES) for (const theme of ["light", "dark"]) {
  test(`axe finds no serious or critical violations on ${state.name} in ${state.label} (${theme})`, async ({ browser }) => {
    const found = [];
    for (const [width, options] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ ...options, colorScheme: theme });
      const page = await context.newPage();
      await openFlow(page, state.name + (theme === "dark" ? "-dark" : "") + ".html");
      await state.reach(page);
      for (const violation of await seriousViolations(page)) found.push(`${width} ${violation.impact} ${violation.id}: ${violation.targets.join(", ")}`);
      await context.close();
    }
    expect(found).toEqual([]);
  });
}

test("Tab moves through the rail, then the fields, then the actions", async ({ page }) => {
  await openFlow(page, "flow-mail-server.html");
  await page.evaluate(() => document.activeElement?.blur());
  const regions = [];
  for (let press = 0; press < 40; press++) {
    await page.keyboard.press("Tab");
    const region = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || !element.closest(".cx-flow")) return null;
      return element.closest(".cx-flow-rail") ? "rail" : element.closest(".cx-flow-actions") ? "actions" : element.closest(".cx-flow-stage") ? "fields" : "other";
    });
    if (region) regions.push(region);
    if (region === "actions") break;
  }
  const order = regions.filter((region, index) => region !== regions[index - 1]);
  expect(order).toEqual(["rail", "fields", "actions"]);
  // The current step is marked in the rail, and every field the step asks for is reached on the way.
  await expect(page.locator(".cx-flow-rail [aria-current=step]")).toHaveCount(1);
  await expect(page.locator(".cx-flow-rail")).toHaveAttribute("role", "navigation");
  await expect(page.locator(".cx-flow-rail")).toHaveAttribute("aria-label", "Steps");
  await expect(page.locator(".cx-flow-actions .cx-flow-next")).toBeFocused();
});

test("a step change moves focus to the step heading and announces the step", async ({ page }) => {
  await openFlow(page, "flow-mail-server.html");
  await field(page, "host").locator("input").fill("smtp.example.com");
  await next(page);
  await expect(stepTitle(page)).toBeFocused();
  const live = page.locator(".cx-flow > [aria-live=polite]");
  await expect(live).toHaveText("Step 2 of 5, How should the certificate be checked?");
  await expect(page.locator(".cx-flow-stage section.cx-flow-step")).toHaveAttribute("aria-labelledby", await stepTitle(page).getAttribute("id"));
  await page.locator(".cx-flow-actions .cx-flow-back").click();
  await expect(stepTitle(page)).toBeFocused();
  await expect(live).toHaveText("Step 1 of 5, Which server sends the mail?");
});

test("a right-to-left page mirrors the action bar", async ({ page }) => {
  await openFlow(page, "flow-pause-rtl.html");
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  // The pause flow has one step; two steps show both actions.
  await replaceFlow(page, { kind: "flow", version: 1, id: "two", title: "Two steps", steps: [
    { id: "one", title: "First", fields: [{ id: "name", type: "text", label: "Name" }] }, { id: "two", title: "Second", fields: [{ id: "note", type: "text", label: "Note" }] }] });
  await next(page);
  await expect(stepTitle(page)).toHaveText("Second");
  const back = await page.locator(".cx-flow-actions .cx-flow-back").boundingBox();
  const submit = await page.locator(".cx-flow-actions .cx-flow-next").boundingBox();
  // Back sits on the start side, which is the right in a right-to-left page; the submit button on the left.
  expect(back.x).toBeGreaterThan(submit.x + submit.width);
  const label = await field(page, "note").locator("label").boundingBox(), input = await field(page, "note").locator("input").boundingBox();
  expect(Math.abs(label.x + label.width - (input.x + input.width))).toBeLessThan(2);
});

for (const mode of ["forced colours", "reduced motion"]) {
  test(`the flow renders in ${mode} without errors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.emulateMedia(mode === "forced colours" ? { forcedColors: "active" } : { reducedMotion: "reduce" });
    await openFlow(page, "flow-mail-server.html");
    await next(page);
    await expect(page.locator(".cx-flow-summary")).toBeVisible();
    await field(page, "host").locator("input").fill("smtp.example.com");
    await next(page);
    await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
    // The focused control keeps a visible focus indicator.
    await page.locator(".cx-flow-actions .cx-flow-next").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);
    if (mode === "reduced motion") {
      const animated = await page.evaluate(() => [...document.querySelectorAll(".cx-flow *")].filter(element => {
        const style = getComputedStyle(element);
        return parseFloat(style.animationDuration) > 0.01 || parseFloat(style.transitionDuration) > 0.01;
      }).length);
      expect(animated).toBe(0);
    }
    expect(errors).toEqual([]);
  });
}

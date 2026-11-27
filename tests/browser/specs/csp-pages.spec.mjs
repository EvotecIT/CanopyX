// Strict Content Security Policy without inline code (docs/security.md). csp/self/ holds a tree, a grid, a calendar, a
// matrix, a flow, a sized fragment, a page of overlays and form controls and a bundle, each with every script and stylesheet
// a file under assets/, and they load under script-src 'self'; style-src 'self' with no nonce and no hash. The calendar and
// the overlays page also load inline under the nonce policies, and single files with inline assets load under a policy of
// their hashes. A test fails on any violation, any console report of a refused script or style, and any page error.
import { test, expect } from "@playwright/test";
import { ORIGIN, POLICIES, SELF, HASHES, serve, open, expectClean, exerciseTree, exerciseGrid } from "./csp-support.mjs";

/** The calendar's details popover and a change of view, which repaints every event. */
async function exerciseCalendar(page) {
  await page.locator(".cx-cal-ev").first().click();
  await expect(page.getByRole("dialog").filter({ visible: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".cx-cal-views button", { hasText: "Week" }).click();
  await expect(page.locator(".cx-cal-ev").first()).toBeAttached();
}

/** Opens every overlay, picks a tab and a select option, and types into the masked input. */
async function exerciseUi(page) {
  await page.waitForFunction(() => window.CanopyX?.mountUi);
  await page.evaluate(() => Promise.all(CanopyX.mountUi(document).map(api => api.ready)));
  await page.getByRole("button", { name: "Rename workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename workspace" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(page.getByRole("dialog", { name: "Record details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.getByRole("dialog", { name: "View options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cx-toast")).toHaveCount(1);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel", { name: "History" })).toBeVisible();
  const site = page.getByRole("combobox", { name: "Site" });
  await site.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Site" }).getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  const phone = page.getByRole("textbox", { name: "Phone" });
  await phone.pressSequentially("48123456789");
  await expect(phone).toHaveValue(/^\+?48 123 456 789$/);
}

test.describe("under script-src 'self'; style-src 'self' with external assets and no nonce", () => {
  test("a tree loads its parts, icons, html detail and print outline", async ({ page }) => {
    const report = await serve(page, SELF);
    await open(page, "self/tree.html");
    await exerciseTree(page);
    await expectClean(page, report);
  });

  test("a grid loads its history, filter editor and export parts and prints", async ({ page }) => {
    const report = await serve(page, SELF);
    // The body's padding comes only from the paper's constructed stylesheet (its narrow-screen rule: the frame is 1px wide).
    await page.addInitScript(() => { window.print = () => { window.parent.printed = { padding: getComputedStyle(document.body).paddingTop, sheets: document.adoptedStyleSheets.length }; }; });
    await open(page, "self/grid.html");
    await exerciseGrid(page);
    await page.locator(".cx-grid-filters > summary").click();
    await expect(page.locator(".cx-grid-filters .cx-grid-panel")).toBeVisible();
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.print({ scope: "all" }));
    expect(await page.evaluate(() => window.printed)).toEqual({ padding: "20px", sheets: 1 });
    await expectClean(page, report);
  });

  test("a calendar opens an event's details and changes view", async ({ page }) => {
    const report = await serve(page, SELF);
    await open(page, "self/calendar.html");
    await exerciseCalendar(page);
    await expectClean(page, report);
  });

  test("a matrix draws its cells and opens a cell's details", async ({ page }) => {
    const report = await serve(page, SELF);
    await open(page, "self/matrix.html");
    await expect(page.locator(".cx-mx-row canvas").first()).toBeAttached();
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.focusCell("srv01", "dns"));
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.cx-mx-dialog")).toBeVisible();
    await expectClean(page, report);
  });

  test("a dialog flow picks rows in its embedded grid and reaches its review", async ({ page }) => {
    const report = await serve(page, SELF);
    await open(page, "self/flow.html");
    await page.getByRole("button", { name: "Retire servers…" }).click();
    await page.locator(".cx-flow-pick-view .cx-grid-row-select").first().check();
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await page.locator('[data-cx-field="reason"] textarea').fill("Replaced");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-confirm input")).toBeVisible();
    await expectClean(page, report);
  });

  test("a fragment takes its height through the CSSOM", async ({ page }) => {
    const report = await serve(page, SELF);
    await page.setViewportSize({ width: 1200, height: 900 });
    await open(page, "self/fragment.html");
    expect(await page.locator("[data-canopyx-host]").evaluate(host => Math.round(host.getBoundingClientRect().height))).toBe(540);
    await exerciseGrid(page);
    await expectClean(page, report);
  });

  test("overlays and form controls open, pick and format", async ({ page }) => {
    const report = await serve(page, SELF);
    await page.goto(ORIGIN + "/csp/self/ui.html");
    await exerciseUi(page);
    await expectClean(page, report);
  });

  test("a bundle loads part files, sidecar files and the search part", async ({ page }) => {
    const report = await serve(page, SELF);
    await open(page, "self/bundle/index.html");
    const host = page.locator(".cx-host").first();
    await host.locator(".cx-row[aria-level='1'][aria-expanded='false']").first().locator(".cx-exp").click();
    await expect(host.locator(".cx-row[aria-level='2']").first()).toBeVisible();
    await page.getByRole("combobox").fill("budget");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectClean(page, report);
  });
});

for (const [label, policy] of Object.entries(POLICIES)) {
  test.describe(`inline with a nonce under a strict policy (${label})`, () => {
    test("a calendar opens an event's details and changes view", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "calendar.html");
      await exerciseCalendar(page);
      await expectClean(page, report);
    });

    test("overlays and form controls open, pick and format", async ({ page }) => {
      const report = await serve(page, policy);
      await page.goto(ORIGIN + "/csp/ui.html");
      await exerciseUi(page);
      await expectClean(page, report);
    });
  });
}

test.describe("single files under a policy of their inline hashes", () => {
  // The parts a single file carries are its own script and style elements, so their hashes allow them: nothing is created from text.
  test("a tree, a grid and a calendar load their parts", async ({ page }) => {
    const report = await serve(page, HASHES);
    // Each page reports its own violations, so each is checked before the next replaces it.
    await page.goto(ORIGIN + "/inline.html");
    await page.waitForSelector("[data-cx-ready]");
    await page.locator(".cx-host").first().getByText("Export", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expectClean(page, report);
    await page.goto(ORIGIN + "/graphite-grid.html");
    await page.waitForSelector("[data-cx-ready]");
    await exerciseGrid(page);
    await expectClean(page, report);
    await page.goto(ORIGIN + "/calendar-basic.html");
    await page.waitForSelector("[data-cx-ready]");
    await exerciseCalendar(page);
    await expectClean(page, report);
  });
});

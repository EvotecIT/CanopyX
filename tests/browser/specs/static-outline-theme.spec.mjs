// The static outline is themed without script. As literal colours it is light or dark wherever it lands; written with
// theme variables it follows the page: the palettes of canopyx.css inside a .cx-static element, or the colours a host
// sets from its own design tokens.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const LIGHT = { surface: "rgb(255, 255, 255)", text: "rgb(31, 35, 40)" };
const DARK = { surface: "rgb(13, 17, 23)", text: "rgb(230, 237, 243)" };

async function expectNoViolations(page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(result.violations.map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", "))).toEqual([]);
}

/** The computed colours of the outline table, of the note in its last row, and of the first badge. */
function colors(page) {
  return page.evaluate(() => {
    const table = document.querySelector("main table");
    const style = getComputedStyle(table);
    const badge = [...table.querySelectorAll("span")].find((span) => getComputedStyle(span).borderRadius === "9px");
    return { surface: style.backgroundColor, text: style.color, note: getComputedStyle(table.querySelector(":scope > tbody:last-of-type td")).color,
      badge: badge ? getComputedStyle(badge).backgroundColor : null, scripts: document.scripts.length };
  });
}

test("the dark theme is written as literal colours and carries its own surface on a white page", async ({ page }) => {
  await page.goto(exampleUrl("outline-dark.html"));
  const seen = await colors(page);
  expect({ surface: seen.surface, text: seen.text, scripts: seen.scripts }).toEqual({ ...DARK, scripts: 0 });
  await expectNoViolations(page);
});

for (const [scheme, palette] of [["light", LIGHT], ["dark", DARK]]) {
  test("with theme variables the outline takes the " + scheme + " palette of the stylesheet from the system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(exampleUrl("outline-page.html"));
    const seen = await colors(page);
    expect(seen.scripts).toBe(0);
    expect({ surface: seen.surface, text: seen.text }).toEqual(palette);
    await expectNoViolations(page);
  });
}

test("a host that sets the runtime's properties from its own tokens themes the outline with them", async ({ page }) => {
  // The reader prefers dark, and the host's theme is its own: neither palette of canopyx.css may show through.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(exampleUrl("outline-page.html"));
  const before = await colors(page);
  // What a host stylesheet does for the grid, here for the host's own element around the outline.
  await page.evaluate(() => {
    const wrapper = document.querySelector("main .cx-static");
    wrapper.className = "report-outline";
    wrapper.removeAttribute("data-cx-theme");
  });
  await page.addStyleTag({ content: ".report-outline { --cx-surface: rgb(20, 30, 40); --cx-text: rgb(250, 240, 230); --cx-tone-warning: rgb(255, 200, 0); }" });
  const after = await colors(page);
  expect({ surface: after.surface, text: after.text }).toEqual({ surface: "rgb(20, 30, 40)", text: "rgb(250, 240, 230)" });
  // Mixed colours follow too: the muted note and the tint behind a badge are derived from the host's colours.
  expect(after.note).not.toBe(before.note);
  expect(after.badge).not.toBe(before.badge);
});

test("without the stylesheet the literals apply", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(exampleUrl("outline-page.html"));
  await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').forEach(link => link.remove()));
  const seen = await colors(page);
  expect({ surface: seen.surface, text: seen.text }).toEqual(LIGHT);
});

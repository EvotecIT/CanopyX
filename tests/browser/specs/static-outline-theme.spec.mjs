// The static outline is themed without script. As literal colours it is light or dark wherever it lands; written with
// theme variables it follows the page's colour scheme through inline fallbacks, or the colours a host sets from its
// own design tokens. CanopyX consumes the host's roles without defining them.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const LIGHT = { surface: "rgb(255, 255, 255)", text: "rgb(22, 24, 28)" };
const DARK = { surface: "rgb(22, 24, 28)", text: "rgb(242, 243, 245)" };

async function expectNoViolations(page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(result.violations.map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", "))).toEqual([]);
}

/** The computed colours of the outline table, of the note in its last row, and of the first badge. */
function colors(page) {
  return page.evaluate(() => {
    const table = document.querySelector("main table");
    const style = getComputedStyle(table);
    const badge = [...table.querySelectorAll("span")].find((span) => getComputedStyle(span).borderRadius === "4px");
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
  test("with theme variables the outline takes the " + scheme + " palette from the system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(exampleUrl("outline-page.html"));
    const seen = await colors(page);
    expect(seen.scripts).toBe(0);
    expect({ surface: seen.surface, text: seen.text }).toEqual(palette);
    await expectNoViolations(page);
  });
}

test("a host that sets the runtime's properties from its own tokens themes the outline with them", async ({ page }) => {
  // The reader prefers dark, and the host's theme is its own: neither built-in fallback palette may show through.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(exampleUrl("outline-page.html"));
  // What a host stylesheet does for the grid, here for the host's own element around the outline.
  await page.evaluate(() => {
    const wrapper = document.querySelector("main .cx-static");
    wrapper.className = "report-outline";
    wrapper.removeAttribute("data-cx-theme");
  });
  await page.addStyleTag({ content: ".report-outline { --hfx-color-surface: rgb(20, 30, 40); --hfx-color-text: rgb(250, 240, 230); --hfx-color-text-muted: rgb(210, 200, 190); --hfx-color-status-info-fg: rgb(150, 200, 240); --hfx-color-status-info-bg: rgb(20, 50, 80); }" });
  const after = await colors(page);
  expect({ surface: after.surface, text: after.text }).toEqual({ surface: "rgb(20, 30, 40)", text: "rgb(250, 240, 230)" });
  // Muted notes and badge backgrounds consume their semantic roles directly.
  expect(after.note).toBe("rgb(210, 200, 190)");
  expect(after.badge).toBe("rgb(20, 50, 80)");
});

test.describe("literal-only static clients", () => {
  test.use({ javaScriptEnabled: false });

  test("the literal declarations apply when a client drops variable-valued declarations and the stylesheet", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(exampleUrl("outline-page.html"));
    // Model an email client's CSS filtering. Removing the stylesheet alone leaves modern inline fallbacks active.
    await page.evaluate(() => {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => link.remove());
      for (const element of document.querySelectorAll("[style]")) {
        // Read the attribute, since CSSOM has already discarded earlier declarations of the same property.
        const literal = element.getAttribute("style").split(";").filter(declaration => !/var\s*\(/i.test(declaration)).join(";");
        element.setAttribute("style", literal);
      }
    });
    const seen = await colors(page);
    expect({ surface: seen.surface, text: seen.text, scripts: seen.scripts }).toEqual({ ...LIGHT, scripts: 0 });
  });
});

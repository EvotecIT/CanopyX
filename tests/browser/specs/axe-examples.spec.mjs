// axe-core over every generated example page, at desktop (1440 x 900) and phone (390 x 844, touch) widths, in light and
// dark: pages with a dark twin (name-dark.html) are scanned in their own theme, and pages that follow the system theme are
// scanned with both colour schemes. Serious and critical violations fail the test; moderate and minor ones are attached
// to the report (docs/accessibility.md).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { examples, exampleUrl, nextFrames } from "./support.mjs";

// axe-core is injected once per page and run for each colour scheme, which keeps the sweep to one load per width.
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const VIEWPORTS = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } };

/** Every example page, relative to the examples folder; the csp/ pages repeat others with a nonce placeholder. */
function pages() {
  if (!fs.existsSync(examples)) return [];
  const found = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(path.join(examples, folder), { withFileTypes: true })) {
      const name = folder ? folder + "/" + entry.name : entry.name;
      if (entry.isDirectory()) { if (!["csp", "checkbox-assets", "assets"].includes(entry.name)) walk(name); }
      else if (entry.name.endsWith(".html")) found.push(name);
    }
  };
  walk("");
  return found.sort();
}

const all = pages();
for (const name of all) {
  const twin = name.endsWith("-dark.html") || all.includes(name.replace(/\.html$/, "-dark.html"));
  const schemes = twin ? [name.endsWith("-dark.html") ? "dark" : "light"] : ["light", "dark"];
  test(`axe finds no serious or critical violations on ${name}`, async ({ browser }, testInfo) => {
    const found = [];
    for (const [width, options] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ ...options, colorScheme: schemes[0] });
      const page = await context.newPage();
      try {
        await page.goto(exampleUrl(name));
        // Pages with views wait for them; the index and outline pages have none.
        if (await page.locator("[data-canopyx-host]").count()) await page.waitForSelector("[data-cx-ready]", { state: "attached", timeout: 15000 });
        await page.addScriptTag({ content: AXE });
        for (const colorScheme of schemes) {
          await page.emulateMedia({ colorScheme });
          await page.evaluate(() => document.fonts.ready);
          await nextFrames(page);
          const violations = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
            .then(result => result.violations.map(violation => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.slice(0, 3).map(node => node.target.join(" ")) }))), TAGS);
          for (const violation of violations) {
            const entry = `${width} ${colorScheme} ${violation.impact} ${violation.id}: ` + violation.targets.join(", ");
            if (violation.impact === "serious" || violation.impact === "critical") found.push(entry);
            else testInfo.annotations.push({ type: "axe " + violation.impact, description: entry });
          }
        }
      } finally {
        try {
          // Stop view-owned observers and animation work before closing the page and its browsing context.
          if (!page.isClosed()) {
            await page.evaluate(() => document.querySelectorAll('[data-canopyx-host]').forEach(host => host.canopyx?.destroy()));
            await page.close();
          }
        } finally { await context.close(); }
      }
    }
    expect(found).toEqual([]);
  });
}

test("the axe sweep found the example pages", () => {
  expect(all.length).toBeGreaterThan(40);
});

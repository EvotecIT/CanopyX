import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { examples } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";
import { inspectFinishQuality } from "../tools/finish-quality.mjs";

// The gallery is the inventory, so a new example joins the gate without maintaining a second page list.
const gallery = fs.existsSync(examples + "/index.html") ? fs.readFileSync(examples + "/index.html", "utf8") : "";
const pages = [...new Set([...gallery.matchAll(/href="([^"#]+\.html(?:#[^"]*)?)"/g)].map(match => match[1].split("#")[0]))];
let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

test("the generated gallery provides the finish-quality inventory", () => {
  expect(pages.length, "Generate examples before running the gallery quality gate.").toBeGreaterThan(0);
});

for (const size of [{ width: 1440, theme: "light" }, { width: 390, theme: "dark" }, { width: 720, theme: "light" }]) {
  test.describe(`gallery finish ${size.width} ${size.theme}`, () => {
    test.use({ viewport: { width: size.width, height: 900 }, colorScheme: size.theme, reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });
    for (const name of pages) test(name, async ({ page }, info) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
      // A dedicated dark page overrides an example's literal light theme, where one is generated.
      const dark = name.replace(/\.html$/, "-dark.html"), target = size.theme === "dark" && fs.existsSync(examples + "/" + dark) ? dark : name;
      const url = new URL(target, server.url); url.searchParams.set("theme", size.theme);
      await page.goto(url.href);
      for (const host of await page.locator("[data-canopyx-host],[data-canopyx-mounted]").all()) {
        if (!await host.isVisible()) continue;
        await host.scrollIntoViewIfNeeded();
        await expect.poll(() => host.evaluate(element => element.hasAttribute("data-cx-ready") ||
          element.hasAttribute("data-cx-calendar-ready") || !!element.querySelector("[data-cx-ready],[data-cx-calendar-ready]"))).toBe(true);
        await host.evaluate(async element => { await element.canopyx?.ready; });
      }
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      const findings = await page.evaluate(inspectFinishQuality);
      if (findings.length || errors.length) {
        const report = info.outputPath("findings.json"), frame = info.outputPath("frame.png");
        fs.writeFileSync(report, JSON.stringify({ page: target, ...size, findings, errors }, null, 2));
        await page.screenshot({ path: frame, fullPage: true });
        await info.attach("finish-quality", { path: report, contentType: "application/json" });
        await info.attach("frame", { path: frame, contentType: "image/png" });
      }
      expect(errors).toEqual([]);
      expect(findings).toEqual([]);
    });
  });
}

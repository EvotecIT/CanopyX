import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { examples, nextFrames } from "./support.mjs";
import { api, openBuilt, openCalendar, timelinePage } from "./calendar-support.mjs";

async function labelMismatches(page) {
  const result = await new AxeBuilder({ page }).include(".cx-cal").withRules(["label-content-name-mismatch"]).analyze();
  return result.violations.flatMap(violation => violation.nodes.map(node => node.target.join(" ")));
}

test("calendar speech targets follow CSS-only width changes without accumulating names", async ({ page }) => {
  await openCalendar(page, "calendar.html", { width: 760 });
  await page.evaluate(() => document.fonts.ready);
  await api(page, "api => api.setCalendarView('week')");
  const event = page.locator('.cx-cal-ev-block[data-cx-record="op-010"]');
  await expect(page.locator(".cx-cal-phone")).toHaveCount(0);
  await expect(event.locator(".cx-cal-ev-time")).toBeHidden();
  await event.evaluate(element => { window.originalLabelEvent = element; });
  expect(await labelMismatches(page)).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await nextFrames(page);
  await expect(event.locator(".cx-cal-ev-time")).toBeVisible();
  expect(await event.evaluate(element => element === window.originalLabelEvent)).toBe(true);
  expect(await labelMismatches(page)).toEqual([]);
  const wideName = await event.getAttribute("aria-label");
  await expect(event).toHaveAccessibleName(/^9:00 AM Database failover test/);

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(event.locator(".cx-cal-ev-time")).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(event.locator(".cx-cal-ev-time")).toBeVisible();
  await nextFrames(page);
  await expect(event).toHaveAttribute("aria-label", wideName);
});

test("timeline speech targets survive vertical lane recycling and horizontal window changes", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await openBuilt(page, "label-lanes.html", timelinePage({ sites: 2, roles: 1, hostsPerRole: 40, events: 800, span: 1, zoom: "hour" }));
  await nextFrames(page);
  expect(await page.locator(".cx-tl-lane .cx-cal-ev").count()).toBeGreaterThan(0);
  const initial = await page.locator(".cx-tl-lane[data-cx-resource]").evaluateAll(lanes => lanes.map(lane => lane.dataset.cxResource));

  await page.locator(".cx-tl-main").evaluate(main => { main.scrollTop = main.scrollHeight; main.scrollLeft = main.scrollWidth / 2; });
  const last = page.locator('.cx-tl-lane[data-cx-resource="host-1-0-39"]');
  await expect(last).toHaveCount(1);
  expect(initial).not.toContain("host-1-0-39");
  await nextFrames(page);
  expect(await page.locator(".cx-tl-main").evaluate(main => main.scrollLeft)).toBeGreaterThan(480);
  expect(await page.locator(".cx-tl-lane .cx-cal-ev").count()).toBeGreaterThan(0);
  expect(await labelMismatches(page)).toEqual([]);
});

test("calendar speech targets refresh after the shipped font loads without replacing events", async ({ page }) => {
  const fonts = [];
  const html = fs.readFileSync(path.join(examples, "calendar-linked-dark.html"), "utf8")
    .replace(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g, (_, data) => {
      fonts.push(Buffer.from(data, "base64"));
      return "http://canopyx.test/calendar-font-" + (fonts.length - 1) + ".woff2";
    });
  let releaseFont;
  const held = new Promise(resolve => { releaseFont = resolve; });
  await page.route("http://canopyx.test/calendar-font-*.woff2", async route => {
    const index = Number(route.request().url().match(/font-(\d+)/)[1]);
    await held;
    await route.fulfill({ contentType: "font/woff2", body: fonts[index] });
  });
  await page.route("http://canopyx.test/late-calendar-font.html", route => route.fulfill({ contentType: "text/html", body: html }));
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("http://canopyx.test/late-calendar-font.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-cx-calendar-ready]");
    await nextFrames(page);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    const event = page.locator('.cx-cal-ev-block[data-cx-event="op-012"]');
    await event.evaluate(element => { window.originalFontLabelEvent = element; });
    releaseFont();
    await page.evaluate(() => document.fonts.ready);
    await nextFrames(page);
    expect(await event.evaluate(element => element === window.originalFontLabelEvent)).toBe(true);
    expect(await labelMismatches(page)).toEqual([]);
    await expect(event).toHaveAccessibleName(/^1:00 PM Patch ring 1 pilot sign-off Planned,/);
    await expect(event).toHaveAccessibleName(/1:00 PM – 2:00 PM, Planned, Windows team$/);
  } finally { releaseFont(); }
});

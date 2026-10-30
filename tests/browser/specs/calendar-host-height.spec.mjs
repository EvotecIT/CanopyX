import { test, expect } from "@playwright/test";
import { examples } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";
import { api, openBuilt } from "./calendar-support.mjs";
import { calendarC1Page } from "./calendar-c1-support.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

for (const [width, theme] of [[1440, "light"], [720, "light"], [390, "dark"]]) {
  test(`explicit auto-height resource page ends at its slots at ${width}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
    await page.goto(server.url + "calendar-resource-window" + (theme === "dark" ? "-dark" : "") + ".html");
    await page.waitForSelector("[data-cx-calendar-ready]");
    await page.evaluate(async () => { await document.fonts.ready; });
    const fits = () => page.evaluate(() => {
      const body = document.querySelector(".cx-cal-body"), slots = document.querySelector(".cx-cal-scroll");
      return Math.abs(body.getBoundingClientRect().bottom - slots.getBoundingClientRect().bottom);
    });
    await expect.poll(fits).toBeLessThan(2);
    expect(await page.locator(".cx-host").evaluate(host => host.style.height)).toBe("auto");
    expect(await page.locator(".cx-cal-srow").last().getAttribute("role")).toBe("row");
    await expect(page.locator(".cx-cal-slot[data-cx-minutes='1050']").first()).toBeInViewport();
    await expect.poll(() => page.locator(".cx-cal-srow").first().evaluate(row => row.getBoundingClientRect().height)).toBe(24);
    await page.screenshot({ path: info.outputPath(`calendar-auto-${width}-${theme}.png`), fullPage: true });
    const picker = page.locator(".cx-cal-rpick-select");
    await picker.focus();
    await picker.selectOption(await picker.locator("option").last().getAttribute("value"));
    await expect(picker).toBeFocused();
    await expect.poll(fits).toBeLessThan(2);
    await api(page, "api => api.setCalendarView('month')");
    await expect(page.locator(".cx-cal-month")).toBeVisible();
    await api(page, "api => api.setCalendarView('day')");
    await expect.poll(fits).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
}

test("bounded full-day calendar keeps native slot geometry and reaches the last slot by keyboard", async ({ page }) => {
  await openBuilt(page, "bounded-full-day.html", calendarC1Page({ count: 2, calendar: { minTime: "00:00", maxTime: "24:00" } }));
  const scroller = page.locator(".cx-cal-scroll");
  expect(await scroller.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(300);
  await expect.poll(() => page.locator(".cx-cal-srow").first().evaluate(row => row.getBoundingClientRect().height)).toBe(24);
  await page.locator(".cx-cal-slot[data-cx-minutes='1380']").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-cal-slot[data-cx-minutes='1410']").first()).toBeFocused();
  await expect(page.locator(".cx-cal-slot[data-cx-minutes='1410']").first()).toBeInViewport();
});

test("auto-height resource print retains the complete slot range", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
  await page.goto(server.url + "calendar-resource-window.html");
  await page.waitForSelector("[data-cx-calendar-ready]");
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect.poll(() => page.locator(".cx-cal-scroll").evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThan(2);
  await expect(page.locator(".cx-cal-slot[data-cx-minutes='1050']").first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".cx-cal-rpick-select")).toBeVisible();
});

// The resource timeline (docs/resource-timeline.md): zoom from hours to quarters, the resource tree beside the lanes with
// its rows and lanes in step, group capacity and aggregates, background and unavailable ranges and business hours, the
// keyboard grid, hosted range loading by visible resources, virtual rows for thousands of resources, print and phones.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { nextFrames } from "./support.mjs";
import { api, capture, openBuilt, openCalendar, timelinePage } from "./calendar-support.mjs";

async function axe(page) {
  const results = await new AxeBuilder({ page }).include(".cx-cal").analyze();
  return results.violations.filter(item => ["serious", "critical"].includes(item.impact)).map(item => item.id + ": " + item.nodes.slice(0, 3).map(node => node.target.join(" ")).join(", "));
}
/** The tops of the first tree rows and of the lanes of the same resources, which must match. */
const alignment = page => page.evaluate(() => {
  const main = document.querySelector(".cx-tl-main").getBoundingClientRect();
  const rows = [...document.querySelectorAll(".cx-tl-tree .cx-row[data-cx-id]")].filter(row => { const box = row.getBoundingClientRect(); return box.top >= main.top && box.bottom <= main.bottom; }).slice(0, 8);
  return rows.map(row => {
    const lane = document.querySelector('.cx-tl-lane[data-cx-resource="' + CSS.escape(row.dataset.cxId) + '"]');
    return [row.dataset.cxId, Math.round(row.getBoundingClientRect().top), lane ? Math.round(lane.getBoundingClientRect().top) : null];
  }).filter(([, , laneTop], index, all) => laneTop != null || all.every(item => item[2] == null));
});
// The calendar's own live region; the resource tree has another inside it.
const live = page => page.locator(".cx-cal > .cx-live");

test.describe("resource timeline", () => {
  test("zooms from hours to quarters, each with its scale, with lanes level with the tree rows", async ({ page }) => {
    for (const dark of [false, true]) {
      await openCalendar(page, "calendar-timeline.html", { dark });
      for (const zoom of ["hour", "day", "week", "month", "quarter"]) {
        await api(page, "(api, element, zoom) => api.setCalendarZoom(zoom)", zoom);
        await nextFrames(page);
        expect(await api(page, "api => api.getCalendar().zoom")).toBe(zoom);
        expect(await page.locator(".cx-tl-lower > *").count()).toBeGreaterThan(zoom === "quarter" ? 3 : 6);
        for (const [id, rowTop, laneTop] of await alignment(page)) expect(laneTop, "lane of " + id).toBe(rowTop);
        if (zoom !== "quarter" && zoom !== "month") await capture(page, "timeline/" + zoom + "-" + (dark ? "dark" : "light") + "-1440");
      }
      expect(await axe(page)).toEqual([]);
    }
  });

  test("groups show their capacity and add up their resources; collapsing a group removes its lanes", async ({ page }) => {
    await openCalendar(page, "calendar-timeline.html");
    const cells = await page.evaluate(() => {
      const value = id => [...document.querySelectorAll('.cx-tl-tree .cx-row[data-cx-id="' + id + '"] .cx-tl-agg')].map(cell => cell.textContent);
      return { site: value("site-warsaw"), roles: ["role-warsaw-web", "role-warsaw-database", "role-warsaw-storage"].map(value) };
    });
    const count = text => Number(String(text).replace(/[^\d]/g, ""));
    const roles = cells.roles.filter(role => role.length);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.length).toBe(3);
    expect(count(cells.site[0])).toBe(roles.reduce((sum, role) => sum + count(role[0]), 0));
    // A group lane is a capacity lane: the most events at once per day, toned from the thresholds.
    const heat = page.locator('.cx-tl-lane[data-cx-resource="site-warsaw"] .cx-tl-heat');
    expect(await heat.count()).toBeGreaterThan(10);
    expect(await page.locator(".cx-tl-heat[data-cx-tone]").count()).toBeGreaterThan(0);
    await expect(page.locator('.cx-tl-lane[data-cx-resource="site-warsaw"]')).toHaveAttribute("aria-label", /Concurrent events \d+ at once/);
    // The tree's own expander collapses the web servers, and their lanes go with them.
    expect(await page.locator('.cx-tl-lane[data-cx-resource="war-we-01"]').count()).toBe(1);
    await page.locator('.cx-tl-tree .cx-row[data-cx-id="role-warsaw-web"] .cx-exp').first().click();
    await expect(page.locator('.cx-tl-lane[data-cx-resource="war-we-01"]')).toHaveCount(0);
    for (const [id, rowTop, laneTop] of await alignment(page)) expect(laneTop, "lane of " + id).toBe(rowTop);
    expect(await api(page, "api => api.getCalendar().collapsed")).toContain("role-warsaw-web");
  });

  test("ranges shade every lane or one resource, and hour zoom shades time outside business hours", async ({ page }) => {
    await openCalendar(page, "calendar-timeline.html");
    await expect(page.locator(".cx-tl-range-labels .cx-tl-range-label").first()).toBeVisible();
    expect(await page.locator(".cx-tl-layer .cx-tl-range").count()).toBeGreaterThan(0);
    expect(await page.locator(".cx-tl-lane .cx-tl-unavailable").count()).toBeGreaterThan(0);
    await api(page, "api => api.setCalendarZoom('hour')");
    await nextFrames(page);
    expect(await page.locator(".cx-tl-lane .cx-tl-off").count()).toBeGreaterThan(0);
    await capture(page, "timeline/hour-business-hours-light-1440");
  });

  test("the lanes are a grid: arrows walk units and resources, Enter enters a unit's events, Space selects", async ({ page }) => {
    await openCalendar(page, "calendar-timeline.html");
    const start = page.locator('.cx-tl-lane[data-cx-resource="war-we-01"] .cx-tl-cell[data-cx-unit="15"]');
    await start.scrollIntoViewIfNeeded();
    // The lane takes the click and finds the unit under the pointer.
    await start.click({ position: { x: 4, y: 4 }, force: true });
    const focused = () => page.evaluate(() => { const cell = document.activeElement.closest(".cx-tl-cell"); return cell ? [cell.dataset.cxResource, Number(cell.dataset.cxUnit)] : [document.activeElement.className]; });
    expect(await focused()).toEqual(["war-we-01", 15]);
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toEqual(["war-we-01", 16]);
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toEqual(["war-we-02", 16]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    expect(await focused()).toEqual(["war-we-01", 0]);
    await page.keyboard.press("Space");
    await expect(live(page)).toHaveText(/^Selected /);
    await expect(page.locator(".cx-tl-cell[data-cx-unit=\"0\"]").first()).toHaveAttribute("aria-label", /war-we-01|Warsaw/);
    // Enter on a unit with events moves into them; Escape returns to the unit.
    const busy = await page.evaluate(() => { const element = document.querySelector('.cx-tl-lane[data-cx-resource="war-we-01"] .cx-tl-cell .cx-cal-ev'); return element ? Number(element.closest(".cx-tl-cell").dataset.cxUnit) : null; });
    if (busy != null) {
      for (let unit = 0; unit < busy; unit++) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      expect(await page.evaluate(() => document.activeElement.classList.contains("cx-cal-ev"))).toBe(true);
      await page.keyboard.press("Escape");
      expect(await focused()).toEqual(["war-we-01", busy]);
    }
  });

  test("a hosted timeline asks only for the resources in view, and again when others scroll in", async ({ page }) => {
    await openBuilt(page, "hosted.html", timelinePage({ sites: 4, roles: 3, hostsPerRole: 40, events: 6000, hosted: true }));
    const first = await page.evaluate(() => window.ranges[0]);
    expect(first.resources).toBeGreaterThan(0);
    expect(first.resources).toBeLessThanOrEqual(1000);
    expect(first.first).toBe("site-0");
    const before = await page.evaluate(() => window.ranges.length);
    await page.evaluate(() => { document.querySelector(".cx-tl-main").scrollTop = 3000; });
    await expect.poll(() => page.evaluate(() => window.ranges.length)).toBeGreaterThan(before);
    const last = await page.evaluate(() => window.ranges.at(-1));
    expect(last.first).not.toBe("site-0");
    // The lanes in view now hold the events of their own resources.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".cx-tl-lane .cx-cal-ev")].length)).toBeGreaterThan(0);
  });

  test("5,000 resources keep a bounded number of lanes and reach the last resource", async ({ page }) => {
    await openBuilt(page, "many.html", timelinePage({ sites: 10, roles: 5, hostsPerRole: 100, events: 20000 }));
    expect(await page.evaluate(() => document.querySelectorAll(".cx-tl-lane").length)).toBeLessThan(120);
    await page.evaluate(() => { const main = document.querySelector(".cx-tl-main"); main.scrollTop = main.scrollHeight; });
    await expect(page.locator('.cx-tl-lane[data-cx-resource="host-9-4-99"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelectorAll(".cx-tl-lane").length)).toBeLessThan(120);
    for (const [id, rowTop, laneTop] of await alignment(page)) expect(laneTop, "lane of " + id).toBe(rowTop);
  });

  test("print writes a static copy of the visible resources and their events", async ({ page }) => {
    await openCalendar(page, "calendar-timeline.html");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const rows = page.locator(".cx-tl-print .cx-tl-print-row");
    expect(await rows.count()).toBeGreaterThan(10);
    await expect(page.locator(".cx-tl-print .cx-tl-print-head")).toContainText("Hosts");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expect(page.locator(".cx-tl-print")).toHaveCount(0);
  });

  test("phones keep a narrow resource pane and the page never scrolls sideways", async ({ page }) => {
    for (const dark of [false, true]) {
      await openCalendar(page, "calendar-timeline.html", { dark, width: 390, height: 844 });
      await api(page, "api => api.setCalendarView('timeline')");
      await nextFrames(page);
      // Names only: no hidden-column counts, and about 110 pixels of name even at the third level.
      expect(Math.round(await page.evaluate(() => document.querySelector(".cx-tl-side").getBoundingClientRect().width))).toBeLessThanOrEqual(180);
      expect(await page.locator(".cx-tl-tree .cx-hidden-fields:visible").count()).toBe(0);
      const name = await page.evaluate(() => { const row = document.querySelector('.cx-tl-tree .cx-row[aria-level="3"]'), width = selector => row.querySelector(selector).getBoundingClientRect().width, text = row.querySelector(".cx-text");
        return { room: Math.round(width(".cx-cell") - width(".cx-indent") - width(".cx-exp")), cut: text.scrollWidth > text.clientWidth }; });
      expect(name.room).toBeGreaterThanOrEqual(100);
      expect(name.cut).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      for (const [id, rowTop, laneTop] of await alignment(page)) expect(laneTop, "lane of " + id).toBe(rowTop);
      expect(await axe(page)).toEqual([]);
      await capture(page, "timeline/day-" + (dark ? "dark" : "light") + "-390");
    }
  });
});

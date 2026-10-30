// The record drawer is a full-height sheet with one scroller: the body fills the space between the header and the actions,
// the tab and section bar stays pinned at the body's top edge with nothing showing above it, scrolling never moves the page
// behind, section links scroll only the body, and the drawer closes when its grid stops rendering.
import { test, expect } from "@playwright/test";
import { api, definition, open, drawer } from "./record-panel-fixtures.mjs";
import { settleOverlayMotion } from "./support.mjs";

async function openRecord(page, width, chrome = "panel", options = {}) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const view = definition(options.extra || {});
  view.chrome = chrome;
  // One long record (no tabs) gives the body more evidence than fits and a list of section links.
  view.record.tabs = [];
  await open(page, view);
  await page.evaluate(api + ".openDetails('c001')");
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  await settleOverlayMotion(sheet);
  return sheet;
}

for (const width of [1440, 390]) for (const chrome of ["panel", "embedded"]){
  test(`record drawer body fills the viewport with ${chrome} chrome at ${width}px`, async ({ page }) => {
    const sheet = await openRecord(page, width, chrome);
    const geometry = await sheet.evaluate(dialog => {
      const body = dialog.querySelector(".cx-drawer-body"), style = getComputedStyle(dialog);
      const chrome = [...dialog.children].filter(element => element !== body && getComputedStyle(element).display !== "none")
        .reduce((sum, element) => { const s = getComputedStyle(element); return sum + element.getBoundingClientRect().height + parseFloat(s.marginTop) + parseFloat(s.marginBottom); }, 0);
      const frame = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return { viewport: innerHeight, sheet: dialog.getBoundingClientRect().height, top: dialog.getBoundingClientRect().top, body: body.getBoundingClientRect().height,
        chrome, frame, evidence: body.scrollHeight, width: dialog.getBoundingClientRect().width };
    });
    expect(geometry.top).toBeLessThanOrEqual(1);
    expect(geometry.sheet).toBeGreaterThanOrEqual(geometry.viewport - 2);
    expect(geometry.body).toBeGreaterThanOrEqual(geometry.viewport - geometry.chrome - geometry.frame - 2);
    expect(geometry.evidence).toBeGreaterThan(geometry.body);
    if (width === 390) expect(geometry.width).toBeGreaterThanOrEqual(width - 2);
  });
}

for (const width of [1440, 390]) for (const chrome of ["panel", "embedded"]) {
  test(`scrolling the record drawer moves only its body, with nothing above the pinned bar, at ${width}px (${chrome})`, async ({ page }) => {
    const sheet = await openRecord(page, width, chrome);
    const body = sheet.locator(".cx-drawer-body");
    const start = await page.evaluate(() => scrollY);
    const box = await body.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
    const steps = [];
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 90);
      await page.waitForTimeout(60);
      steps.push(await body.evaluate(element => {
        const tools = element.querySelector(".cx-record-tools"), toolsBox = tools.getBoundingClientRect(), bodyBox = element.getBoundingClientRect();
        const sections = [...element.querySelectorAll(".cx-record-panel > .cx-record-section")].map(section => section.getBoundingClientRect().top);
        // A row that has scrolled past the bar must not be painted between the body's top edge and the bar.
        const gap = toolsBox.top - bodyBox.top - element.clientTop;
        return { scrollTop: element.scrollTop, sections, gap, page: scrollY };
      }));
    }
    for (const step of steps) {
      expect(step.gap).toBeLessThanOrEqual(1);
      expect(step.page).toBe(start);
    }
    for (let i = 1; i < steps.length; i++) {
      const moved = steps[i].scrollTop - steps[i - 1].scrollTop;
      expect(moved).toBeGreaterThanOrEqual(0);
      // Every section moves by exactly the scroll distance: no layout shift while scrolling.
      steps[i].sections.forEach((top, index) => expect(Math.abs(steps[i - 1].sections[index] - top - moved)).toBeLessThanOrEqual(1));
    }
    expect(steps.at(-1).scrollTop).toBeGreaterThan(0);
  });
}

test("a section link scrolls only the drawer body and lands the section below the pinned bar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sheet = await openRecord(page, 1440);
  const links = sheet.locator(".cx-record-jump-link");
  expect(await links.count()).toBeGreaterThan(1);
  const start = await page.evaluate(() => scrollY);
  await links.last().click();
  const placed = await sheet.evaluate(dialog => {
    const body = dialog.querySelector(".cx-drawer-body"), tools = body.querySelector(".cx-record-tools");
    const sections = [...body.querySelectorAll(".cx-record-panel > .cx-record-section")], target = sections.at(-1);
    const maxScroll = body.scrollHeight - body.clientHeight;
    return { offset: target.getBoundingClientRect().top - tools.getBoundingClientRect().bottom, atEnd: body.scrollTop >= maxScroll - 1, scrollTop: body.scrollTop, focused: target.contains(document.activeElement) };
  });
  expect(placed.scrollTop).toBeGreaterThan(0);
  // The section starts right below the bar, unless the body cannot scroll further.
  if (!placed.atEnd) expect(Math.abs(placed.offset)).toBeLessThanOrEqual(2);
  else expect(placed.offset).toBeGreaterThanOrEqual(-1);
  expect(placed.focused).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(start);
});

test("the record drawer is a side panel on wide screens and a sheet on narrow ones by default", async ({ page }) => {
  let sheet = await openRecord(page, 1440);
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(false);
  // The side panel docks to the right edge beside the live view.
  expect(await sheet.evaluate(element => Math.round(innerWidth - element.getBoundingClientRect().right))).toBe(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  sheet = await openRecord(page, 390);
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(true);
  expect(await sheet.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(390);
});

for (const where of ["view", "mount"]) test(`a host opts into the sheet over a scrim at every width through the ${where}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = definition(); view.record.tabs = [];
  if (where === "view") view.recordDrawerModal = true;
  await open(page, view);
  await page.evaluate(async ([view, where]) => {
    const old = document.querySelector("[data-canopyx-host]"); old.canopyx.destroy?.(); old.remove();
    const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
    host.canopyx = CanopyX.createDataGrid(host, where === "mount" ? { view, recordDrawerModal: true } : { view }); await host.canopyx.ready;
    await host.canopyx.openDetails("c001");
  }, [view, where]);
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(true);
  // The scrim closes it.
  await page.mouse.click(20, 450);
  await expect(sheet).toHaveCount(0);
});
test("the record drawer closes when its grid stops rendering and does not reopen in a narrowed layout", async ({ page }) => {
  const sheet = await openRecord(page, 1440);
  await page.evaluate(() => { document.querySelector('[data-canopyx-host]').style.display = "none"; });
  await expect(sheet).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('[data-canopyx-host]').style.display = ""; });
  await expect(drawer(page)).toHaveCount(0);
});

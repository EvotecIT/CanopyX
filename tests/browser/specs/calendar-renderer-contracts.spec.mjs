import path from "node:path";
import { expect, test } from "@playwright/test";
import { nextFrames } from "./support.mjs";
import { rendererFixture, rendererSnapshot } from "./calendar-renderer-fixture.mjs";

let fixture;
test.beforeAll(async () => { fixture = await rendererFixture(); });
test.afterAll(async () => { await fixture?.close(); });

async function open(page, search = "") {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
  await page.goto(fixture.url + search);
  await page.waitForSelector("[data-cx-calendar-ready]");
  await nextFrames(page);
  return errors;
}

test("calendar status renderers release each replaced render and the final render on destroy", async ({ page }, testInfo) => {
  const errors = await open(page);
  const checkpoints = [];
  for (const view of ["agenda", "day", "agenda"]) {
    await page.evaluate(view => window.api.setCalendarView(view), view);
    await nextFrames(page);
    const calls = await rendererSnapshot(page);
    checkpoints.push(calls);
    const removed = calls.filter(call => !call.connected);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every(call => call.disposed === 1 && call.aborted === 1 && call.signalAborted)).toBe(true);
    const active = calls.filter(call => call.connected && call.row !== "throw");
    const current = page.locator('.cx-cal-ev:not([data-cx-record="throw"]) .cx-cal-ev-status');
    expect(await current.count()).toBeGreaterThan(0);
    expect(active).toHaveLength(await current.count());
    expect(await current.evaluateAll(elements => elements.every(element => window.rendererCalls.some(call => call.element === element)))).toBe(true);
    expect(active.every(call => call.disposed === 0 && call.aborted === 0 && !call.signalAborted)).toBe(true);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("renderer-pulse")));
  const beforeDestroy = await rendererSnapshot(page);
  expect(beforeDestroy.filter(call => !call.connected).every(call => call.notifications === 0)).toBe(true);
  expect(beforeDestroy.filter(call => call.connected && call.row !== "throw").every(call => call.notifications === 1)).toBe(true);
  expect(beforeDestroy.every(call => call.column === "status" && call.index === 3)).toBe(true);
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-status-renderers.png") });
  await page.evaluate(() => window.api.destroy());
  const destroyed = await rendererSnapshot(page);
  expect(destroyed.every(call => call.disposed === 1 && call.aborted === 1 && call.signalAborted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("renderer-pulse")));
  expect(await rendererSnapshot(page)).toEqual(destroyed);
  expect(errors).toEqual([]);
  await testInfo.attach("renderer-lifetime", { body: JSON.stringify({ checkpoints, beforeDestroy, destroyed }, null, 2), contentType: "application/json" });
});

test("calendar status renderers keep normal text for false and void with calendar hook decoration", async ({ page }, testInfo) => {
  const errors = await open(page);
  await expect(page.locator('[data-cx-record="false"] .cx-cal-ev-status')).toHaveText("Status false");
  await expect(page.locator('[data-cx-record="false"] .cx-cal-ev-status')).toHaveClass(/host-decoration/);
  await expect(page.locator('[data-cx-record="void"] .cx-cal-ev-status')).toHaveText("Status void");
  await expect(page.locator('[data-cx-record="owned"] .cx-cal-ev-status')).toHaveText("Host status");
  await expect(page.locator('.cx-cal-ev[data-host-calendar="decorated"]')).toHaveCount(4);
  expect(errors).toEqual([]);
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-status-fallback.png") });
});

test("a throwing calendar status renderer is disposed immediately and falls back without breaking siblings", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('[data-cx-record="throw"] .cx-cal-ev-status')).toHaveText("Status throw");
  await expect(page.locator('[data-cx-record="throw"] .cx-cal-ev-status')).toBeVisible();
  const failures = (await rendererSnapshot(page)).filter(call => call.row === "throw");
  expect(failures.length).toBeGreaterThan(0);
  expect(failures.every(call => call.disposed === 1 && call.aborted === 1 && call.signalAborted)).toBe(true);
  expect(await page.evaluate(() => window.rendererErrors)).toContain("calendar renderer failure");
  await expect(page.locator('[data-cx-record="owned"] .cx-cal-ev-status')).toHaveText("Host status");
  await page.evaluate(() => window.api.setCalendarView("agenda"));
  await expect(page.locator('[data-cx-record="throw"] .cx-cal-ev-status')).toHaveText("Status throw");
  await expect(page.locator('[data-cx-record="throw"] .cx-cal-ev-status')).toBeVisible();
  expect(errors).toEqual([]);
});

test("phone month day changes release replaced status renderer elements and preserve the current list", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, "?phone"), checkpoints = [];
  let beforeDestroy, destroyed;
  try {
    await expect(page.locator('.cx-cal-daylist [data-cx-record="owned-16"]')).toBeVisible();
    for (const day of [17, 18, 16]) {
      const dayNumber = Date.UTC(2026, 9, day) / 86400000;
      await page.locator('.cx-cal-day[data-cx-day="' + dayNumber + '"] .cx-cal-num').click();
      await nextFrames(page);
      await expect(page.locator('.cx-cal-daylist [data-cx-record="owned-' + day + '"]')).toBeVisible();
      const beforePulse = await rendererSnapshot(page);
      await page.evaluate(() => window.dispatchEvent(new Event("renderer-pulse")));
      const calls = await rendererSnapshot(page);
      checkpoints.push({ day, beforePulse, calls });
      const retired = calls.filter(call => !call.connected), active = calls.filter(call => call.connected);
      expect(retired.length).toBeGreaterThan(0);
      expect(retired.every(call => call.disposed === 1 && call.aborted === 1 && call.signalAborted)).toBe(true);
      expect(retired.every(call => call.notifications === beforePulse.find(before => before.render === call.render).notifications)).toBe(true);
      const current = page.locator(".cx-cal-daylist .cx-cal-ev-status");
      expect(await current.count()).toBeGreaterThan(0);
      expect(active).toHaveLength(await current.count());
      expect(await current.evaluateAll(elements => elements.every(element => window.rendererCalls.some(call => call.element === element)))).toBe(true);
      expect(active.every(call => call.disposed === 0 && call.aborted === 0 && !call.signalAborted)).toBe(true);
      expect(active.every(call => call.notifications === beforePulse.find(before => before.render === call.render).notifications + 1)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    beforeDestroy = await rendererSnapshot(page);
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, testInfo.project.name + "-phone-month-renderers.png") });
    await page.evaluate(() => window.api.destroy());
    destroyed = await rendererSnapshot(page);
    await testInfo.attach("phone-month-renderer-lifetime", { body: JSON.stringify({ checkpoints, beforeDestroy, destroyed }, null, 2), contentType: "application/json" });
  }
  expect(destroyed.every(call => call.disposed === 1 && call.aborted === 1 && call.signalAborted)).toBe(true);
});

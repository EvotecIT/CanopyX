import { test, expect } from "@playwright/test";
import path from "node:path";
import { exampleUrl } from "./support.mjs";

async function open(page, name, width = 1440) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 1000 });
  const file = name + (width === 390 ? "-dark" : "") + ".html";
  await page.goto(process.env.CANOPYX_FRAME_BASE_URL ? process.env.CANOPYX_FRAME_BASE_URL + "/" + file : exampleUrl(file));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
}

for (const name of ["board", "path", "stack"]) test(name + " record titles are strong, flush and free of resting button chrome", async ({ page }) => {
  await open(page, name);
  const title = page.locator(".cx-" + name + "-title").first();
  const result = await title.evaluate(node => {
    const style = getComputedStyle(node), parent = getComputedStyle(node.closest(".cx-" + node.className.match(/cx-(board|path|stack)-title/)[1]));
    return { color:style.color, parentColor:parent.color, padding:style.paddingInlineStart, background:style.backgroundColor, weight:Number(style.fontWeight), height:node.clientHeight, line:Number.parseFloat(style.lineHeight) };
  });
  expect(result.color).toBe(result.parentColor); expect(result.padding).toBe("0px"); expect(result.background).toBe("rgba(0, 0, 0, 0)"); expect(result.weight).toBeGreaterThanOrEqual(600);
  if (name === "board") {
    expect(result.height).toBeGreaterThanOrEqual(result.line * 2 - 1);
    const positions = await page.locator(".cx-board-scroll").first().locator(".cx-board-card").evaluateAll(cards => cards.map(card => { const r=card.getBoundingClientRect();return { top:r.top,bottom:r.bottom }; }));
    expect(positions[1].top).toBeGreaterThan(positions[0].bottom);
    await expect(page.locator('.cx-facet-values[aria-label="Status"] .cx-facet-text')).toHaveText(["Backlog", "Ready", "In progress", "Done"]);
  }
});

test("desktop plan fills its range, labels today/conflicts, routes arrows and insets baselines", async ({ page }) => {
  await open(page, "plan");
  await expect(page.locator(".cx-plan-today")).toHaveText("Today");
  await expect(page.locator(".cx-plan-legend")).toContainText("Conflict");
  await expect(page.locator(".cx-tl-now")).toBeVisible();
  const sizes = await page.evaluate(() => ({ axis:document.querySelector(".cx-tl-canvas").getBoundingClientRect().width, available:document.querySelector(".cx-tl-main").clientWidth }));
  expect(sizes.axis).toBeGreaterThanOrEqual(sizes.available - 2);
  const paths = await page.locator(".cx-plan-links path").evaluateAll(nodes => nodes.map(node => node.getAttribute("d")));
  expect(paths).toHaveLength(5); expect(paths.every(d => d.includes(" H") && d.includes(" V") && d.includes(" L"))).toBe(true);
  const edge=page.locator(".cx-plan-links path").nth(1), point=await edge.evaluate(node => {
    const p=node.getPointAtLength(node.getTotalLength()*.6), matrix=node.getScreenCTM();return { x:p.x*matrix.a+matrix.e,y:p.y*matrix.d+matrix.f };
  });
  await page.mouse.move(point.x,point.y); await expect.poll(() => edge.evaluate(node => getComputedStyle(node).strokeWidth)).toBe("3px");
  const milestone = page.locator(".cx-plan-milestone .cx-cal-ev-title"); await expect(milestone).toBeVisible(); await expect(milestone).toHaveAttribute("title", "Release milestone");
  expect(await page.locator(".cx-plan-baseline").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().bottom < node.parentElement.getBoundingClientRect().bottom - 2))).toBe(true);
  expect(await page.locator(".cx-plan-host").evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(500);
});

test("phone plan is a lane agenda with dates, dependencies and record navigation", async ({ page }) => {
  await open(page, "plan", 390);
  await expect(page.locator(".cx-plan")).toBeHidden(); await expect(page.locator(".cx-plan-agenda")).toBeVisible();
  await expect(page.locator(".cx-plan-agenda-title")).toHaveCount(5);
  await expect(page.locator(".cx-plan-agenda")).toContainText("Dependencies: 2");
  await expect(page.locator(".cx-plan-agenda")).toContainText("Conflict");
  await page.locator(".cx-plan-agenda-title").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
});

for (const name of ["time-matrix", "time-propagation"]) test(name + " playback has readable time, snapshot ticks and one complete phone frame", async ({ page }) => {
  await open(page, name, 390);
  await expect(page.locator(".cx-time-stamp")).toContainText("2026");
  await expect(page.locator(".cx-time-stamp")).not.toContainText("T10:");
  await expect(page.locator(".cx-time-ticks i")).toHaveCount(3);
  await expect(page.getByRole("button", { name:"Play", exact:true }).locator("svg")).toBeVisible();
  await page.getByRole("button", { name:"Play", exact:true }).click(); await expect(page.getByRole("button", { name:"Pause", exact:true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name:"Pause", exact:true }).click(); await page.getByRole("slider").fill("2");
  await expect(page.locator(".cx-time-position")).toHaveText("Snapshot 3 of 3");
  expect(await page.locator(".cx-time-host").evaluate(host => [...host.children].filter(node => !node.hidden).every(node => node.getBoundingClientRect().bottom <= host.getBoundingClientRect().bottom + 1))).toBe(true);
});

test("phone cycle explicitly returns to its source; disabled route remains readable", async ({ page }) => {
  await open(page, "path", 390);
  const cycle = page.locator(".cx-path-return"); await expect(cycle).toContainText("Step 1");
  await cycle.scrollIntoViewIfNeeded(); await cycle.click(); await expect(page.locator('[data-cx-path-position="1:0"]')).toBeFocused();
  await expect(page.locator(".cx-path-disabled")).toContainText("Disabled");
  expect(await page.locator(".cx-path-disabled").evaluate(node => getComputedStyle(node).borderTopStyle)).toBe("dashed");
  if (process.env.CANOPYX_EVIDENCE) {
    await page.locator('[data-cx-path-chain="rework"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path:path.join(process.env.CANOPYX_EVIDENCE,"path-cycle-390-dark.png"), fullPage:true });
  }
});

test("phone drawer reserves a full title row and aligns section text with fields", async ({ page }) => {
  await open(page, "path", 390); await page.locator(".cx-path-title").first().click();
  const drawer=page.getByRole("dialog"); await expect(drawer).toBeVisible();
  const layout=await drawer.evaluate(node => {
    const title=node.querySelector('[data-hfx-part="title"]'), header=node.querySelector('[data-hfx-part="header"]');
    const toggle=node.querySelector(".cx-record-toggle"), range=document.createRange();range.selectNodeContents(toggle.lastChild);
    return { titleWidth:title.getBoundingClientRect().width, titleBottom:title.getBoundingClientRect().bottom, actionTop:header.querySelector("button").getBoundingClientRect().top,
      headingX:range.getBoundingClientRect().left, fieldX:node.querySelector("dt").getBoundingClientRect().left };
  });
  expect(layout.titleWidth).toBeGreaterThan(300); expect(layout.actionTop).toBeGreaterThanOrEqual(layout.titleBottom);
  expect(Math.abs(layout.headingX-layout.fieldX), JSON.stringify(layout)).toBeLessThanOrEqual(1);
});

for (const width of [1440,390]) test("grid selection header exposes its commands at " + width, async ({ page }) => {
  await open(page,"reporting-grid",width);
  const box=page.locator('.cx-header-check').first(); await expect(box).toBeVisible();
  // The current main geometry is recorded for its existing shared-control correction.
  const size=await box.boundingBox(); await test.info().attach("selection-header-geometry",{body:JSON.stringify(size),contentType:"application/json"});
  if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path:path.join(process.env.CANOPYX_EVIDENCE,"grid-selection-"+width+(width===390?"-dark":"-light")+".png"),fullPage:true });
  await box.click(); await expect(page.getByRole("button",{name:"Select all matching",exact:true})).toBeVisible();
});

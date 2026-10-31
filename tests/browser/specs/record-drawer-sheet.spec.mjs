// The record drawer is a full-height sheet with one scroller: the body fills the space between the header and the actions,
// the tab and section bar stays pinned at the body's top edge with nothing showing above it, scrolling never moves the page
// behind, section links scroll only the body, and the drawer closes when its grid stops rendering.
import { test, expect } from "@playwright/test";
import { api, definition, open, drawer } from "./record-panel-fixtures.mjs";
import { settleOverlayMotion } from "./support.mjs";

function recordDefinition(kind, extra = {}) {
  const view = definition(extra);
  if (kind === "tree") { view.type = "view"; view.roots = view.rows.map(row => ({ ...row, label: row.cells.cn.value })); delete view.rows; }
  return view;
}

async function openRecord(page, width, chrome = "panel", options = {}) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const view = recordDefinition(options.kind, options.extra);
  // One long record (no tabs) gives the body more evidence than fits and a list of section links.
  view.record.tabs = [];
  await open(page, view, "", chrome);
  if (options.ownerAncestor) await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), owner = document.createElement("div");
    host.before(owner); owner.append(host);
  });
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
        chrome, frame, evidence: body.scrollHeight, width: dialog.getBoundingClientRect().width, hostChrome: document.querySelector("[data-canopyx-host]").dataset.cxChrome };
    });
    expect(geometry.hostChrome).toBe(chrome);
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

for (const width of [1440, 390]) test(`a section link scrolls only the drawer body and lands below the pinned bar at ${width}px`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sheet = await openRecord(page, width);
  await sheet.locator(".cx-drawer-body").evaluate(body => { body.style.scrollBehavior = "smooth"; });
  const links = sheet.locator(".cx-record-jump-link");
  expect(await links.count()).toBeGreaterThan(1);
  if (width === 390) {
    const compact = await sheet.evaluate(dialog => {
      const jump = dialog.querySelector(".cx-record-jump"), box = jump.getBoundingClientRect();
      return { tops: [...jump.children].map(link => link.getBoundingClientRect().top),
        width: jump.clientWidth, content: jump.scrollWidth,
        emptyTop: dialog.querySelector(".cx-record-empty").getBoundingClientRect().top, bottom: box.bottom };
    });
    expect(Math.max(...compact.tops) - Math.min(...compact.tops)).toBeLessThanOrEqual(1);
    expect(compact.content).toBeGreaterThan(compact.width);
    expect(compact.emptyTop).toBeGreaterThanOrEqual(compact.bottom - 1);
    await links.last().focus();
    await expect.poll(() => links.last().evaluate(link => {
      const button = link.getBoundingClientRect(), row = link.parentElement.getBoundingClientRect();
      return button.left >= row.left - 1 && button.right <= row.right + 1;
    })).toBe(true);
  }
  const start = await page.evaluate(() => scrollY);
  const placed = await sheet.evaluate(dialog => {
    // Observe the jump in the same task, before smooth scrolling could advance.
    [...dialog.querySelectorAll(".cx-record-jump-link")].at(-1).click();
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

for (const kind of ["grid", "tree"]) for (const where of ["mount", "view"]) test(`${kind} rejects a non-Boolean modal ${where} option before mounting`, async ({ page }) => {
  await openRecord(page, 1440, "panel", { kind });
  const view = recordDefinition(kind, { recordDrawerModal: where === "view" ? "true" : true });
  const result = await page.evaluate(({ view, kind, where }) => {
    const host = document.body.appendChild(document.createElement("div"));
    let error = "", grid;
    try { grid = CanopyX[kind === "tree" ? "createTreeGrid" : "createDataGrid"](host, where === "mount" ? { view, recordDrawerModal: "true" } : { view }); }
    catch (failure) { error = failure.message; }
    const mounted = host.hasAttribute("data-canopyx-mounted");
    grid?.destroy(); host.remove();
    return { error, mounted };
  }, { view, kind, where });
  expect(result.error).toMatch(/recordDrawerModal|invalid grid appearance/);
  expect(result.mounted).toBe(false);
});

for (const kind of ["grid", "tree"]) test(`${kind} record drawer defaults to a side panel on wide screens and a sheet on narrow ones`, async ({ page }) => {
  let sheet = await openRecord(page, 1440, "panel", { kind });
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(false);
  expect(await sheet.evaluate(element => Math.round(innerWidth - element.getBoundingClientRect().right))).toBe(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  sheet = await openRecord(page, 390, "panel", { kind });
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(true);
  expect(await sheet.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(390);
});

for (const kind of ["grid", "tree"]) for (const where of ["view", "mount", "override"]) test(`${kind} drawer honors the ${where === "override" ? "false mount override of a true view" : "modal " + where + " preference"}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = recordDefinition(kind); view.record.tabs = [];
  if (where !== "mount") view.recordDrawerModal = true;
  await open(page, view);
  await page.evaluate(async ({ view, kind, where }) => {
    const old = document.querySelector("[data-canopyx-host]"); old.canopyx.destroy?.(); old.remove();
    const host = document.createElement("div"); host.className = "cx-host"; document.body.append(host);
    host.canopyx = CanopyX[kind === "tree" ? "createTreeGrid" : "createDataGrid"](host,
      where === "view" ? { view } : { view, recordDrawerModal: where === "mount" }); await host.canopyx.ready;
    await host.canopyx.openDetails("c001");
  }, { view, kind, where });
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element => element.matches(":modal"))).toBe(where !== "override");
  if (where === "override") await page.keyboard.press("Escape");
  else await page.mouse.click(20, 450);
  await expect(sheet).toHaveCount(0);
});
for (const kind of ["grid", "tree"]) for (const hiding of ["display", "visibility"]) test(`${kind} record drawer closes with its ${hiding}-hidden view and a hidden open preserves outside focus`, async ({ page }) => {
  const sheet = await openRecord(page, 1440, "panel", { kind, ownerAncestor: hiding === "visibility" });
  await page.evaluate(hiding => { const host = document.querySelector("[data-canopyx-host]");
    (hiding === "visibility" ? host.parentElement : host).style[hiding] = hiding === "visibility" ? "hidden" : "none";
  }, hiding);
  await expect(sheet).toHaveCount(0);
  await page.evaluate(async () => {
    const button = document.createElement("button"); button.id = "outside-control"; button.textContent = "Visible host control"; document.body.append(button); button.focus();
    await document.querySelector('[data-canopyx-host]').canopyx.openDetails("c001");
  });
  await expect(page.locator("#outside-control")).toBeFocused();
  await expect(drawer(page)).toHaveCount(0);
  await page.evaluate(hiding => { const host = document.querySelector("[data-canopyx-host]");
    (hiding === "visibility" ? host.parentElement : host).style[hiding] = "";
  }, hiding);
  await expect(drawer(page)).toHaveCount(0);
  await page.evaluate(api + ".openDetails('c001')");
  await expect(drawer(page)).toBeVisible();
});

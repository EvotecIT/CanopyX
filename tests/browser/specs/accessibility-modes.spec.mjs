// Display modes and pointer targets (docs/accessibility.md): forced colours (Windows high contrast), reduced motion,
// reflow at 200% and 400% zoom (640 and 320 CSS pixel wide windows), and the WCAG 2.2 target size of 24 x 24 CSS pixels,
// met by the control's box, by a larger hit area, or by spacing. Phone toolbars aim for 44 pixel targets.
import { test, expect } from "@playwright/test";
import { openExample, nextFrames, settleOverlayMotion } from "./support.mjs";

/** The colour a CSS system colour resolves to on this page, under the current emulation. */
const systemColor = (page, name) => page.evaluate(color => {
  const probe = document.body.appendChild(document.createElement("i"));
  probe.style.color = color;
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}, name);

async function openColumns(page, tree) {
  if (tree) { await page.getByText("Columns", { exact: true }).first().click(); return page.locator(".cx-grid-panel:popover-open, .cx-grid-panel").filter({ has: page.getByRole("checkbox") }).first(); }
  const summary = page.locator(".cx-grid-columns > summary").first();
  if (!await summary.isVisible()) await page.locator(".cx-grid-overflow > summary").first().click();
  await summary.click();
  return page.locator(".cx-grid-columns .cx-grid-panel").first();
}

const PAGES = [["tree", "inline.html", "inline.html"], ["grid", "rich-grid.html", "rich-grid-dark.html"], ["reporting", "reporting-grid.html", "reporting-grid-dark.html"]];

for (const scheme of ["light", "dark"]) {
  for (const [kind, light, dark] of PAGES) {
    test(`forced colours keep selection, focus, menus, pills and icons visible (${kind}, ${scheme})`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active", colorScheme: scheme });
      await openExample(page, scheme === "dark" ? dark : light);
      const [highlight, highlightText, canvasText] = [await systemColor(page, "Highlight"), await systemColor(page, "HighlightText"), await systemColor(page, "CanvasText")];
      const rows = page.locator(".cx-row[data-cx-id]");
      const id = await rows.nth(1).getAttribute("data-cx-id");
      await page.evaluate(id => document.querySelector("[data-canopyx-host]").canopyx.setSelection([id]), id);
      await rows.nth(1).focus();
      await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
      // The selected row takes Highlight with HighlightText, and its contents follow, so no text lands on Highlight in another colour.
      const selected = await rows.nth(1).evaluate(row => {
        const style = getComputedStyle(row);
        const texts = [...row.querySelectorAll("*")].filter(element => element.childNodes.length && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()))
          .map(element => getComputedStyle(element).color);
        return { background: style.backgroundColor, color: style.color, texts: [...new Set(texts)] };
      });
      expect(selected.background).toBe(highlight);
      expect(selected.color).toBe(highlightText);
      expect(selected.texts).toEqual([highlightText]);
      // Keyboard focus is a solid outline on another row, and on the selected row it is drawn in HighlightText.
      await page.keyboard.press("ArrowDown");
      const focused = page.locator(".cx-row:focus");
      const ring = await focused.evaluate(row => ({ style: getComputedStyle(row).outlineStyle, width: parseFloat(getComputedStyle(row).outlineWidth), selected: row.getAttribute("aria-selected") }));
      expect(ring.style).toBe("solid");
      expect(ring.width).toBeGreaterThanOrEqual(2);
      await page.keyboard.press("ArrowUp");
      expect(await page.locator(".cx-row:focus").evaluate(row => getComputedStyle(row).outlineColor)).toBe(highlightText);
      // Icons draw in the text colour.
      const icon = page.locator(".cx-toolbar .cx-ico").first();
      if (await icon.count()) expect(await icon.evaluate(svg => getComputedStyle(svg).stroke === "none" ? getComputedStyle(svg).color : getComputedStyle(svg).color)).not.toBe("rgba(0, 0, 0, 0)");
      // Pills and badges keep an outline once their fill is gone.
      const pill = page.locator(".cx-row:not([aria-selected='true']) :is(.p-pill,.cx-badge)").first();
      if (await pill.count()) expect(await pill.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
      // The Columns menu has an edge, and a menu item that has focus shows an outline.
      const panel = await openColumns(page, kind === "tree");
      await expect(panel).toBeVisible();
      const edge = await panel.evaluate(element => getComputedStyle(element).borderTopStyle + " " + getComputedStyle(element).borderTopWidth);
      expect(edge).toMatch(/^solid [1-9]/);
      const item = panel.locator("button").last();
      await item.focus();
      await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
      expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe("none");
      expect(canvasText).not.toBe(highlight);
    });
  }

  test(`forced colours keep the record drawer's edge, controls and status dots visible (${scheme})`, async ({ page, browserName }) => {
    await page.emulateMedia({ forcedColors: "active", colorScheme: scheme });
    await openExample(page, scheme === "dark" ? "rich-grid-dark.html" : "rich-grid.html");
    const dot = page.locator(".cx-row[data-cx-id]:not([aria-selected='true']) .p-dot").first();
    if (await dot.count()) expect(await dot.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await systemColor(page, "CanvasText"));
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.openDetails(document.querySelector(".cx-row[data-cx-id]").getAttribute("data-cx-id")));
    const drawer = page.locator(".cx-drawer");
    await expect(drawer).toBeVisible();
    const edge = await drawer.evaluate(element => { const style = getComputedStyle(element); return [style.borderLeftStyle, style.borderTopStyle, style.outlineStyle]; });
    expect(edge.some(style => style === "solid")).toBe(true);
    // Focus rings follow the keyboard (focus-visible): Tab to the close button, as a keyboard reader does, in every engine.
    const close = drawer.getByRole("button", { name: /close/i });
    const tab = process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab";
    for (let step = 0; step < 8 && !(await close.evaluate(button => button === document.activeElement)); step++) await page.keyboard.press(tab);
    await expect(close).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe("none");
  });
}

test("reduced motion stops transitions and animations in views, menus and drawers", async ({ page }) => {
  await openExample(page, "inline.html");
  const duration = () => page.locator(".cx-exp:not(.cx-leaf)").first().evaluate(element => getComputedStyle(element, "::before").transitionDuration);
  expect(await duration()).not.toBe("0s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await duration()).toBe("0s");
  await page.getByText("Columns", { exact: true }).click();
  for (const name of ["inline.html", "rich-grid.html", "reporting-grid.html"]) {
    if (name !== "inline.html") await openExample(page, name);
    if (name !== "inline.html") await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.openDetails(document.querySelector(".cx-row[data-cx-id]").getAttribute("data-cx-id")));
    const moving = await page.evaluate(() => [...document.querySelectorAll(".cx-host, .cx-host *, .cx-grid-overlay, .cx-grid-overlay *")].flatMap(element =>
      [null, "::before", "::after"].map(pseudo => getComputedStyle(element, pseudo)).filter(style =>
        style.animationName !== "none" || style.transitionDuration.split(",").some(value => parseFloat(value) > 0))
        .map(() => element.className.toString().slice(0, 40))));
    expect(moving, name).toEqual([]);
  }
});

for (const [width, height, zoom] of [[640, 512, "200%"], [320, 256, "400%"]]) {
  for (const [kind, name] of [["tree", "inline.html"], ["grid", "rich-grid.html"], ["reporting", "reporting-grid.html"], ["bundle", "bundle/index.html"]]) {
    test(`reflow at ${zoom} keeps the toolbar and the Columns menu usable without sideways scrolling (${kind})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openExample(page, name);
      const layout = await page.evaluate(() => ({ page: document.scrollingElement.scrollWidth - innerWidth,
        outside: [...document.querySelectorAll(".cx-toolbar :is(button,summary,input,select)")].filter(element => {
          const box = element.getBoundingClientRect();
          return box.width && getComputedStyle(element).visibility !== "hidden" && (box.left < -1 || box.right > innerWidth + 1);
        }).map(element => element.textContent.trim() || element.className) }));
      expect(layout).toEqual({ page: 0, outside: [] });
      const panel = await openColumns(page, kind === "tree" || kind === "bundle");
      await expect(panel).toBeVisible();
      const unreachable = await panel.evaluate(element => {
        const box = element.getBoundingClientRect(), out = [];
        if (box.left < -1 || box.right > innerWidth + 1) out.push("panel " + Math.round(box.left) + ".." + Math.round(box.right));
        for (const control of element.querySelectorAll("button,input,select,summary,[role=menuitem]")) {
          control.scrollIntoView({ block: "nearest" });
          const rect = control.getBoundingClientRect();
          if (!rect.width) continue;
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!(hit === control || control.contains(hit) || hit?.closest("label")?.contains(control))) out.push((control.textContent || control.type).trim().slice(0, 24));
        }
        return out;
      });
      expect(unreachable).toEqual([]);
    });
  }

  test(`reflow at ${zoom} keeps the record drawer readable and closable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openExample(page, "rich-grid.html");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.openDetails(document.querySelector(".cx-row[data-cx-id]").getAttribute("data-cx-id")));
    const drawer = page.locator(".cx-drawer");
    await expect(drawer).toBeVisible();
    await settleOverlayMotion(drawer);
    const box = await drawer.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)).toBe(0);
    await drawer.getByRole("button", { name: /close/i }).click();
    await expect(drawer).toBeHidden();
  });
}

/**
 * Visible pointer targets in views that are smaller than 24 x 24 CSS pixels and meet neither exception that applies here:
 * a hit area of 24 x 24 around the control's centre (a pseudo element or the label that activates it), or spacing (a 24
 * pixel circle on the control's centre meets no other target, and no undersized target's circle).
 */
const undersizedTargets = page => page.evaluate(() => {
  const selector = "button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=checkbox],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=switch],[role=tab],.cx-exp:not(.cx-leaf)";
  const targets = [...document.querySelectorAll(selector)].filter(element => {
    if (!element.closest("[data-canopyx-host],.cx-grid-overlay,.cx-drawer")) return false;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  }).map(element => ({ element, box: element.getBoundingClientRect() }));
  const centre = box => [box.left + box.width / 2, box.top + box.height / 2];
  const owns = (element, hit) => !!hit && (hit === element || element.contains(hit) || !!element.labels && [...element.labels].some(label => label.contains(hit)));
  // A control another element covers at its centre (a row scrolled under a sticky header or the pager) is not a target where
  // it is now; one that another target of its own row, header row or toolbar covers is a failure, since that target takes its clicks.
  const group = element => element.closest(".cx-row,.cx-hrow,.cx-toolbar");
  const failures = [];
  const live = targets.filter(target => {
    const hit = document.elementFromPoint(...centre(target.box));
    if (owns(target.element, hit)) return true;
    const cover = targets.find(other => other !== target && owns(other.element, hit) && !other.element.contains(target.element) && group(other.element) && group(other.element) === group(target.element));
    if (cover) failures.push(target.element.tagName.toLowerCase() + "." + [...target.element.classList].join(".") + " covered by " + cover.element.className);
    return false;
  });
  // The target's area: its box, or the 24 x 24 square on its centre when a hit area (a pseudo element or a label) covers it.
  for (const target of live) {
    const [x, y] = centre(target.box), square = [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5], [0, -11.5], [0, 11.5], [-11.5, 0], [11.5, 0]];
    target.small = (target.box.width < 24 || target.box.height < 24) && !square.every(([dx, dy]) => owns(target.element, document.elementFromPoint(x + dx, y + dy)));
    target.area = target.small || target.box.width >= 24 && target.box.height >= 24 ? target.box :
      { left: Math.min(target.box.left, x - 12), right: Math.max(target.box.right, x + 12), top: Math.min(target.box.top, y - 12), bottom: Math.max(target.box.bottom, y + 12) };
  }
  for (const target of live.filter(item => item.small)) {
    const [x, y] = centre(target.box);
    const meets = live.some(other => {
      if (other === target || other.element.contains(target.element) || target.element.contains(other.element)) return false;
      const nearestX = Math.max(other.area.left, Math.min(x, other.area.right)), nearestY = Math.max(other.area.top, Math.min(y, other.area.bottom));
      if (Math.hypot(nearestX - x, nearestY - y) < 12) return true;
      if (!other.small) return false;
      const [ox, oy] = centre(other.box);
      return Math.hypot(ox - x, oy - y) < 24;
    });
    if (meets) failures.push(target.element.tagName.toLowerCase() + "." + [...target.element.classList].join(".") + " " + Math.round(target.box.width) + "x" + Math.round(target.box.height));
  }
  return [...new Set(failures)];
});

const TARGET_PAGES = ["inline.html", "rich-grid.html", "reporting-grid.html", "tree-parity.html", "interactions.html", "checkboxes.html", "plugins.html", "graphite-grid.html", "bundle/index.html"];
for (const phone of [false, true]) {
  test(`pointer targets are at least 24 x 24 CSS pixels or spaced (${phone ? "phone" : "desktop"})`, async ({ browser }) => {
    const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const report = {};
    for (const name of TARGET_PAGES) {
      await openExample(page, name);
      const failures = await undersizedTargets(page);
      if (failures.length) report[name] = failures;
    }
    await context.close();
    expect(report).toEqual({});
  });
}

test("phone toolbars, pagers and header menus use 44 pixel targets", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  for (const name of ["rich-grid.html", "reporting-grid.html", "inline.html"]) {
    await openExample(page, name);
    await nextFrames(page);
    const short = await page.evaluate(() => [...document.querySelectorAll(".cx-toolbar :is(button,summary):not(.cx-search *), .cx-grid-pager .cx-button, .cx-hcell :is(.cx-grid-column-menu,.cx-grid-header-filter)")]
      .filter(element => element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== "hidden")
      .filter(element => element.getBoundingClientRect().height < 44).map(element => (element.textContent.trim() || element.className).slice(0, 30)));
    expect(short, name).toEqual([]);
  }
  // The record drawer's buttons on a phone.
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.openDetails(document.querySelector(".cx-row[data-cx-id]").getAttribute("data-cx-id")));
  await expect(page.locator(".cx-drawer")).toBeVisible();
  expect(await page.locator(".cx-drawer button").evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().width > 0)
    .map(button => [Math.round(button.getBoundingClientRect().width), Math.round(button.getBoundingClientRect().height)]).filter(([width, height]) => width < 44 || height < 44))).toEqual([]);
  await context.close();
});

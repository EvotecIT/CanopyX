// Toolbar search focus, pager field widths and status-bar counts follow the Graphite spec in both themes.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames } from "./support.mjs";

const view = {
  protocol: "canopyx/2", type: "grid", id: "chrome", label: "Servers", noun: "servers", pageSize: 10, selection: "multiple", search: true, statusBar: true,
  presentation: "paged", pageLength: 10, source: { kind: "inline" },
  columns: [
    { id: "name", title: "Name", kind: "text", width: 200, sortable: true },
    { id: "state", title: "State", kind: "text", width: 120 },
    { id: "amount", title: "Amount", kind: "number", width: 120 }
  ],
  rows: Array.from({ length: 40 }, (_, i) => ({ id: "r" + i, cells: { name: "server-" + String(i).padStart(2, "0"), state: i % 3 ? "Pass" : "Fail", amount: i } }))
};

async function open(page, theme, width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  const html = viewPage(view).replace('data-cx-theme="light"', 'data-cx-theme="' + theme + '"');
  await page.route("http://canopyx.test/chrome", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/chrome");
  await page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.ready);
  await nextFrames(page);
}
async function capture(page, locator, name) {
  if (process.env.CANOPYX_EVIDENCE) await locator.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") });
}
/** The colour a token resolves to inside the grid host, for comparing with computed colours. */
function token(page, name) {
  return page.locator("[data-canopyx-host]").evaluate((host, variable) => {
    const probe = document.createElement("span"); probe.style.color = "var(" + variable + ")"; host.appendChild(probe);
    const color = getComputedStyle(probe).color; probe.remove(); return color;
  }, name);
}
/** Focus indicators drawn on an element: a visible outline and each box-shadow layer. */
function rings(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 ? 1 : 0) + (style.boxShadow === "none" ? 0 : style.boxShadow.split(/,(?![^(]*\))/).length);
  });
}

for (const theme of ["light", "dark"]) {
  test("the focused toolbar search shows one ring and other controls keep theirs (" + theme + ")", async ({ page }) => {
    await open(page, theme);
    const search = page.locator(".cx-data-grid .cx-search"), input = search.locator(".cx-search-input");
    await page.locator(".cx-grid").focus();
    await page.keyboard.press("/");
    await expect(input).toBeFocused();
    expect(await input.evaluate(element => element.matches(":focus-visible"))).toBe(true);
    expect(await rings(input)).toBe(0);
    expect(await rings(search)).toBe(1);
    await capture(page, page.locator(".cx-data-grid .cx-toolbar"), "toolbar-search-focused-" + theme);
    await page.keyboard.press("Tab");
    const next = page.locator(":focus");
    expect(await next.evaluate(element => element.matches(":focus-visible") && element.closest(".cx-toolbar") !== null)).toBe(true);
    expect(await rings(next)).toBeGreaterThanOrEqual(1);
  });

  test("pager fields use the spec widths (" + theme + ")", async ({ page }) => {
    await open(page, theme);
    const box = locator => locator.evaluate(element => { const rect = element.getBoundingClientRect(); return { width: Math.round(rect.width), height: Math.round(rect.height) }; });
    expect(await box(page.locator(".cx-grid-pager .pg input"))).toEqual({ width: 52, height: 30 });
    expect(await box(page.locator(".cx-grid-pager .cx-rpp select"))).toEqual({ width: 72, height: 30 });
    expect(await page.locator(".cx-grid-pager .pg input").evaluate(element => getComputedStyle(element).textAlign)).toBe("center");
  });

  test("status-bar and page-range counts use the text colour on a muted label (" + theme + ")", async ({ page }) => {
    await open(page, theme);
    await page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.setSelection(["r1", "r2"]));
    await nextFrames(page);
    const text = await token(page, "--cx-text"), muted = await token(page, "--cx-muted");
    expect(text).not.toBe(muted);
    const color = locator => locator.evaluate(element => getComputedStyle(element).color);
    const status = page.locator(".cx-grid-status > span").first();
    await expect(status).toHaveText("40 servers · 2 selected");
    await expect(status.locator("b")).toHaveText(["40", "2"]);
    expect(await color(status)).toBe(muted);
    for (const count of await status.locator("b").all()) expect(await color(count)).toBe(text);
    const range = page.locator(".cx-grid-page-range");
    await expect(range).toHaveText("1–10 of 40 rows");
    await expect(range.locator("b")).toHaveText("1–10");
    expect(await color(range)).toBe(muted);
    expect(await color(range.locator("b"))).toBe(text);
    await capture(page, page.locator(".cx-grid-pager"), "pager-" + theme);
    await capture(page, page.locator(".cx-grid-status"), "status-bar-" + theme);
  });

  test("the pager fits a 390 px phone with the spec page field (" + theme + ")", async ({ page }) => {
    await open(page, theme, 390);
    await expect(page.locator(".cx-data-grid")).toHaveClass(/cx-phone/);
    const pager = page.locator(".cx-grid-pager");
    const fit = await pager.evaluate(element => {
      const outer = element.getBoundingClientRect();
      const visible = [...element.querySelectorAll("button,input,select")].filter(item => item.offsetParent !== null);
      return { overflow: element.scrollWidth - element.clientWidth, inside: visible.every(item => { const rect = item.getBoundingClientRect(); return rect.left >= outer.left - 0.5 && rect.right <= outer.right + 0.5 && rect.right <= innerWidth; }),
        input: Math.round(element.querySelector(".pg input").getBoundingClientRect().width) };
    });
    expect(fit).toEqual({ overflow: 0, inside: true, input: 52 });
    await capture(page, pager, "pager-phone-" + theme);
  });
}

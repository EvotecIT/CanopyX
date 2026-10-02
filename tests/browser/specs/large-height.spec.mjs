import { test, expect } from "@playwright/test";
import { viewPage, nextFrames, openExample } from "./support.mjs";

const count = 20000;
const view = { protocol: "canopyx/2", type: "view", id: "tall-view", label: "Long document",
  rowHeight: 64, pageSize: 10000, selection: "single", columns: [{ id: "name", title: "Section", width: 300 }],
  source: { kind: "inline" }, roots: Array.from({ length: count }, (_, i) => ({ id: "section-" + i, label: "Section " + i,
    detail: { type: "html", html: "<p>Section " + i + "</p>", height: 40 } })) };

async function open(page, documentView = view) {
  await page.route("https://tall.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(documentView) }));
  await page.goto("https://tall.test/"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => { await document.querySelector(".cx-host").canopyx.loadMore(null); });
  await nextFrames(page);
}

test("End reaches the final row beyond the native height range and Home returns", async ({ page }) => {
  await open(page);
  await page.locator('[data-cx-id="section-0"]').focus(); await page.keyboard.press("End"); await nextFrames(page);
  const last = page.locator(`[data-cx-id="section-${count - 1}"]`);
  await expect(last).toBeFocused();
  const geometry = await last.evaluate(row => {
    const grid = row.closest(".cx-grid"), box = grid.getBoundingClientRect(), rect = row.getBoundingClientRect();
    return { rowBottom: rect.bottom, viewportBottom: box.bottom, nativeHeight: grid.scrollHeight,
      logicalRows: grid.getAttribute("aria-rowcount"), index: row.getAttribute("aria-rowindex") };
  });
  expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.viewportBottom + 2);
  expect(geometry.rowBottom).toBeGreaterThan(geometry.viewportBottom - 5);
  expect(geometry.logicalRows).toBe(String(count + 1)); expect(geometry.index).toBe(String(count + 1));
  await page.keyboard.press("Home"); await nextFrames(page); await expect(page.locator('[data-cx-id="section-0"]')).toBeFocused();
  expect(await page.locator(".cx-grid").evaluate(grid => grid.scrollTop)).toBe(0);
});

function controlsView() {
  return { ...view, roots: view.roots.map((node, i) => i === 15000 ? { ...node, detail: { ...node.detail,
    html: '<div style="height:2300px"></div><button type="button">Host action</button>' } } : node) };
}

test("entering a control in a tall scaled detail keeps keyboard focus visible", async ({ page }) => {
  await open(page, controlsView());
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.expandPath(["section-15000"], { select: false }));
  await page.keyboard.press("F2"); await nextFrames(page);
  const button = page.getByRole("button", { name: "Host action", exact: true });
  await expect(button).toBeFocused(); await expect(button).toBeInViewport();
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getState().anchor.path)).toEqual(["section-15000"]);
});

async function showControl(page) {
  await open(page, controlsView());
  return page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    await api.expandPath(["section-15000"], { select: false });
    const state = api.getState(); state.anchor.offset = 2200; await api.setState(state);
    return api.getState().anchor;
  });
}

test("wheel over an ordinary host button uses logical distance and honors its veto", async ({ page }) => {
  const before = await showControl(page); await nextFrames(page);
  const button = page.getByRole("button", { name: "Host action", exact: true }); await expect(button).toBeInViewport();
  const box = await button.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(100); await nextFrames(page);
  const after = await page.evaluate(() => document.querySelector(".cx-host").canopyx.getState().anchor);
  expect(after.path).toEqual(before.path); expect(after.offset - before.offset).toBeCloseTo(120, 0);
  const beforeVeto = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx, state = api.getState();
    state.anchor.offset = 2200; await api.setState(state); return api.getState().anchor;
  }); await nextFrames(page);
  await button.evaluate(element => element.addEventListener("wheel", event => event.preventDefault(), { passive: false }));
  const vetoBox = await button.boundingBox(); await page.mouse.move(vetoBox.x + vetoBox.width / 2, vetoBox.y + vetoBox.height / 2);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(100); await nextFrames(page);
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getState().anchor)).toEqual(beforeVeto);
});

test("touch over an ordinary host button uses logical distance", async ({ page }) => {
  const before = await showControl(page);
  const result = await page.getByRole("button", { name: "Host action", exact: true }).evaluate(button => {
    const touch = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: [{ clientX: 150, clientY: y }] });
      button.dispatchEvent(event); return event.defaultPrevented;
    };
    touch("touchstart", 500); const handled = touch("touchmove", 420); touch("touchend", 420);
    return { handled, anchor: document.querySelector(".cx-host").canopyx.getState().anchor };
  });
  expect(result.handled).toBe(true); expect(result.anchor.path).toEqual(before.path);
  expect(result.anchor.offset - before.offset).toBeCloseTo(80, 0);
});

test("the native scrollbar spans the whole logical view without out-of-range transforms", async ({ page }) => {
  await open(page);
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = grid.scrollHeight; }); await nextFrames(page);
  const last = page.locator(`[data-cx-id="section-${count - 1}"]`); await expect(last).toBeVisible();
  await expect(last).toHaveAttribute("aria-rowindex", String(count + 1));
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = (grid.scrollHeight - grid.clientHeight) / 2; }); await nextFrames(page);
  const middle = await page.locator(".cx-grid").evaluate(grid => {
    const box = grid.getBoundingClientRect(), header = grid.querySelector(".cx-head").getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 50, (header.bottom + box.bottom) / 2)?.closest(".cx-row");
    return hit && Number(hit.getAttribute("aria-rowindex"));
  });
  expect(middle).toBeGreaterThan(count / 2 - 2); expect(middle).toBeLessThan(count / 2 + 3);
});

test("a saved scroll anchor returns to its logical position after a height-range jump", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    await api.expandPath(["section-15000"], { select: false });
    const saved = api.getState(); await api.expandPath(["section-0"], { select: false }); await api.setState(saved);
    return { saved: saved.anchor, restored: api.getState().anchor, focus: api.getState().focus };
  });
  expect(result.saved.path).toEqual(["section-15000"]);
  expect(result.restored.path).toEqual(result.saved.path);
  expect(result.restored.offset).toBeCloseTo(result.saved.offset, 0); expect(result.focus).toEqual(["section-15000"]);
});

test("wheel movement keeps CSS-pixel distance in a scaled view", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx; await api.expandPath(["section-15000"], { select: false });
    return api.getState().anchor;
  });
  const box = await page.locator(".cx-grid").boundingBox(); await page.mouse.move(box.x + 120, box.y + box.height / 2);
  await page.mouse.wheel(0, 120); await nextFrames(page);
  const after = await page.evaluate(() => document.querySelector(".cx-host").canopyx.getState().anchor);
  expect(after.path).toEqual(before.path); expect(after.offset - before.offset).toBeCloseTo(120, 0);
});

test("touch movement keeps CSS-pixel distance and cancelled gestures remain native", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx, grid = document.querySelector(".cx-grid");
    await api.expandPath(["section-15000"], { select: false });
    const before = api.getState().anchor;
    const touch = (type, y, prevented = false) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: [{ clientX: 150, clientY: y }] });
      if (prevented) event.preventDefault(); grid.dispatchEvent(event); return event.defaultPrevented;
    };
    touch("touchstart", 500); const handled = touch("touchmove", 420); const after = api.getState().anchor;
    touch("touchend", 420); touch("touchstart", 500, true); touch("touchmove", 400); const cancelled = api.getState().anchor;
    return { before, after, cancelled, handled };
  });
  expect(result.handled).toBe(true); expect(result.after.path).toEqual(result.before.path);
  expect(result.after.offset - result.before.offset).toBeCloseTo(80, 0); expect(result.cancelled).toEqual(result.after);
});

test("a view shrinking below the native range removes scaled input handling", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    api.setFilter(node => Number(node.id.slice(8)) < 10);
  });
  await nextFrames(page);
  const before = await page.locator(".cx-grid").evaluate(grid => grid.scrollTop);
  const box = await page.locator(".cx-grid").boundingBox(); await page.mouse.move(box.x + 120, box.y + box.height / 2);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(100); await nextFrames(page);
  const after = await page.locator(".cx-grid").evaluate(grid => grid.scrollTop);
  expect(after - before).toBeCloseTo(120, 0);
  await expect(page.getByRole("treegrid")).toHaveAttribute("aria-rowcount", "11");
});

test("the generated long document returns to its saved final section", async ({ page }) => {
  await openExample(page, "long-document.html");
  await expect(page.locator("#document-status")).toHaveText("20,000 sections loaded.");
  await page.getByRole("button", { name: "Last section", exact: true }).click();
  await expect(page.getByText("End of section 19999", { exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Save position", exact: true }).click();
  await page.getByRole("button", { name: "First section", exact: true }).click();
  await expect(page.getByText("Start of section 0", { exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Restore position", exact: true }).click();
  await expect(page.getByText("End of section 19999", { exact: true })).toBeInViewport();
  await expect(page.locator("#document-status")).toHaveText("Position restored.");
});

test("a nested host scroller consumes the wheel before the scaled view", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    api.view.roots[15000].detail.html = '<div class="inner-scroll" style="height:200px;width:200px;overflow:auto"><div style="height:2000px">Host content</div></div>';
    api.refresh(); await api.expandPath(["section-15000"], { select: false });
    const state = api.getState(); state.anchor.offset = 0; await api.setState(state); return api.getState().anchor;
  }); await nextFrames(page);
  const inner = page.locator(".inner-scroll"); await expect(inner).toBeInViewport();
  const box = await inner.boundingBox(); await page.mouse.move(box.x + 50, box.y + 70); await page.mouse.wheel(0, 120);
  await expect.poll(() => inner.evaluate(element => element.scrollTop)).toBeCloseTo(120, 0);
  const after = await page.evaluate(() => document.querySelector(".cx-host").canopyx.getState().anchor);
  expect(after).toEqual(before);
});

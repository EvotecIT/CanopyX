import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { exampleUrl } from "./support.mjs";

async function openPath(page, options = {}) {
  await page.goto(exampleUrl(options.dark ? "path-dark.html" : "path.html"));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
  await page.evaluate(async options => {
    const host = document.querySelector("[data-canopyx-host]"), original = host.canopyx;
    await original.ready;
    if (!options.custom) { window.pathApi = original; return; }
    const view = JSON.parse(JSON.stringify(original.view)); original.destroy(); host.replaceChildren();
    delete view.stateKey; view.id = "path-test"; view.pageSize = 10;
    view.rows = Array.from({ length: 800 }, (_, index) => ({ id: "r" + index,
      cells: { title: "Step " + index, team: "Review group", note: "Record details " + index } }));
    view.path = { chains: [{ id: "approval", label: "Approval route", hops: [
      { record: "r0", label: "Start" },
      { record: "r799", label: "Receiving team", flags: ["foreign"], badges: [{ text: "Review", tone: "info" }] },
      { record: "r0", label: "Return", flags: ["cycle", "disabled"] }
    ] }] };
    if (options.empty) view.path.chains = [];
    if (options.hops) view.path.chains[0].hops = Array.from({ length: options.hops }, () => ({ record: "r0" }));
    window.pathErrors = [];
    host.addEventListener("canopyx:error", event => window.pathErrors.push(event.detail.error.message));
    window.pathApi = CanopyX.createDataGrid(host, { view }); await window.pathApi.ready;
  }, options);
}

test("path follows explicit occurrence order and opens out-of-cache records from keyboard", async ({ page, browserName }) => {
  await openPath(page, { custom: true });
  const buttons = page.locator(".cx-path-title");
  await expect(buttons).toHaveCount(3);
  expect(await buttons.evaluateAll(nodes => nodes.map(node => node.dataset.cxPathRecord))).toEqual(["r0", "r799", "r0"]);
  expect(await page.evaluate(() => window.pathApi.getLoadedRows(["r799"]))).toEqual([]);
  await buttons.first().focus(); await page.keyboard.press("ArrowRight");
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Record details 799");
  await page.keyboard.press("Escape"); await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("End"); await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toContainText("Record details 0");
  await page.keyboard.press("Escape"); await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Home"); await expect(buttons.first()).toBeFocused();
  const tab = process.platform === "darwin" && browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(tab); await expect(buttons.nth(1)).toBeFocused();
  expect(await page.evaluate(() => window.pathErrors)).toEqual([]);
});

test("path annotations are text tokens and disabled occurrences remain readable", async ({ page }) => {
  await openPath(page, { custom: true });
  const last = page.locator(".cx-path-hop").last();
  await expect(last.locator('[data-cx-path-flag="cycle"]')).toHaveText("Cycle");
  await expect(last.locator('[data-cx-path-flag="disabled"]')).toHaveText("Disabled");
  await expect(last.getByRole("button")).toBeEnabled();
  await last.getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("Record details 0");
  expect(await page.evaluate(() => window.pathApi.view.rows[0].cells.title)).toBe("Step 0");
});

test("path print materialises every bounded step without a beforeprint event", async ({ page }) => {
  await openPath(page, { custom: true, hops: 256 });
  await expect(page.locator(".cx-path-hop")).toHaveCount(256);
  await page.evaluate(() => { window.pathPrintEvents = 0; window.addEventListener("beforeprint", () => window.pathPrintEvents++); });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cx-path-hop")).toHaveCount(256);
  expect(await page.locator(".cx-path").evaluate(node => getComputedStyle(node).overflow)).toBe("visible");
  expect(await page.locator(".cx-path-hops").evaluate(node => getComputedStyle(node).display)).toBe("block");
  expect(await page.locator(".cx-path-hop").last().evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) return false;
    }
    return true;
  })).toBe(true);
  expect(await page.evaluate(() => window.pathPrintEvents)).toBe(0);
});

test("path empty state is readable and destroy releases its frame and host class", async ({ page }) => {
  await openPath(page, { custom: true, empty: true });
  await expect(page.locator(".cx-path-empty")).toHaveText("No paths to show");
  await expect(page.locator(".cx-path-title")).toHaveCount(0);
  await page.evaluate(async () => {
    const api = window.pathApi, host = api.element, view = JSON.parse(JSON.stringify(api.view));
    api.destroy(); host.replaceChildren(); delete view.path;
    window.pathApi = CanopyX.createDataGrid(host, { view }); await window.pathApi.ready;
  });
  await expect(page.locator(".cx-path")).toHaveCount(0);
  await expect(page.locator(".cx-path-host")).toHaveCount(0);
  await expect(page.locator(".cx-grid")).toBeVisible();
});

for (const sample of [{ width: 1440, height: 1000, dark: false }, { width: 390, height: 844, dark: true }]) {
  test("path wraps and remains keyboard accessible at " + sample.width + (sample.dark ? " dark" : " light"), async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: sample.width, height: sample.height }); await openPath(page, sample);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".cx-path-chain")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const hops = page.locator(".cx-path-hops").first();
    expect(await hops.evaluate(node => getComputedStyle(node).flexDirection)).toBe(sample.width < 640 ? "column" : "row");
    const arrow = await page.locator(".cx-path-hop + .cx-path-hop").first().evaluate(node => {
      const shaft = getComputedStyle(node, "::before"), head = getComputedStyle(node, "::after");
      return { width:parseFloat(shaft.width), height:parseFloat(shaft.height), head:head.borderInlineEndStyle };
    });
    expect(sample.width < 640 ? arrow.height > arrow.width : arrow.width > arrow.height).toBe(true);
    expect(arrow.head).toBe("solid");
    const long = page.getByRole("button", { name: "Review the implementation and the proposed recovery procedure", exact: true }).first();
    expect(await long.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && getComputedStyle(node).whiteSpace === "normal")).toBe(true);
    await long.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Record the review before scheduling the change.");
    await page.keyboard.press("Escape"); await expect(long).toBeFocused();
    const results = await new AxeBuilder({ page }).include(".cx-path").analyze();
    expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact)).map(item => item.id)).toEqual([]);
    expect(errors).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) {
      if (!process.env.CANOPYX_FRAME_BASE_URL) throw new Error("Visual captures need the owned loopback preview URL.");
      await page.goto(process.env.CANOPYX_FRAME_BASE_URL.replace(/\/$/, "") + "/path" + (sample.dark ? "-dark" : "") + ".html");
      await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
      await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
      await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "path-" + sample.width + (sample.dark ? "-dark" : "-light") + ".png"), fullPage: true });
    }
  });
}

for (const invalid of ["missing record", "unknown column", "unknown setting", "unknown step field", "ordinal", "hosted", "duplicate chain", "empty chain", "chain bound", "hop bound", "total bound", "unknown flag", "duplicate flag", "badge text", "badge tone", "malformed label"]) {
  test("raw path rejects " + invalid, async ({ page }) => {
    await openPath(page);
    const error = await page.evaluate(async kind => {
      const view = JSON.parse(JSON.stringify(window.pathApi.view)), chain = view.path.chains[0], hop = chain.hops[0];
      if (kind === "missing record") hop.record = "absent";
      if (kind === "unknown column") view.path.titleColumn = "absent";
      if (kind === "unknown setting") view.path.chain = [];
      if (kind === "unknown step field") hop.annotation = "cycle";
      if (kind === "ordinal") view.rowIdentity = "ordinal";
      if (kind === "hosted") { view.source = { kind: "host", navigation: "offset" }; delete view.rows; }
      if (kind === "duplicate chain") view.path.chains.push(structuredClone(chain));
      if (kind === "empty chain") chain.hops = [];
      if (kind === "chain bound") view.path.chains = Array.from({ length: 201 }, (_, index) => ({ ...chain, id: "c" + index }));
      if (kind === "hop bound") chain.hops = Array.from({ length: 257 }, () => hop);
      if (kind === "total bound") view.path.chains = Array.from({ length: 40 }, (_, index) => ({ ...chain, id: "c" + index, hops: Array.from({ length: index ? 250 : 251 }, () => hop) }));
      if (kind === "unknown flag") hop.flags = ["unknown"];
      if (kind === "duplicate flag") hop.flags = ["cycle", "cycle"];
      if (kind === "badge text") hop.badges = [{ text: "x".repeat(257) }];
      if (kind === "badge tone") hop.badges = [{ text: "Badge", tone: "invalid tone" }];
      if (kind === "malformed label") hop.label = "broken\ud800";
      const host = document.createElement("div"); document.body.appendChild(host); let api;
      const options = { view };
      if (kind === "hosted") options.source = { query() { throw new Error("A path must reject a hosted source before querying."); } };
      try { api = CanopyX.createDataGrid(host, options); await api.ready; return null; }
      catch (error) { return error.message; }
      finally { api?.destroy(); host.remove(); }
    }, invalid);
    expect(error).toMatch(/path/i);
  });
}

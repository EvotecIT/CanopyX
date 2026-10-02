import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "selection", label: "Records", selection: "multiple", deepLink: true,
  source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300 }],
  roots: [{ id: "parent", label: "Parent", children: [{ id: "child", label: "Child" }] },
    { id: "locked", label: "Locked" }, { id: "tail", label: "Tail" }] };

async function open(page, selection = "multiple") {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, selection }) }));
  await page.goto("https://canopyx.test/#other=keep"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
    window.selectionEvents = []; window.selectionPolicy = () => true;
    window.api = CanopyX.createTreeGrid(host, { view: data, isSelectable: node => node.id !== "locked",
      beforeSelect: (node, nodes, context) => window.selectionPolicy(node, nodes, context),
      onSelect: (node, nodes) => window.selectionEvents.push({ node: node && node.id, nodes: nodes.map(n => n.id) }) });
    await window.api.ready;
  });
  await nextFrames(page);
}

test("programmatic selection is distinct from focus and clear updates events, ARIA, and only the grid's hash", async ({ page }) => {
  await open(page); await page.locator('[data-cx-id="parent"]').focus();
  expect(await page.evaluate(() => window.api.setSelection(["tail", "parent", "tail"]))).toBe(true);
  await expect(page.locator('[data-cx-id="tail"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-cx-id="parent"]')).toBeFocused();
  expect(await page.evaluate(() => window.api.getSelected().map(n => n.id))).toEqual(["tail", "parent"]);
  expect(await page.evaluate(() => window.api.clearSelection())).toBe(true);
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.selectionEvents)).toEqual([
    { node: "parent", nodes: ["tail", "parent"] }, { node: null, nodes: [] }
  ]);
  expect(await page.evaluate(() => location.hash)).toBe("#other=keep");
});

test("invalid or unloaded ids reject an entire selection before changing it", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.api.setSelection(["parent"]);
    const errors = [];
    for (const ids of [["tail", "missing"], ["tail", ""], "tail"]) {
      try { window.api.setSelection(ids); } catch (error) { errors.push(error.message); }
    }
    return { errors: errors.length, ids: window.api.getSelected().map(n => n.id), events: window.selectionEvents.length };
  });
  expect(result).toEqual({ errors: 3, ids: ["parent"], events: 1 });
});

test("single selection rejects overflow and select-all without losing its existing node", async ({ page }) => {
  await open(page, "single");
  const result = await page.evaluate(() => {
    window.api.setSelection(["parent", "parent"]);
    let errors = 0;
    try { window.api.setSelection(["parent", "tail"]); } catch { errors++; }
    try { window.api.selectAll({ scope: "visible" }); } catch { errors++; }
    return { errors, ids: window.api.getSelected().map(n => n.id) };
  });
  expect(result).toEqual({ errors: 2, ids: ["parent"] });
});

for (const action of ["pointer", "keyboard", "api"]) {
  test(`selectability governs ${action} additions while locked rows remain focusable`, async ({ page }) => {
    await open(page);
    if (action === "pointer") await page.locator('[data-cx-id="locked"]').click();
    else if (action === "keyboard") { await page.locator('[data-cx-id="locked"]').focus(); await page.keyboard.press("Space"); }
    else expect(await page.evaluate(() => window.api.setSelection(["locked", "tail"]))).toBe(false);
    expect(await page.evaluate(() => window.api.getSelected())).toEqual([]);
    expect(await page.evaluate(() => window.selectionEvents)).toEqual([]);
    if (action !== "api") await expect(page.locator('[data-cx-id="locked"]')).toBeFocused();
  });
}

test("select-all requires an explicit scope and distinguishes collapsed loaded children from visible rows", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.api.selectAll({ scope: "visible" }); const visible = window.api.getSelected().map(n => n.id);
    window.api.selectAll({ scope: "loaded" }); const loaded = window.api.getSelected().map(n => n.id);
    let rejected = false;
    try { window.api.selectAll(); } catch { rejected = true; }
    return { visible, loaded, rejected, after: window.api.getSelected().map(n => n.id) };
  });
  expect(result.visible).toEqual(["parent", "tail"]);
  expect([...result.loaded].sort()).toEqual(["child", "parent", "tail"]);
  expect(result.rejected).toBe(true); expect(result.after).toEqual(result.loaded);
});

test("select-all never fetches unloaded lazy descendants", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = window.api.view; window.api.destroy();
    let loads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
      loads++; return { items: [{ id: "lazy", label: "Lazy", hasChildren: true, childCount: 1000000 }] };
    } } }); await api.ready;
    api.selectAll({ scope: "loaded" }); return { loads, selected: api.getSelected().map(n => n.id) };
  });
  expect(result).toEqual({ loads: 1, selected: ["lazy"] });
});

test("range selection skips ineligible rows and respects a veto of the entire range", async ({ page }) => {
  await open(page); await page.locator('[data-cx-id="parent"]').click();
  await page.locator('[data-cx-id="tail"]').click({ modifiers: ["Shift"] });
  expect(await page.evaluate(() => window.api.getSelected().map(n => n.id))).toEqual(["parent", "tail"]);
  await page.evaluate(() => { window.api.setSelection(["parent"]); window.selectionPolicy = (node, nodes, context) => context.reason !== "range"; });
  await page.locator('[data-cx-id="tail"]').click({ modifiers: ["Shift"] });
  expect(await page.evaluate(() => window.api.getSelected().map(n => n.id))).toEqual(["parent"]);
});

test("cancelable beforeselect reports the complete proposal and preserves selection, hash, and notifications on veto", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.api.setSelection(["parent"]); const hash = location.hash;
    let proposal;
    window.api.element.addEventListener("canopyx:beforeselect", event => {
      proposal = { node: event.detail.node.id, nodes: event.detail.nodes.map(n => n.id),
        previous: event.detail.previous.map(n => n.id), reason: event.detail.reason };
      event.preventDefault();
    }, { once: true });
    const accepted = window.api.setSelection(["tail"]);
    return { accepted, proposal, ids: window.api.getSelected().map(n => n.id), sameHash: hash === location.hash, events: window.selectionEvents.length };
  });
  expect(result).toEqual({ accepted: false, proposal: { node: "tail", nodes: ["tail"], previous: ["parent"], reason: "api" },
    ids: ["parent"], sameHash: true, events: 1 });
});

test("a nested host selection wins over its older proposal", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.selectionPolicy = node => {
      if (node && node.id === "parent") window.api.setSelection(["tail"]);
      return true;
    };
    return { accepted: window.api.setSelection(["parent"]), ids: window.api.getSelected().map(n => n.id) };
  });
  expect(result).toEqual({ accepted: false, ids: ["tail"] });
});

test("throwing and asynchronous veto hooks cannot partially apply selection", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    window.api.setSelection(["parent"]); let errors = 0;
    for (const policy of [() => { throw new Error("Host failure"); }, async () => false]) {
      window.selectionPolicy = policy;
      try { window.api.setSelection(["tail"]); } catch { errors++; }
    }
    return { errors, ids: window.api.getSelected().map(n => n.id), events: window.selectionEvents.length };
  });
  expect(result).toEqual({ errors: 2, ids: ["parent"], events: 1 });
});

test("a vetoed Enter can expand its row without announcing selection", async ({ page }) => {
  await open(page); await page.evaluate(() => { window.selectionPolicy = () => false; });
  await page.locator('[data-cx-id="parent"]').focus(); await page.keyboard.press("Enter");
  await expect(page.locator('[data-cx-id="child"]')).toBeVisible();
  expect(await page.evaluate(() => window.selectionEvents)).toEqual([]);
});

for (const operation of ["all", "range"]) test("a nested eligibility selection wins over " + operation, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async operation => {
    const host = api.element, data = api.view; api.destroy();
    let nested = false, armed = false;
    window.api = CanopyX.createTreeGrid(host, { view: data, isSelectable: node => {
      if (armed && !nested && node.id === "parent") { nested = true; api.setSelection(["tail"]); }
      return true;
    } });
    await api.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (operation === "range") api.setSelection(["parent"]);
    armed = true;
    if (operation === "all") api.selectAll({ scope: "visible" });
    else document.querySelector('[data-cx-id="tail"]').dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    return api.getSelected().map(n => n.id);
  }, operation);
  expect(result).toEqual(["tail"]);
});

for (const asynchronous of [false, true]) test("Enter expansion survives a " + (asynchronous ? "asynchronous" : "throwing") + " veto", async ({ page }) => {
  await open(page); const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(asynchronous => { window.selectionPolicy = asynchronous ? async () => false : () => { throw new Error("Host failure"); }; }, asynchronous);
  await page.locator('[data-cx-id="parent"]').focus(); await page.keyboard.press("Enter");
  await expect(page.locator('[data-cx-id="child"]')).toBeVisible();
  expect(await page.evaluate(() => window.selectionEvents)).toEqual([]);
  expect(errors.some(error => error.includes(asynchronous ? "synchronously" : "Host failure"))).toBe(true);
});

test("a nested link selection owns the final URL and notification", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = api.element, data = api.view; api.destroy(); const events = [];
    window.api = CanopyX.createTreeGrid(host, { view: data, parseLink: () => null,
      formatLink: (path, node) => { if (node && node.id === "parent") api.setSelection(["tail"]); return path.join("/"); },
      onSelect: node => events.push(node && node.id) });
    await api.ready; api.setSelection(["parent"]);
    return { ids: api.getSelected().map(n => n.id), hash: location.hash, events };
  });
  expect(result).toEqual({ ids: ["tail"], hash: "#tail", events: ["tail"] });
});

test("a selection event's nested selection supersedes the older callback", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    api.element.addEventListener("canopyx:select", () => api.setSelection(["tail"]), { once: true });
    const accepted = api.setSelection(["parent"]);
    return { accepted, ids: api.getSelected().map(n => n.id), events: selectionEvents };
  });
  expect(result).toEqual({ accepted: false, ids: ["tail"], events: [{ node: "tail", nodes: ["tail"] }] });
});

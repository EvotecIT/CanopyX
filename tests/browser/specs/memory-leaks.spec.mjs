// Mounting and destroying views must not leak: after 200 mount, use and destroy cycles of a grid and of a tree, the
// heap, the live DOM nodes, the detached DOM nodes and the event listeners return to their baseline within a tolerance.
// The counters come from the Chromium DevTools protocol, so this runs in Chromium only.
import { expect, test } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

const CYCLES = 200, WARMUP = 10;
// Tolerances for the whole run, not per cycle: one node or listener left behind per cycle would exceed them.
const LIMITS = { nodes: 60, listeners: 10, detached: 20, heapBytes: 1.5 * 1024 * 1024 };

const rows = Array.from({ length: 400 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + String(i).padStart(3, "0"),
  state: ["Pass", "Fail", "Warning"][i % 3], owner: "Team " + (i % 7), amount: (i * 37) % 1000, note: "Record " + i + " note" } }));
const grid = { protocol: "canopyx/2", type: "grid", id: "leak-grid", label: "Servers", pageSize: 100, selection: "multiple", search: true,
  source: { kind: "inline" }, reporting: {}, columns: [
    { id: "name", title: "Name", kind: "text", sortable: true },
    { id: "state", title: "State", kind: "text", sortable: true, presenter: { kind: "enum", tones: { Pass: "success", Fail: "danger", Warning: "warning" } } },
    { id: "owner", title: "Owner", kind: "text", sortable: true },
    { id: "amount", title: "Amount", kind: "number", sortable: true },
    { id: "note", title: "Note", kind: "text", priority: "optional" }], rows };
const tree = { protocol: "canopyx/2", type: "view", id: "leak-tree", label: "Folders", pageSize: 100, selection: "single", source: { kind: "inline" },
  columns: [{ id: "name", title: "Name" }, { id: "size", title: "Size", kind: "number" }, { id: "owner", title: "Owner" }],
  roots: Array.from({ length: 30 }, (_, i) => ({ id: "f" + i, label: "Folder " + i, cells: { size: i * 10, owner: "Team " + (i % 4) },
    children: Array.from({ length: 12 }, (_, j) => ({ id: "f" + i + "-" + j, label: "File " + i + "." + j, cells: { size: j, owner: "Team " + (j % 4) } })) })) };

async function open(page) {
  const { script, style } = runtimeAssets("reporting");
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Leaks</title><style>" + style + "</style><script>" + script +
    "</script></head><body class=\"cx-page\"><main id=\"stage\"></main></body></html>";
  await page.route("http://canopyx.test/leaks", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/leaks");
  await page.evaluate(({ grid, tree }) => {
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // One cycle mounts a view, uses it the way a reader would, then destroys it and drops the host.
    window.cycle = async (kind, inspect = false) => {
      const host = document.createElement("div");
      host.setAttribute("data-cx-theme", "light");
      host.style.height = "420px";
      document.getElementById("stage").appendChild(host);
      let rendered = [], rowsBefore = 0;
      if (kind === "grid") {
        const api = CanopyX.createDataGrid(host, { view: grid });
        await api.ready;
        await api.setQuery({ search: "Server 1", sort: [{ column: "amount", direction: "desc" }] });
        await api.setSelection(["r1", "r10"]);
        await frame();
        host.querySelector(".cx-grid").scrollTop = 600;
        await frame();
        rendered = [...host.children];
        if (inspect) rowsBefore = host.querySelectorAll(".cx-row[data-cx-id]").length;
        api.destroy();
      } else {
        const api = CanopyX.createTreeGrid(host, { view: tree });
        await api.ready;
        await api.expandPath(["f1"], { expandLast: true, select: true, focus: false });
        await api.expandPath(["f2"], { expandLast: true, select: false, focus: false });
        await frame();
        host.querySelector(".cx-grid").scrollTop = 300;
        await frame();
        rendered = [...host.children];
        if (inspect) rowsBefore = host.querySelectorAll(".cx-row[data-cx-id]").length;
        api.destroy();
      }
      host.remove();
      // The instrument check below keeps what a leaking view would keep: its host and a window listener.
      if (window.retain) {
        window.retained.push(host, rendered);
        window.addEventListener("resize", () => host.isConnected);
      }
      if (inspect) return { rowsBefore, children: host.childElementCount, registered: !!host.canopyx,
        mounted: host.hasAttribute("data-canopyx-mounted"), connected: host.isConnected };
    };
    window.retain = false;
    window.retained = [];
  }, { grid, tree });
}

/** Collects garbage, then reads the heap, the live DOM nodes and listeners, and the detached DOM nodes. */
async function measure(page, cdp) {
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
  const counters = await cdp.send("Memory.getDOMCounters");
  const heap = await cdp.send("Runtime.getHeapUsage");
  let detached = null;
  try {
    detached = (await cdp.send("DOM.getDetachedDomNodes")).detachedNodes.length;
  } catch { /* Older Chromium builds lack the detached-node query; the live node count still covers retained nodes. */ }
  return { nodes: counters.nodes, listeners: counters.jsEventListeners, documents: counters.documents, heapBytes: heap.usedSize, detached };
}

for (const kind of ["grid", "tree"]) {
  test(`a ${kind} releases its rendered host after use and can mount again`, async ({ page }) => {
    await open(page);
    for (let cycle = 0; cycle < 3; cycle++) {
      const result = await page.evaluate(kind => window.cycle(kind, true), kind);
      expect(result.rowsBefore).toBeGreaterThan(0);
      expect(result).toMatchObject({ children: 0, registered: false, mounted: false, connected: false });
      await expect(page.locator("#stage")).toBeEmpty();
    }
  });
}

test("the leak check detects a view whose host and listeners are retained", { tag: "@benchmark" }, async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Heap and DOM counters come from the Chromium DevTools protocol.");
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await page.evaluate(() => window.cycle("grid"));
    const baseline = await measure(page, cdp);
    await page.evaluate(async () => { window.retain = true; for (let i = 0; i < 20; i++) await window.cycle("grid"); });
    const after = await measure(page, cdp);
    expect(after.nodes - baseline.nodes).toBeGreaterThan(LIMITS.nodes);
    expect(after.listeners - baseline.listeners).toBeGreaterThan(LIMITS.listeners);
    if (baseline.detached != null) expect(after.detached - baseline.detached).toBeGreaterThan(LIMITS.detached);
  } finally {
    await cdp.detach();
  }
});

for (const kind of ["grid", "tree"]) {
  test(`a ${kind} mounted and destroyed ${CYCLES} times returns heap, nodes and listeners to the baseline`, { tag: "@benchmark" }, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Heap and DOM counters come from the Chromium DevTools protocol.");
    test.setTimeout(180000);
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("DOM.enable");
      await cdp.send("HeapProfiler.enable");
      // Warm-up cycles load lazy parts, compile code and fill one-time caches before the baseline is taken.
      for (let i = 0; i < WARMUP; i++) await page.evaluate(kind => window.cycle(kind), kind);
      const baseline = await measure(page, cdp);
      await page.evaluate(async ({ kind, cycles }) => { for (let i = 0; i < cycles; i++) await window.cycle(kind); }, { kind, cycles: CYCLES });
      const after = await measure(page, cdp);
      const delta = { nodes: after.nodes - baseline.nodes, listeners: after.listeners - baseline.listeners,
        detached: after.detached == null || baseline.detached == null ? null : after.detached - baseline.detached,
        heapBytes: after.heapBytes - baseline.heapBytes, documents: after.documents - baseline.documents };
      const report = { kind, cycles: CYCLES, baseline, after, delta };
      test.info().annotations.push({ type: "leak-check", description: JSON.stringify(report) });
      console.log("leak-check " + JSON.stringify(report));
      expect(delta.documents, "documents").toBeLessThanOrEqual(0);
      expect(delta.nodes, "live DOM nodes").toBeLessThanOrEqual(LIMITS.nodes);
      expect(delta.listeners, "event listeners").toBeLessThanOrEqual(LIMITS.listeners);
      if (delta.detached != null) expect(delta.detached, "detached DOM nodes").toBeLessThanOrEqual(LIMITS.detached);
      expect(delta.heapBytes, "used JavaScript heap").toBeLessThanOrEqual(LIMITS.heapBytes);
      expect(await page.locator("#stage").evaluate(stage => stage.childElementCount)).toBe(0);
    } finally {
      await cdp.detach();
    }
  });
}

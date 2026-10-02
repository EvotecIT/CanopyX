import { expect, test } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "reliability", label: "Records", rowHeight: 28, pageSize: 2,
  columns: [{ id: "name", title: "Name", width: 250, sortable: true }, { id: "state", title: "State", width: 120 }],
  source: { kind: "inline" }, roots: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

async function capture(page, name) {
  if (process.env.CANOPYX_VISUAL_OUTPUT) await page.screenshot({ path: path.join(process.env.CANOPYX_VISUAL_OUTPUT, name + ".png") });
}

for (const ownership of ["prevented", "composing"]) {
  test(`row and search keys respect ${ownership} events`, async ({ page }) => {
    await open(page, { ...view, search: { minLength: 1, maxResults: 2 } });
    await page.evaluate(ownership => {
      const row = document.querySelector('[data-cx-id="a"]'); row.focus();
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true, isComposing: ownership === "composing" });
      if (ownership === "prevented") event.preventDefault();
      row.dispatchEvent(event);
    }, ownership);
    await expect(page.locator('[data-cx-id="a"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-cx-id="b"]')).toBeFocused();
    const input = page.getByRole("combobox"); await input.fill("Alpha");
    await expect(page.getByRole("option")).toBeVisible();
    await input.evaluate((input, ownership) => {
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, isComposing: ownership === "composing" });
      if (ownership === "prevented") event.preventDefault();
      input.dispatchEvent(event);
    }, ownership);
    await expect(page.getByRole("option")).toBeVisible();
    await input.press("Escape"); await expect(page.getByRole("option")).toBeHidden();
  });
}

for (const stage of ["roots", "prefetch", "children", "paging", "initial"]) {
  test(`navigation cancellation settles while ${stage} remains pending and shared loads still work`, async ({ page }) => {
    await open(page);
    await page.evaluate(async stage => {
      const host = document.querySelector(".cx-host"), view = host.canopyx.view; host.canopyx.destroy();
      const roots = [{ id: "parent", label: "Parent", hasChildren: true }, { id: "other", label: "Other" }];
      const hold = () => new Promise(resolve => { window.releasePage = resolve; });
      const api = window.testApi = CanopyX.createTreeGrid(host, { view, source: {
        page: async (node, cursor) => {
          if (!node) return stage === "roots" ? hold() : { items: roots };
          if (stage === "initial") return hold();
          if (stage === "paging" && !cursor) return { items: [{ id: "first", label: "First" }], next: "second" };
          return hold();
        },
        prefetch: stage === "prefetch" ? hold : undefined
      } });
      if (stage !== "roots") await api.ready;
      if (stage === "initial") {
        // Loaded inline siblings have a declaratively expanded lazy child, which expandPath also waits for.
        api.destroy();
        window.testApi = CanopyX.createTreeGrid(host, { view: { ...view, roots: [{ id: "parent", label: "Parent",
          children: [{ id: "lazy", label: "Lazy", hasChildren: true, expanded: true }] }, roots[1]] }, source: {
          page: async node => node ? hold() : { items: [{ id: "parent", label: "Parent",
            children: [{ id: "lazy", label: "Lazy", hasChildren: true, expanded: true }] }, roots[1]] }
        } });
        await window.testApi.ready;
      }
      window.navigationController = new AbortController();
      window.navigationSettled = false;
      window.navigation = window.testApi.expandPath(["parent", stage === "initial" ? "lazy" : "leaf"], {
        signal: window.navigationController.signal
      }).then(result => { window.navigationResult = result; window.navigationSettled = true; });
    }, stage);
    await page.waitForFunction(() => !!window.releasePage);
    await page.evaluate(() => window.navigationController.abort());
    await expect.poll(() => page.evaluate(() => window.navigationSettled)).toBe(true);
    expect(await page.evaluate(() => window.navigationResult)).toBeNull();
    await page.evaluate(stage => window.releasePage({ items: stage === "roots" ?
      [{ id: "parent", label: "Parent", hasChildren: true }, { id: "other", label: "Other" }] :
      stage === "initial" ? [{ id: "leaf", label: "Leaf" }] : [{ id: "leaf", label: "Leaf" }] }), stage);
    if (stage === "prefetch") {
      // Prefetch may finish after cancellation; it must not start navigation's child load.
      await nextFrames(page);
    } else if (stage !== "initial") {
      await page.evaluate(async () => { await window.testApi.ready; await window.testApi.expandPath(["other"]); });
      await expect(page.locator('[data-cx-id="other"]')).toBeFocused();
      if (stage !== "roots") {
        const found = await page.evaluate(async () => (await window.testApi.expandPath(["parent", "leaf"], { focus: false })).id);
        expect(found).toBe("leaf");
      }
    }
    await page.evaluate(() => window.testApi.destroy());
  });
}

test("destroy settles navigation waiting for custom roots", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), view = host.canopyx.view; host.canopyx.destroy();
    window.testApi = CanopyX.createTreeGrid(host, { view, source: { page: () => new Promise(() => {}) } });
    window.navigationSettled = false;
    window.testApi.expandPath(["a"]).then(result => { window.navigationSettled = result === null; });
    window.testApi.destroy();
  });
  await expect.poll(() => page.evaluate(() => window.navigationSettled)).toBe(true);
});

test("configuration disposers release future mounts without removing newer registrations or changing a live grid", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), view = host.canopyx.view; host.canopyx.destroy();
    window.selectedBy = [];
    const old = CanopyX.configure(view.id, { onSelect: () => window.selectedBy.push("old") });
    const current = CanopyX.configure(view.id, { onSelect: () => window.selectedBy.push("current") });
    old();
    let [api] = CanopyX.mount(); await api.ready;
    current(); // Removing a registration leaves the current grid's copied options intact.
    await api.expandPath(["a"]); api.destroy();
    [api] = CanopyX.mount(); await api.ready; await api.expandPath(["a"]); api.destroy();
    CanopyX.configure(view.id, { onSelect: () => window.selectedBy.push("removed") });
    const removed = CanopyX.unconfigure(view.id), missing = CanopyX.unconfigure(view.id);
    [api] = CanopyX.mount(); await api.ready; await api.expandPath(["a"]); api.destroy();
    return { selectedBy: window.selectedBy, removed, missing };
  });
  expect(result).toEqual({ selectedBy: ["current"], removed: true, missing: false });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 180 }, { width: 1400, height: 900 }]) {
  test(`column chooser stays within ${viewport.width}x${viewport.height} and scrolls long translated columns`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, { ...view, columns: [view.columns[0], ...Array.from({ length: 30 }, (_, i) => ({
      id: "c" + i, title: "A translated column title with long words " + "x".repeat(80), width: 120
    }))] });
    await page.locator(".cx-columns > summary").click();
    const menu = page.locator(".cx-columns-list"); await expect(menu).toBeVisible();
    await expect.poll(() => menu.evaluate(group => {
      const r = group.getBoundingClientRect();
      return r.left >= 7 && r.right <= innerWidth - 7 && r.top >= 7 && r.bottom <= innerHeight - 7;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await menu.locator("input").last().uncheck();
    await expect(menu.locator("input").last()).not.toBeChecked();
    await capture(page, "columns-" + viewport.width + "x" + viewport.height);
  });
}

test("a low toolbar opens its chooser above and repositions when the viewport changes", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page, { ...view, columns: [view.columns[0], ...Array.from({ length: 20 }, (_, i) => ({ id: "c" + i, title: "Column " + i, width: 100 }))] });
  await page.locator(".cx-host").evaluate(host => { host.style.marginTop = "290px"; });
  const control = page.locator(".cx-columns > summary"), menu = page.locator(".cx-columns-list");
  await control.click(); await expect(menu).toBeVisible();
  await expect.poll(() => menu.evaluate(group => group.getBoundingClientRect().bottom <= group.parentElement.getBoundingClientRect().top)).toBe(true);
  await capture(page, "columns-above");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => menu.evaluate(group => {
    const r = group.getBoundingClientRect();
    return r.left >= 7 && r.right <= innerWidth - 7 && r.top >= group.parentElement.getBoundingClientRect().bottom && r.bottom <= innerHeight - 7;
  })).toBe(true);
});

test("search flyouts fit a narrow host against the viewport edge and remain keyboard usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await open(page, { ...view, search: { minLength: 1, maxResults: 2 } });
  await page.locator(".cx-host").evaluate(host => { host.style.width = "200px"; host.style.marginLeft = "auto"; });
  const input = page.getByRole("combobox"); await input.fill("Alpha");
  await expect(page.getByRole("option")).toBeVisible();
  const bounds = await page.locator(".cx-results").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(7); expect(bounds.x + bounds.width).toBeLessThanOrEqual(383);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page, "search-embedded");
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator('[data-cx-id="a"]')).toBeFocused();
});

for (const outcome of ["deadline", "caller", "lifetime", "body"]) {
  test(`remote transport releases a stalled ${outcome} request`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async outcome => {
      const controller = new AbortController();
      const source = CanopyX.sources.remote({ source: { children: "/pending?ref={ref}&cursor={cursor}" } }, {
        timeoutMs: outcome === "deadline" || outcome === "body" ? 25 : 30000,
        signal: outcome === "lifetime" ? controller.signal : undefined
      });
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        const pending = () => new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          if (options.signal.aborted) reject(new DOMException("Aborted", "AbortError"));
        });
        return outcome === "body" ? { ok: true, json: pending } : pending();
      };
      try {
        const pending = source.page(null, null, { signal: outcome === "caller" ? controller.signal : undefined });
        if (outcome === "caller" || outcome === "lifetime") controller.abort();
        try { await pending; return "unexpected success"; }
        catch (error) { return error.name === "AbortError" ? "aborted" : error.message; }
      } finally { window.fetch = originalFetch; }
    }, outcome);
    expect(result).toBe(outcome === "deadline" || outcome === "body" ? "CanopyX: remote request timed out after 25 milliseconds." : "aborted");
  });
}

test("remote transport cancels an unread streaming HTTP error response", async ({ page }) => {
  const server = http.createServer((request, response) => {
    if (request.url.startsWith("/failure")) {
      response.writeHead(503, "Service Unavailable", { "Content-Type": "application/json" });
      response.write('{"unfinished":');
    } else {
      response.writeHead(200, { "Content-Type": "text/html" }); response.end(viewPage(view));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto("http://127.0.0.1:" + server.address().port);
    const cancelled = page.waitForEvent("requestfailed", { predicate: request => request.url().includes("/failure?"), timeout: 3000 });
    const result = await page.evaluate(async () => {
      const original = window.fetch;
      let response, signal, error;
      window.fetch = async (url, options) => {
        signal = options.signal; response = await original(url, options); return response;
      };
      try {
        await CanopyX.sources.remote({ source: { children: "/failure?ref={ref}&cursor={cursor}" } }).page(null, null);
        error = "unexpected success";
      } catch (failure) { error = failure.message; }
      finally { window.fetch = original; }
      let retired = false;
      try { retired = (await response.body.getReader().read()).done; }
      catch (failure) { retired = failure.name === "AbortError"; }
      return { error, aborted: signal.aborted, retired };
    });
    expect(result).toEqual({ error: "503 Service Unavailable", aborted: true, retired: true });
    expect((await cancelled).failure().errorText).toContain("ABORTED");
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

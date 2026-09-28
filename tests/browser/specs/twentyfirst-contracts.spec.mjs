import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "twentyfirst", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 280 }],
  source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}", counts: "/counts?ids={ids}" } };

test("invalid direct and remote child counts reject the whole update", async ({ page }) => {
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 1, next: null,
    items: [{ id: "parent", label: "Parent", hasChildren: true, childCount: 1 }] } }));
  await page.route("https://canopyx.test/counts?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 1.5 }] } }));
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    const errors = [];
    for (const bad of [-1, 2147483648, null]) {
      try { api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [
        { id: "parent", childCount: 2 }, { id: "other", childCount: bad }] });
        errors.push(null);
      } catch (error) { errors.push(error.message); }
    }
    try { await api.refreshCounts(["parent"]); errors.push(null); }
    catch (error) { errors.push(error.message); }
    return { errors, count: api.visibleRows()[0].node.childCount };
  });
  expect(result.count).toBe(1);
  expect(result.errors.every(error => error?.includes("childCount"))).toBe(true);
});

test("auto-mount shows an alert when asynchronous inline initialization rejects", async ({ page }) => {
  const bad = { ...view, source: { kind: "inline" }, roots: [
    { id: "duplicate", label: "First" }, { id: "duplicate", label: "Second" }] };
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(bad) }));
  await page.goto("https://canopyx.test/");
  await expect(page.getByRole("alert")).toContainText("duplicate node ID");
  await nextFrames(page);
  await expect(page.getByRole("treegrid")).toHaveCount(0);
  await expect(page.locator(".cx-host")).not.toHaveAttribute("data-cx-ready", "true");
  await expect(page.locator(".cx-host")).toHaveAttribute("data-cx-error", /duplicate node ID/);
  expect(errors).toEqual([]);
});

test("out-of-range page and node counts fail before remote nodes attach", async ({ page }) => {
  let response;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: response }));
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  for (const [bad, message] of [
    [{ total: 2147483648, items: [{ id: "parent", label: "Parent" }] }, "page total"],
    [{ total: 1, items: [{ id: "parent", label: "Parent", childCount: 0 }] }, "node childCount"]
  ]) {
    response = { protocol: "canopyx/1", type: "page", parent: null, offset: 0, next: null, ...bad };
    await page.goto("https://canopyx.test/");
    await expect(page.getByRole("row", { name: /Could not load:/ })).toContainText(message);
    await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("a retired failed auto-mount cannot mark its replacement as failed", async ({ page }) => {
  const valid = { ...view, source: { kind: "inline" }, roots: [{ id: "good", label: "Good" }] };
  const invalid = { ...valid, roots: [{ id: "same", label: "First" }, { id: "same", label: "Second" }] };
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(valid) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async ({ invalid, valid }) => {
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    const config = document.createElement("script");
    config.className = "cx-config";
    config.type = "application/json";
    config.textContent = JSON.stringify(invalid);
    host.appendChild(config);
    document.body.appendChild(host);
    const old = CanopyX.mount(document)[0];
    old.destroy();
    const fresh = CanopyX.createTreeGrid(host, { view: valid });
    await Promise.allSettled([old.ready, fresh.ready]);
    return { current: host.canopyx === fresh, ready: host.hasAttribute("data-cx-ready"),
      error: host.hasAttribute("data-cx-error"), alerts: host.querySelectorAll('[role="alert"]').length,
      grids: host.querySelectorAll('[role="treegrid"]').length };
  }, { invalid, valid });
  expect(result).toEqual({ current: true, ready: true, error: false, alerts: 0, grids: 1 });
});

test("a failed auto-mount can be corrected and mounted again", async ({ page }) => {
  const valid = { ...view, source: { kind: "inline" }, roots: [{ id: "good", label: "Good" }] };
  const invalid = { ...valid, roots: [{ id: "same", label: "First" }, { id: "same", label: "Second" }] };
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(invalid) }));
  await page.goto("https://canopyx.test/");
  await expect(page.getByRole("alert")).toContainText("duplicate node ID");
  const result = await page.evaluate(async valid => {
    const host = document.querySelector(".cx-host");
    host.querySelector("script.cx-config").textContent = JSON.stringify(valid);
    host.querySelector('[role="alert"]').remove();
    host.removeAttribute("data-cx-error");
    host.removeAttribute("data-canopyx-mounted");
    const fresh = CanopyX.mount(document)[0];
    await fresh.ready;
    return { current: host.canopyx === fresh, ready: host.hasAttribute("data-cx-ready"),
      alerts: host.querySelectorAll('[role="alert"]').length, rows: fresh.visibleRows().map(row => row.node.id) };
  }, valid);
  expect(result).toEqual({ current: true, ready: true, alerts: 0, rows: ["good"] });
});

test("duplicate direct and remote counts reject before changing loaded children", async ({ page }) => {
  const remote = { ...view, source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}", counts: "/counts?ids={ids}" } };
  await page.route("https://canopyx.test/children?*", route => {
    const ref = new URL(route.request().url()).searchParams.get("ref");
    return route.fulfill({ json: { protocol: "canopyx/1", type: "page", parent: ref || null, offset: 0,
      total: 1, next: null, items: ref ? [{ id: "child", label: "Child" }] :
        [{ id: "parent", label: "Parent", hasChildren: true, childCount: 1 }] } });
  });
  await page.route("https://canopyx.test/counts?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "counts", items: [
      { id: "parent", childCount: 0 }, { id: "parent", childCount: 1 }] } }));
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(remote) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    await api.expandPath(["parent"], { select: false, focus: false, expandLast: true });
    const before = api.visibleRows().map(row => row.node.id);
    const errors = [];
    for (const update of [() => api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [
      { id: "parent", childCount: 0 }, { id: "parent", childCount: 1 }] }), () => api.refreshCounts(["parent"])]) {
      try { await update(); errors.push(null); } catch (error) { errors.push(error.message); }
    }
    return { before, after: api.visibleRows().map(row => row.node.id),
      count: api.visibleRows()[0].node.childCount, errors };
  });
  expect(result.before).toEqual(["parent", "child"]);
  expect(result.after).toEqual(result.before);
  expect(result.count).toBe(1);
  expect(result.errors.every(error => error?.includes("duplicate counts node ID"))).toBe(true);
});

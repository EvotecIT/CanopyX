import { expect, test } from "@playwright/test";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "twentythird", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

test("count-only refresh keeps an edited host control on the affected row", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const api = CanopyX.createTreeGrid(host, { view: { ...document.querySelector(".cx-host").canopyx.view,
      source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}" } },
      source: { page: async node => ({ items: node ? [{ id: "child", label: "Child" }] :
        [{ id: "parent", label: "Parent", hasChildren: true, ref: "parent", childCount: 1 }], next: null }) },
      renderCell(node, column, cell) {
        if (column !== "name") return false;
        const input = document.createElement("input");
        input.value = node.label;
        cell.appendChild(input);
        return true;
      } });
    await api.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const input = host.querySelector('[data-cx-id="parent"] input');
    input.value = "edited";
    input.focus();
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = { retained: host.querySelector('[data-cx-id="parent"] input') === input,
      connected: input.isConnected, value: input.value, focused: document.activeElement === input };
    await api.expandPath(["parent"], { expandLast: true });
    input.focus();
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 0 }] });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    result.afterInvalidation = { retained: host.querySelector('[data-cx-id="parent"] input') === input,
      focused: document.activeElement === input, childRemoved: !host.querySelector('[data-cx-id="child"]') };
    return result;
  });
  expect(result).toEqual({ retained: true, connected: true, value: "edited", focused: true,
    afterInvalidation: { retained: true, focused: true, childRemoved: true } });
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/twentythird-count-control.png") });
});

for (const label of [undefined, null, 42]) {
  test(`a page rejects a node with non-string label ${label}`, async ({ page }) => {
    const node = { id: "broken" };
    if (label !== undefined) node.label = label;
    await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: {
      protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 1, next: null, items: [node] } }));
    await open(page, { ...view, source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}" } });
    await expect(page.locator('[data-cx-status="error"]')).toContainText("label");
    await expect(page.locator('[data-cx-id="broken"]')).toHaveCount(0);
    if (label === undefined) await page.screenshot({ path: path.join(repo, "artifacts/takeover/twentythird-label-error.png") });
  });
}

test("sidecar children load by ID when an optional reference is absent", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const id = "sidecar-ref-default";
    const base = { protocol: "canopyx/1" };
    CanopyXSidecar.push([id, "manifest", { ...base, type: "manifest", view: id, root: "r/0" }]);
    CanopyXSidecar.push([id, "r/0", { ...base, type: "page", parent: null, offset: 0, total: 1,
      next: null, items: [{ id: "parent", label: "Parent", hasChildren: true }] }]);
    CanopyXSidecar.push([id, "parent", { ...base, type: "page", parent: "parent", offset: 0, total: 1,
      next: null, items: [{ id: "child", label: "Child" }] }]);
    const host = document.createElement("div");
    host.id = "sidecar-default";
    document.body.appendChild(host);
    const api = CanopyX.createTreeGrid(host, { view: { ...document.querySelector(".cx-host").canopyx.view,
      id, source: { kind: "sidecar", base: "/data/" } } });
    await api.ready;
  });
  await page.locator('#sidecar-default [data-cx-id="parent"] .cx-exp').click();
  await expect(page.locator('#sidecar-default [data-cx-id="child"]')).toBeVisible();
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/twentythird-sidecar-default.png") });
});

test("destroy releases the host reference without revoking a caller-held view", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host");
    const retired = host.canopyx;
    retired.destroy();
    const released = !Object.hasOwn(host, "canopyx");
    const retainedView = retired.view.id;
    const replacement = CanopyX.createTreeGrid(host, { view: retired.view });
    await replacement.ready;
    retired.destroy();
    return { released, retainedView, replacementRetained: host.canopyx === replacement };
  });
  expect(result).toEqual({ released: true, retainedView: "twentythird", replacementRetained: true });
});

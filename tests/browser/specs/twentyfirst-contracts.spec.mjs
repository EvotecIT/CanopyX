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
        { id: "parent", childCount: 2 }, { id: "parent", childCount: bad }] });
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

// A node carries host facts that are not cells, badges, or flags in "data". The runtime neither shows nor searches
// them; it hands them to the host's callbacks with the node.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "data", label: "Data", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }, { id: "level", title: "Level", width: 160, kind: "text" }],
  search: { minLength: 2, maxResults: 20, placeholder: "Search" }, source: { kind: "inline" },
  roots: [{ id: "a", label: "Alpha", data: { level: "high", position: "0-42" } }, { id: "b", label: "Beta", data: { level: "low", position: "0-43" } }, { id: "c", label: "Gamma" }] };

async function open(page, data) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

test("host callbacks read a node's data, and the grid neither shows nor searches it", async ({ page }) => {
  await open(page, view);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    window.selected = [];
    window.api = CanopyX.createTreeGrid(host, { view: data,
      renderers: { level(node, element) { element.textContent = node.data ? "level " + node.data.level : "no data"; return true; } },
      onSelect: (node) => window.selected.push(node.data ? node.data.position : null) });
    await window.api.ready;
  });
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="a"] [aria-colindex="2"]')).toHaveText("level high");
  await expect(page.locator('[data-cx-id="c"] [aria-colindex="2"]')).toHaveText("no data");
  await expect(page.locator('[data-cx-id="a"] [aria-colindex="1"]')).toHaveText("Alpha");
  await page.locator('[data-cx-id="b"]').click();
  expect(await page.evaluate(() => window.selected)).toEqual(["0-43"]);
  await page.evaluate(() => window.api.setFilter((node) => !!node.data && node.data.level === "high"));
  await nextFrames(page);
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(1);
  expect((await page.evaluate(() => window.api.search("high"))).hits).toEqual([]);
});

test("data that is not an object of strings is rejected with the page it came in", async ({ page }) => {
  await page.route("https://canopyx.test/children?*", (route) => route.fulfill({ json: { protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 1, next: null,
    items: [{ id: "bad", label: "Bad", data: { position: 42 } }] } }));
  const remote = { ...view, source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}" } };
  delete remote.roots;
  delete remote.search;
  await open(page, remote);
  await expect(page.locator('[data-cx-status="error"]')).toContainText("node data must be an object of strings");
  await expect(page.locator('[data-cx-id="bad"]')).toHaveCount(0);
});

// The history presenters (status strip, sparklines) come with the lazy history part. A grid whose part cannot load keeps its
// other cells, reports the failure once and does not request the part again from every history cell it paints.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");

test("a grid whose history part cannot load reports it once and keeps its other cells through later renders", async ({ page }) => {
  const periods = Array.from({ length: 7 }, (_, day) => ({ period: "Day " + day, tone: day % 3 ? "success" : "danger" }));
  const view = { protocol: "canopyx/2", type: "grid", id: "history", label: "Services", pageSize: 100, selection: "single", search: false, source: { kind: "inline" },
    columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "history", title: "History", kind: "text", presenter: { kind: "statusStrip" } }],
    rows: Array.from({ length: 120 }, (_, i) => ({ id: "r" + i, cells: { name: "Service " + i, history: { value: "Healthy", series: periods } } })) };
  let historyRequests = 0;
  await page.route("https://history.test/**", route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>History</title><style>' + read("canopyx-grid.css") +
      '</style><script>window.errors=[];</script><script src="/canopyx-grid.js"></script></head><body><div class="cx-host" data-canopyx-host style="height:400px">' +
      '<script type="application/json" class="cx-config">' + JSON.stringify(view) + "</script></div>" +
      "<script>document.querySelector('[data-canopyx-host]').addEventListener('canopyx:error',e=>errors.push(e.detail.error.message));</script></body></html>" });
    if (file === "canopyx-grid.js") return route.fulfill({ contentType: "text/javascript", body: read("canopyx-grid.js") });
    if (file.startsWith("canopyx-history")) historyRequests++;
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://history.test/");
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator('.cx-row[data-cx-id="r0"]')).toContainText("Service 0");
  // Later renders paint more history cells: scrolling recycles rows, and sorting repaints them all.
  const grid = page.locator(".cx-grid");
  for (const top of [600, 1800, 0]) { await grid.evaluate((element, value) => { element.scrollTop = value; }, top); await page.waitForTimeout(120); }
  await page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.sort([{ column: "name", direction: "desc" }]));
  await expect(page.locator(".cx-row").first()).toContainText("Service 99");
  await page.waitForTimeout(200);
  expect(historyRequests).toBe(1);
  const errors = await page.evaluate(() => window.errors);
  expect(errors).toEqual(["CanopyX: history presenters script unavailable."]);
});

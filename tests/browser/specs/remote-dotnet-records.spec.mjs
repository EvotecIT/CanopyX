import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { repo } from "./support.mjs";

// Record details end to end: the fleet sample's record route (CanopyX.AspNetCore over EF Core and SQLite) answers the record
// panel's gridRecordQuery documents. The solution build produces the sample; CANOPYX_REMOTE_SAMPLE points at another build.
// CANOPYX_RECORD_EVIDENCE names a folder for the drawer captures (light and dark, 1440 and 390); otherwise they go to the test output.
const candidates = [process.env.CANOPYX_REMOTE_SAMPLE,
  ...["Release", "Debug"].map(configuration => path.join(repo, "samples/FleetInventory/bin", configuration, "net10.0/FleetInventory.dll"))].filter(Boolean);
const sample = candidates.find(file => fs.existsSync(file));
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const rows = 2000;
const drawer = page => page.locator("dialog.cx-drawer");
let server, base, folder;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.skip(!sample, "The fleet sample is not built: " + candidates.join(", "));
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "canopyx-records-e2e-"));
  base = "http://127.0.0.1:" + port;
  server = spawn("dotnet", [sample, "--urls", base, "--database", path.join(folder, "fleet.db"), "--rows", String(rows)],
    { cwd: path.dirname(sample), stdio: "ignore", env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Production", DOTNET_NOLOGO: "1" } });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if ((await fetch(base + "/api/machines/view")).ok) break; } catch { }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("The fleet sample did not start.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  if (folder) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
});

/** Opens the machines page and records the record requests it sends. */
async function open(page, url = "/") {
  const requests = [];
  page.on("request", request => { if (request.url().endsWith("/api/machines/record")) requests.push(JSON.parse(request.postData())); });
  await page.goto(base + url);
  await page.waitForSelector("[data-cx-ready]");
  return requests;
}
async function openMachine(page, id) {
  await expect(page.locator(`.cx-row[data-cx-id="${id}"]`)).toBeVisible();
  await page.locator(`.cx-row[data-cx-id="${id}"] .cx-cell`).first().click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).locator('dd[data-cx-field="serial"]')).toHaveText(/^SN-\d{8}$/);
}
const post = (page, body, type = "application/json") => page.evaluate(async ({ body, type }) => {
  const response = await fetch("/api/machines/record", { method: "POST", headers: { "Content-Type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: response.status, text: await response.text() };
}, { body, type });

test("opens a machine's record from the hosted grid with fields, a paged collection, history and related machines", async ({ page }) => {
  const requests = await open(page);
  await openMachine(page, "1");
  const dialog = drawer(page);
  const title = await dialog.locator(".cx-drawer-h h4").textContent();
  expect(title).toMatch(/^[a-z]{3,5}-[wlmf]000001$/);
  expect(requests[0]).toEqual({ protocol: "canopyx/2", type: "gridRecordQuery", view: "machines", id: "1", revision: "r1" });
  await expect(dialog.locator('dd[data-cx-field="purchased"]')).not.toHaveText("");
  await expect(dialog.locator(".cx-record-status")).toBeVisible();

  // Tabs are an ARIA tablist driven by the arrow keys.
  const tabs = dialog.getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveText(["Overview", "Software", "History", "Related"]);
  await tabs.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Software" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Software" })).toBeFocused();

  // The software list carries its first ten programs; Load more asks the record route for the next page.
  const software = dialog.locator('.cx-record-block-b[data-cx-field="software"]');
  const count = software.locator(".cx-record-count");
  await expect(count).toHaveText(/^10 of (1[89]|2[0-4])$/);
  const total = Number((await count.textContent()).split(" of ")[1]);
  await software.getByRole("button", { name: "Load more" }).click();
  await expect(dialog.locator('.cx-record-block-b[data-cx-field="software"] .cx-record-count')).toHaveText(total > 20 ? "20 of " + total : total + " items");
  expect(requests.at(-1)).toEqual({ protocol: "canopyx/2", type: "gridRecordQuery", view: "machines", id: "1", revision: "r1", field: "software", offset: 10, limit: 10 });

  // History: the maintenance timeline (newest first) and the configuration changes.
  await tabs.getByRole("tab", { name: "History" }).click();
  const items = dialog.locator('.cx-record-block-b[data-cx-field="maintenance"] .cx-timeline-item time');
  if (await items.count() > 1) {
    const times = await items.evaluateAll(list => list.map(item => item.dateTime));
    expect(times).toEqual([...times].sort().reverse());
  }

  // Related: the machines in the same rack open their own records, with Back to return.
  await tabs.getByRole("tab", { name: "Related" }).click();
  const rack = dialog.locator('.cx-record-block-b[data-cx-field="rack"] .cx-record-nested .cx-row[data-cx-id]');
  await expect(rack.first()).toBeVisible();
  // Rack rows sort by name, so the machine itself is one of them: open another one.
  const names = await rack.evaluateAll(list => list.map(row => row.querySelector(".cx-cell")?.textContent.trim()));
  const index = names.findIndex(name => name !== title);
  await rack.nth(index).locator(".cx-cell").first().click();
  await expect(dialog.locator(".cx-drawer-h h4")).toHaveText(names[index]);
  await expect(dialog.locator(".cx-record-back")).toBeVisible();
  await expect.poll(() => requests.some(request => request.id !== "1" && !request.field)).toBe(true);
  await dialog.locator(".cx-record-back").click();
  await expect(dialog.locator(".cx-drawer-h h4")).toHaveText(title);
});

test("the keyboard opens and closes the drawer and focus returns to the row", async ({ page }) => {
  await open(page);
  await openMachine(page, "2");
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  const focused = await page.evaluate(() => document.activeElement?.closest(".cx-row")?.getAttribute("data-cx-id"));
  expect(focused).toBe("2");
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).locator(".cx-drawer-h h4")).toBeFocused();
  await expect(drawer(page)).toHaveAttribute("aria-labelledby", /.+/);
});

test("a record deep link opens a machine the grid has not loaded through the record route (row: true)", async ({ page }) => {
  const requests = await open(page, "/#record=machines:1990");
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).locator('dd[data-cx-field="serial"]')).toHaveText(/^SN-\d{8}$/);
  await expect(drawer(page).locator(".cx-drawer-h h4")).toHaveText(/001990$/);
  expect(requests.find(request => request.row)).toMatchObject({ view: "machines", id: "1990", row: true });
  expect(await page.locator('.cx-row[data-cx-id="1990"]').count()).toBe(0);
});

test("errors: a failed load offers Retry, a missing record shows the row alone, and the route answers typed errors", async ({ page }) => {
  await open(page);
  let fail = true;
  await page.route("**/api/machines/record", route => fail
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "serverError", message: "The request could not be completed." }) })
    : route.continue());
  await page.locator('.cx-row[data-cx-id="3"] .cx-cell').first().click();
  const error = drawer(page).locator(".cx-record-error");
  await expect(error).toContainText("The request could not be completed.");
  await expect(error).toHaveAttribute("role", "alert");
  fail = false;
  await error.getByRole("button", { name: "Retry" }).click();
  await expect(drawer(page).locator('dd[data-cx-field="serial"]')).toHaveText(/^SN-\d{8}$/);
  await page.keyboard.press("Escape");

  // A record that is no longer available answers 404 recordNotFound: the drawer keeps the row and shows no details.
  await page.unroute("**/api/machines/record");
  await page.route("**/api/machines/record", route => route.fulfill({ status: 404, contentType: "application/json",
    body: JSON.stringify({ error: "recordNotFound", message: "The record is not available." }) }));
  await page.locator('.cx-row[data-cx-id="4"] .cx-cell').first().click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).locator(".cx-record-note")).toHaveCount(0);
  await expect(drawer(page).locator(".cx-record-error")).toHaveCount(0);
  await expect(drawer(page).locator('dd[data-cx-field="serial"]')).toHaveCount(0);
  await page.unroute("**/api/machines/record");

  const hostile = await post(page, { view: "machines", id: "1 OR 1=1; DROP TABLE Machines" });
  expect(hostile.status).toBe(404);
  expect(JSON.parse(hostile.text).error).toBe("recordNotFound");
  expect(hostile.text).not.toContain("DROP");
  expect((await post(page, { view: "machines", id: "999999" })).status).toBe(404);
  expect(JSON.parse((await post(page, { view: "machines", id: "1", field: "software", limit: 500 })).text).error).toBe("limitExceeded");
  expect(JSON.parse((await post(page, { view: "machines", id: "1", field: "serial" })).text).error).toBe("notCollection");
  expect((await post(page, { view: "machines", id: "1", revision: "r0" })).status).toBe(409);
  expect((await post(page, JSON.stringify({ view: "machines", id: "1" }), "text/plain")).status).toBe(415);
});

test("a deep link to a machine that does not exist leaves the drawer closed", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error));
  await open(page, "/#record=machines:999999");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(drawer(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** The first machine past 1,000 whose record has notes, a replaced machine, a rack and software: every tab has content. */
let rich;
async function richMachine(page) {
  return rich ??= await page.evaluate(async () => {
    for (let id = 1001; id < 2000; id++) {
      const response = await fetch("/api/machines/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: "machines", id: String(id) }) });
      const fields = (await response.json()).fields || {};
      if (fields.notes && fields.replaces && fields.rack && fields.maintenance && fields.changes) return String(id);
    }
    return "1001";
  });
}

for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ["light", "dark"]) {
  test(`the drawer passes axe at ${width} in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await open(page, theme === "dark" ? "/?theme=dark" : "/");
    const id = await richMachine(page);
    await page.goto(base + (theme === "dark" ? "/?theme=dark" : "/") + "#record=machines:" + id);
    await expect(drawer(page).locator('dd[data-cx-field="serial"]')).toHaveText(/^SN-\d{8}$/);
    await expect(drawer(page).locator(".cx-record-note")).toHaveCount(0);
    await expect(drawer(page).locator('dd[data-cx-field="replaces"] .cx-record-link')).toBeVisible();
    if (width < 640) {
      const box = await drawer(page).boundingBox();
      expect(box.width).toBe(width);
      expect(await drawer(page).locator(".cx-drawer-body").evaluate(body => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
    }
    const capture = async (tab) => {
      const result = await new AxeBuilder({ page }).include("dialog.cx-drawer").analyze();
      expect(result.violations.map(item => item.id + ": " + item.nodes.map(node => node.target.join(" ")).join(", "))).toEqual([]);
      const name = `record-drawer-${width}-${theme}-${tab}.png`;
      await page.screenshot({ path: process.env.CANOPYX_RECORD_EVIDENCE ? path.join(process.env.CANOPYX_RECORD_EVIDENCE, name) : testInfo.outputPath(name) });
    };
    await capture("overview");
    await drawer(page).getByRole("tab", { name: "Software" }).click();
    await expect(drawer(page).locator('.cx-record-block-b[data-cx-field="software"]')).toBeVisible();
    await capture("software");
    await drawer(page).getByRole("tab", { name: "History" }).click();
    await expect(drawer(page).locator('.cx-record-block-b[data-cx-field="maintenance"] .cx-timeline-item').first()).toBeVisible();
    await capture("history");
  });
}

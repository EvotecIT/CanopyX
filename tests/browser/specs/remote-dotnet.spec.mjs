import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { repo, openGridControl, nextFrames } from "./support.mjs";

// End to end against the real fleet sample: ASP.NET Core endpoints from CanopyX.AspNetCore over EF Core and SQLite.
// The solution build produces the sample; set CANOPYX_REMOTE_SAMPLE to its FleetInventory.dll to use another build.
const candidates = [process.env.CANOPYX_REMOTE_SAMPLE,
  ...["Release", "Debug"].map(configuration => path.join(repo, "samples/FleetInventory/bin", configuration, "net10.0/FleetInventory.dll"))].filter(Boolean);
const sample = candidates.find(file => fs.existsSync(file));
const api = "document.querySelector('[data-canopyx-host]').canopyx";
const rows = 20000;
let server, base, folder;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.skip(!sample, "The fleet sample is not built: " + candidates.join(", "));
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "canopyx-remote-e2e-"));
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

async function open(page, url = "/") {
  const queries = [];
  page.on("request", request => { if (request.url().endsWith("/query") && request.method() === "POST") queries.push(JSON.parse(request.postData())); });
  await page.goto(base + url);
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator(".cx-row[data-cx-id]").first()).toBeVisible();
  return queries;
}
const paging = page => page.evaluate(api => eval(api).getPaging(), api);
/** The first records of the grid's accepted query, read from the server, and the record ids the grid shows. */
const serverWindow = page => page.evaluate(async api => {
  const grid = eval(api), shown = [...document.querySelectorAll(".cx-row[data-cx-id]")].map(row => row.getAttribute("data-cx-id"));
  const response = await fetch("/api/machines/query", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...grid.getQuery(), offset: 0, limit: Math.min(10, shown.length) }) });
  return { shown, page: await response.json() };
}, api);

test("pages a large remote result one window at a time", async ({ page }) => {
  const queries = await open(page);
  expect((await paging(page)).matched).toBe(rows);
  await page.getByRole("grid").evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
  await expect.poll(() => page.evaluate(() => Math.max(...[...document.querySelectorAll(".cx-row[data-cx-id]")].map(row => +row.getAttribute("aria-rowindex"))))).toBeGreaterThan(rows - 5);
  expect(queries.length).toBeLessThanOrEqual(6);
  for (const query of queries) expect(query.limit).toBeLessThanOrEqual(200);
  expect(queries.some(query => query.offset >= rows - 200)).toBe(true);
});

test("sorts, searches and filters on the server", async ({ page }) => {
  await open(page);
  await page.locator('.cx-hcell[data-cx-column="memory"] .cx-sort').click();
  await expect.poll(() => page.evaluate(api => eval(api).getQuery().sort[0]?.column, api)).toBe("memory");
  const direction = await page.evaluate(api => eval(api).getQuery().sort[0].direction, api);
  await expect.poll(async () => { const current = await serverWindow(page);
    return current.page.items.map(item => item.id).join() === current.shown.slice(0, current.page.items.length).join(); }).toBe(true);
  const values = (await serverWindow(page)).page.items.map(item => item.cells.memory.value);
  expect(values).toEqual([...values].sort((a, b) => direction === "asc" ? a - b : b - a));

  await page.getByRole("searchbox").first().fill("war-w");
  await expect.poll(async () => (await paging(page)).matched).toBeLessThan(rows);
  await expect.poll(async () => { const current = await serverWindow(page);
    return current.page.items.every(item => item.cells.name.startsWith("war-w")) && current.page.items.map(item => item.id).join() === current.shown.slice(0, current.page.items.length).join(); }).toBe(true);
  const searched = (await paging(page)).matched;
  expect(searched).toBeGreaterThan(0);

  await page.evaluate(api => eval(api).setQuery({ search: "", filterGroup: { operator: "or", filters: [
    { column: "cores", operator: "ge", values: [64] }, { column: "site", operator: "isNull", values: [] }], groups: [] } }), api);
  const filtered = await page.evaluate(async api => {
    const grid = eval(api), response = await fetch("/api/machines/query", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...grid.getQuery(), offset: 0, limit: 1 }) });
    return (await response.json()).matched;
  }, api);
  expect((await paging(page)).matched).toBe(filtered);
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(rows);
});

test("value lists count the complete query on the server and filter the grid", async ({ page }) => {
  await open(page);
  const facet = await page.evaluate(api => eval(api).getFacets("os"), api);
  expect(facet.matched).toBe(rows);
  expect(facet.items.map(item => item.value)).toEqual(["FreeBsd", "Linux", "MacOs", "Windows"]);
  expect(facet.items.reduce((sum, item) => sum + item.count, 0)).toBe(rows);

  await page.getByRole("button", { name: "Menu for Site", exact: true }).click();
  await page.getByRole("menuitem", { name: "Filter…", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.locator(".cx-val") });
  await expect(dialog.locator(".cx-val")).toHaveCount(9);
  const berlin = dialog.locator(".cx-val").filter({ has: page.locator(".cx-facet-value").filter({ hasText: /^Berlin$/ }) });
  const count = Number((await berlin.locator(".cx-val-n").textContent()).replace(/[^0-9]/g, ""));
  await dialog.getByRole("checkbox", { name: "Select all values", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Select all values", exact: true }).uncheck();
  await berlin.locator("input").check();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await paging(page)).matched).toBe(count);
    const current = await serverWindow(page);
  expect(current.page.items.every(item => item.cells.site === "Berlin")).toBe(true);
  expect(current.page.items.map(item => item.id)).toEqual(current.shown.slice(0, current.page.items.length));
});

test("exports every matching row through the server CSV format", async ({ page }) => {
  await open(page);
  await page.evaluate(api => eval(api).setQuery({ search: "ams-" }), api);
  await expect.poll(async () => (await paging(page)).matched).toBeLessThan(rows);
  const matched = (await paging(page)).matched;
  await openGridControl(page, "export");
  await page.locator(".cx-grid-export").getByRole("combobox").selectOption("filtered");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV from server (all matching rows)", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const lines = fs.readFileSync(await file.path(), "utf8").replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toBe("Machine,Site,Operating system,Model,Cores,Memory (GB),Online,Last seen,Team");
  expect(lines.length).toBe(matched + 1);
  expect(lines.slice(1).every(line => line.startsWith("ams-"))).toBe(true);
});

test("grouped pages follow the server summary's group ranges", async ({ page }) => {
  await open(page, "/by-site");
  const summary = await page.evaluate(api => eval(api).getSummary(), api);
  expect(summary.matched).toBe(rows);
  expect(summary.groups.map(group => group.value)).toEqual(["Amsterdam", "Austin", "Berlin", "Singapore", "Sydney", "São Paulo", "Toronto", "Warsaw", null]);
  expect(summary.groups.reduce((sum, group) => sum + group.count, 0)).toBe(rows);
  await expect(page.locator(".cx-row").filter({ hasText: "Amsterdam" }).first()).toBeVisible();
  await nextFrames(page);
});

test("rejects invalid requests with typed client errors", async ({ page }) => {
  await page.goto(base + "/");
  const answer = await page.evaluate(async () => {
    const response = await fetch("/api/machines/query", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: [{ column: "password", operator: "eq", values: ["x"] }] }) });
    return { status: response.status, body: await response.json() };
  });
  expect(answer.status).toBe(400);
  expect(answer.body.error).toBe("unknownColumn");
  expect(JSON.stringify(answer.body)).not.toContain(" at ");
});

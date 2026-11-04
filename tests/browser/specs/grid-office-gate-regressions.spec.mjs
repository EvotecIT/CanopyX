import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { repo, openGridControl } from "./support.mjs";
import { definition, open } from "./grid-grouping-fixtures.mjs";

const office = () => readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-office-export.js"), "utf8");
const pivotParts = () => ["buckets", "values", "pivot"].map(name =>
  readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");

test("pivot Office delivery writes the accepted hierarchy and exposes workbook and PDF menu actions", async ({ page }, info) => {
  const view = definition(), errors = [], downloads = [];
  delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.exportFormats = ["xlsx", "pdf"];
  view.rows.forEach((row, index) => { row.cells.customer = "Customer " + (1000 + index); });
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }, { column: "customer", direction: "asc" }],
    columns: [{ column: "items", direction: "asc" }, { column: "status", direction: "asc" }], values: ["total"], maxColumns: 3 };
  page.on("pageerror", error => errors.push(error.message)); page.on("download", value => downloads.push(value));
  await open(page, view, pivotParts());
  await page.addScriptTag({ content: office() });
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, outputs = [];
    const accepted = grid.getPivotResult();
    const row = accepted.rows.find(item => item.path.length === 1);
    const column = accepted.columns.find(item => item.path.length === 1);
    await grid.setPivotCollapsed("rows", row.key, true);
    await grid.setPivotCollapsed("columns", column.key, true);
    const capture = grid.prepareExport({ scope: "filtered", pivot: true, values: "raw" }), rows = [];
    for await (const item of capture.rows()) rows.push(item);
    for (const format of ["xlsx", "pdf"]) {
      const output = await grid.exportAs(format, { scope: "filtered", pivot: true, download: false });
      outputs.push({ format, bytes: [...new Uint8Array(await output.blob.arrayBuffer())] });
    }
    return { request: capture.request, rows, outputs };
  });
  expect(result.request.pivot).toBeTruthy();
  expect(result.rows.some(row => row.hidden)).toBe(true);
  for (const output of result.outputs) {
    const bytes = Buffer.from(output.bytes), file = info.outputPath("pivot-office." + output.format);
    expect(bytes.subarray(0, output.format === "xlsx" ? 2 : 5).toString()).toBe(output.format === "xlsx" ? "PK" : "%PDF-");
    await fs.writeFile(file, bytes);
    await fs.writeFile(file + ".json", JSON.stringify({ ...result.request,
      expectedCount: result.rows.length, rows: result.rows }, null, 2));
    await info.attach("pivot-office-" + output.format, { path: file });
  }
  await openGridControl(page, "export");
  const panel = page.locator(".cx-grid-export .cx-grid-panel");
  await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true }).click();
  const menuFile = info.outputPath("pivot-menu.xlsx");
  await (await downloaded).saveAs(menuFile);
  await fs.writeFile(menuFile + ".json", JSON.stringify({ ...result.request,
    expectedCount: result.rows.length, rows: result.rows }, null, 2));
  await info.attach("pivot-menu-workbook", { path: menuFile });
  for (const scope of ["selected", "all"]) {
    await panel.locator("select").selectOption(scope);
    await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "PDF", exact: true })).toBeDisabled();
  }
  await panel.locator("select").selectOption("filtered");
  await expect(panel.getByRole("button", { name: "PDF", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setPivot(false));
  await openGridControl(page, "export");
  await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  expect(downloads).toHaveLength(1); expect(errors).toEqual([]);
});

test("default-width text date and number columns produce a complete PDF through the real Office writer", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = definition(), errors = [];
  view.reporting = {}; view.exportFormats = ["pdf"];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, view);
  await page.addScriptTag({ content: office() });
  const result = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx;
    const capture = grid.prepareExport({ scope: "filtered" }), rows = [];
    for await (const row of capture.rows()) rows.push(row);
    const output = await grid.exportAs("pdf", { scope: "filtered", download: false });
    return { request: capture.request, rows, bytes: [...new Uint8Array(await output.blob.arrayBuffer())] };
  });
  expect(result.request.columns.map(column => column.kind)).toEqual(["text", "text", "text", "text", "datetime", "number", "number"]);
  expect(result.rows).toHaveLength(48);
  expect(Buffer.from(result.bytes.slice(0, 5)).toString()).toBe("%PDF-");
  const file = info.outputPath("default-widths.pdf"), contract = file + ".json";
  await fs.writeFile(file, Buffer.from(result.bytes));
  await fs.writeFile(contract, JSON.stringify({ ...result.request, expectedCount: 48, rows: result.rows,
    requirements: { recordIdentityPattern: "SO-\\d{4}", landscape: false } }, null, 2));
  await info.attach("default-widths-pdf", { path: file });
  await info.attach("default-widths-contract", { path: contract, contentType: "application/json" });
  expect(errors).toEqual([]);
});

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { repo, openGridControl } from "./support.mjs";
import { definition, open } from "./grid-grouping-fixtures.mjs";

const office = () => readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-office-export.js"), "utf8");
const pivotParts = () => ["buckets", "values", "pivot"].map(name =>
  readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");

test("pivot Office delivery rejects explicitly and hides its menu choices until the writer is supported", async ({ page }) => {
  const view = definition(), errors = [], downloads = [];
  delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
  view.exportFormats = ["xlsx", "pdf"];
  view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }], columns: [], values: ["total"] };
  page.on("pageerror", error => errors.push(error.message)); page.on("download", value => downloads.push(value));
  await open(page, view, pivotParts());
  await page.addScriptTag({ content: office() });
  const results = await page.evaluate(async () => {
    const grid = document.querySelector("[data-canopyx-host]").canopyx, messages = [];
    for (const format of ["xlsx", "pdf"]) {
      try { await grid.exportAs(format, { scope: "filtered", pivot: true, download: false }); messages.push("accepted"); }
      catch (error) { messages.push(error.message); }
    }
    return messages;
  });
  expect(results).toEqual(Array(2).fill("CanopyX: pivot XLSX/PDF export is not supported yet."));
  await openGridControl(page, "export");
  const panel = page.locator(".cx-grid-export .cx-grid-panel");
  await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "PDF", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setPivot(false));
  await openGridControl(page, "export");
  await expect(panel.getByRole("button", { name: "Excel workbook (.xlsx)", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  expect(downloads).toHaveLength(0); expect(errors).toEqual([]);
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

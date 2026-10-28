import path from "node:path";
import { test, expect } from "@playwright/test";
import { measureResourceColumns } from "../bench/calendar-resource-benchmark.mjs";

test("resource column baseline and current at normal and 4x CPU @benchmark", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling requires Chromium.");
  test.setTimeout(240000);
  const out = process.env.CANOPYX_BENCH_OUTPUT;
  test.skip(!out, "Set CANOPYX_BENCH_OUTPUT to a task-owned output folder.");
  const report = await measureResourceColumns(browser, path.join(out, "calendar-resource-columns.json"));
  expect(report.cases).toHaveLength(24);
  for (const item of report.cases.filter(item => item.candidate === "current" && item.count >= 48)) {
    expect(item.samples.every(sample => sample.resources > 0 && sample.resources <= 24 && sample.slots <= 480 && sample.visibleEvents > 0 && sample.logicalEvents === item.count)).toBe(true);
  }
});

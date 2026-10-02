// The runtime folds query words with the same rules the C# bundle writer files index words under. Both are checked
// against tests/fixtures/search-folding.json: the .NET tests on net10.0 and net472, this test in the browser.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { repo, runtimeAssets } from "./support.mjs";

test("the runtime folds every code unit like the shared table", async ({ page }) => {
  const table = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/search-folding.json"), "utf8")).folds;
  expect(table.length).toBeGreaterThan(1000);
  // The folding code is private to the runtime, so the test runs that section of the shipped script on its own.
  const { script } = runtimeAssets();
  const start = script.indexOf("const EXTRA_FOLD_PAIRS");
  const end = script.indexOf("function foldUnit");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  await page.setContent("<!DOCTYPE html><title>Folding</title>");
  const mismatches = await page.evaluate(({ source, folds }) => {
    const foldCode = new Function(source + "\nreturn foldCode;")();
    const expected = new Map(folds);
    const out = [];
    for (let unit = 0; unit <= 0xFFFF; unit++) {
      const want = expected.has(unit) ? expected.get(unit) : unit;
      if (foldCode(unit) !== want) {
        out.push("U+" + unit.toString(16).toUpperCase().padStart(4, "0"));
      }
    }
    return out;
  }, { source: script.slice(start, end), folds: table });
  expect(mismatches).toEqual([]);
});

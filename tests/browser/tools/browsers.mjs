// Runs the browser tests in the engines it is given, on any shell:
//   node tools/browsers.mjs all [playwright test arguments]         (chromium, firefox and webkit)
//   node tools/browsers.mjs firefox,webkit [playwright test arguments]
// It sets CANOPYX_TEST_BROWSERS for one run; playwright.config.mjs reads it. Without this, the tests run in Chromium.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [engines, ...rest] = process.argv.slice(2);
if (!engines) {
  console.error("Usage: node tools/browsers.mjs <all|chromium,firefox,webkit> [playwright test arguments]");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "node_modules/@playwright/test/cli.js"), "test", ...rest],
  { cwd: root, stdio: "inherit", env: { ...process.env, CANOPYX_TEST_BROWSERS: engines } });
process.exit(result.status ?? 1);

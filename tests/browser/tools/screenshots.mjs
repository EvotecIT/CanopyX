// Refreshes the README screenshots in docs/images from the generated examples:
//   node tools/screenshots.mjs        (after ./Build.ps1 -SkipPack, or with CANOPYX_EXAMPLES set)
import { chromium } from "@playwright/test";
import path from "node:path";
import { exampleUrl, repo } from "../specs/support.mjs";

const out = path.join(repo, "docs/images");
const browser = await chromium.launch({ channel: process.env.CANOPYX_BROWSER_CHANNEL || undefined });

async function treeGrid(theme, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, colorScheme: theme });
  await page.goto(exampleUrl("inline.html"));
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    await api.expandPath(["share-a", "share-a/d0", "share-a/d0/p0", "share-a/d0/p0/f0", "share-a/d0/p0/f0/history"], { expandLast: true, select: false, focus: false });
    const version = api.visibleRows().find((r) => r.node.kind === "version");
    await api.expandPath(version.path, { expandLast: true, select: true, focus: false });
  });
  await page.evaluate(() => { document.querySelector(".cx-grid").scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}

await treeGrid("light", "tree-grid-light.png");
await treeGrid("dark", "tree-grid-dark.png");
const outline = await browser.newPage({ viewport: { width: 1100, height: 640 } });
await outline.goto(exampleUrl("outline.html"));
await outline.screenshot({ path: path.join(out, "static-outline.png") });
await browser.close();
console.log("Screenshots written to " + out);

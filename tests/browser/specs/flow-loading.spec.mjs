// A page with only forms loads no grid code (docs/flow.md#packaging-and-size): the flow entry point and the forms and flow
// parts, inline in a single-file page or as files beside the entry point. Grid pages know the flow parts too:
// CanopyX.createFlow there loads the flow part on first use.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import { examples, exampleUrl, repo, trackScriptLoads } from "./support.mjs";
import { openFlow, waitForFlow, field, next, stepTitle } from "./flow-support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const read = name => fs.readFileSync(path.join(assets, name), "utf8").replace(/\r\n/g, "\n");

/** Records every request and every script element the page adds. */
async function record(page) {
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  const scripts = await trackScriptLoads(page);
  return async () => [...requests, ...await scripts()];
}

test("a single-file flow page carries its parts inline and loads no grid code", async ({ page }) => {
  const loads = await record(page);
  await openFlow(page, "flow-mail-server.html");
  await field(page, "host").locator("input").fill("smtp.example.com");
  await next(page);
  await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
  const loaded = await loads();
  expect(loaded.filter(url => /canopyx-grid|canopyx-reporting|canopyx-interactive|canopyx\.(?:[0-9a-f]{16}\.)?js/.test(url))).toEqual([]);
  expect(loaded.filter(url => /\.js(\?|$)/.test(url))).toEqual([]);
  const api = await page.evaluate(() => ({ createFlow: typeof window.CanopyX.createFlow, createDataGrid: typeof window.CanopyX.createDataGrid,
    createTreeGrid: typeof window.CanopyX.createTreeGrid, payloads: [...document.querySelectorAll('script[type^="application/x-canopyx-"]')].map(script => script.type).sort() }));
  expect(api).toEqual({ createFlow: "function", createDataGrid: "undefined", createTreeGrid: "undefined",
    payloads: ["application/x-canopyx-flow", "application/x-canopyx-flow-style", "application/x-canopyx-forms", "application/x-canopyx-forms-style"] });
});

test("a flow page with external assets loads the entry point and its two parts only", async ({ page }, testInfo) => {
  // The page a host writes with external assets under plain names: the entry point, its stylesheet and the parts beside them
  // (CanopyHtmlAssets.WriteTo with CanopyAssetNaming.Plain and CanopyRuntime.Flow). The entry point loads its parts under its
  // own naming, so a plain entry point asks for canopyx-forms.js and canopyx-flow.js.
  const folder = testInfo.outputPath("external");
  fs.mkdirSync(folder, { recursive: true });
  for (const name of ["canopyx-flow-entry.js", "canopyx-flow-entry.css"]) fs.writeFileSync(path.join(folder, name), read(name));
  for (const part of ["forms", "flow"]) for (const extension of [".js", ".css"]) {
    const text = read("canopyx-" + part + extension);
    fs.writeFileSync(path.join(folder, "canopyx-" + part + extension), text);
  }
  const single = fs.readFileSync(path.join(examples, "flow-mail-server.html"), "utf8");
  const fragment = /<div class="cx-host cx-flow-host"[\s\S]*?<\/script><\/div>/.exec(single)[0];
  fs.writeFileSync(path.join(folder, "index.html"), "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>External flow</title>" +
    "<link rel=\"stylesheet\" href=\"canopyx-flow-entry.css\"><script src=\"canopyx-flow-entry.js\" defer></script></head><body><main>" + fragment + "</main></body></html>");
  const loads = await record(page);
  await page.goto(pathToFileURL(path.join(folder, "index.html")).href);
  await waitForFlow(page);
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
  const scripts = [...new Set((await loads()).filter(url => /\.js(\?|$)/.test(url)).map(url => path.basename(new URL(url).pathname)))].sort();
  expect(scripts).toEqual(["canopyx-flow-entry.js", "canopyx-flow.js", "canopyx-forms.js"]);
  expect(await page.evaluate(() => typeof window.CanopyX.createDataGrid)).toBe("undefined");
});

test("a grid page creates a flow and loads the flow part on first use", async ({ page }) => {
  const loads = await record(page);
  // A grid page whose entry point is a file with its parts beside it (enhance-assets/canopyx-grid.js).
  await page.goto(exampleUrl("enhance-table.html"));
  await page.waitForFunction(() => typeof window.CanopyX?.createFlow === "function");
  const before = await page.evaluate(() => [...document.querySelectorAll('script[type="application/x-canopyx-flow"]')].length);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "late-flow";
    document.body.appendChild(host);
    window.CanopyX.createFlow(host, { flow: { kind: "flow", version: 1, id: "late", title: "A late flow", steps: [
      { id: "one", title: "What is it called?", fields: [{ id: "name", type: "text", label: "Name", required: true }] }, { id: "review", type: "review" }] } });
  });
  await page.waitForSelector("#late-flow[data-cx-ready]");
  await expect(page.locator("#late-flow .cx-flow-step-title")).toHaveText("What is it called?");
  await page.locator("#late-flow .cx-flow-next").click();
  await expect(page.locator("#late-flow [data-cx-field=name] .cx-flow-error")).toHaveText("Name is required.");
  // The page carried no flow payload, so the part came from the file beside the runtime.
  expect(before).toBe(0);
  const loaded = await loads();
  expect(loaded.some(url => /enhance-assets\/canopyx-flow\.js$/.test(url))).toBe(true);
  expect(loaded.some(url => /enhance-assets\/canopyx-forms\.js$/.test(url))).toBe(true);
  expect(await page.evaluate(() => typeof window.CanopyX.createDataGrid)).toBe("function");
});

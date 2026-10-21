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

/**
 * Writes the page a host writes with external assets under plain names: the entry point, its stylesheet and every flow part
 * beside them (CanopyHtmlAssets.WriteTo with CanopyAssetNaming.Plain and CanopyRuntime.Flow), around the flow of a
 * single-file example. The entry point loads its parts under its own naming, so a plain entry point asks for
 * canopyx-forms.js, canopyx-flow.js and canopyx-flow-<feature>.js.
 */
function externalPage(testInfo, example) {
  const folder = testInfo.outputPath("external");
  fs.mkdirSync(folder, { recursive: true });
  for (const name of fs.readdirSync(assets).filter(name => /^canopyx-(?:flow|flow-[a-z]+|forms)\.(?:js|css)$/.test(name))) fs.writeFileSync(path.join(folder, name), read(name));
  const single = fs.readFileSync(path.join(examples, example), "utf8");
  const fragment = /<div class="cx-host cx-flow-host"[\s\S]*?<\/script><\/div>/.exec(single)[0];
  fs.writeFileSync(path.join(folder, "index.html"), "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>External flow</title>" +
    "<link rel=\"stylesheet\" href=\"canopyx-flow-entry.css\"><script src=\"canopyx-flow-entry.js\" defer></script></head><body><main>" + fragment + "</main></body></html>");
  // The parts the single-file page carries inline: the ones C# chose for this flow.
  const inline = [...single.matchAll(/type="application\/x-canopyx-([a-z-]+?)(?:-style)?"/g)].map(match => "canopyx-" + match[1] + ".js");
  return { url: pathToFileURL(path.join(folder, "index.html")).href, inline: [...new Set(inline)].sort() };
}
const scriptNames = urls => [...new Set(urls.filter(url => /\.js(\?|$)/.test(url)).map(url => path.basename(new URL(url).pathname)))].sort();

test("a flow page with external assets loads the entry point and its two parts only", async ({ page }, testInfo) => {
  // Every host-connected feature part sits beside the entry point; a plain form fetches none of them.
  const external = externalPage(testInfo, "flow-mail-server.html");
  const loads = await record(page);
  await page.goto(external.url);
  await waitForFlow(page);
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
  expect(scriptNames(await loads())).toEqual(["canopyx-flow-entry.js", "canopyx-flow.js", "canopyx-forms.js"]);
  expect(external.inline).toEqual(["canopyx-flow.js", "canopyx-forms.js"]);
  expect(await page.evaluate(() => typeof window.CanopyX.createDataGrid)).toBe("undefined");
});

test("a host-connected flow with external assets loads the feature parts it uses, the same ones C# embeds", async ({ page }, testInfo) => {
  // The mail checks flow uses server checks, host options, a records field, drafts and presets, the host's preview, the
  // equivalent command and deep links, with the flow-host part they share; never a picker, a task list, a dialog, an
  // endpoint or a typed confirmation.
  const external = externalPage(testInfo, "flow-mail-checks.html");
  const loads = await record(page);
  await page.goto(external.url);
  await waitForFlow(page);
  const scripts = scriptNames(await loads());
  expect(scripts).toEqual(["canopyx-flow-checks.js", "canopyx-flow-command.js", "canopyx-flow-drafts.js", "canopyx-flow-entry.js", "canopyx-flow-host.js",
    "canopyx-flow-links.js", "canopyx-flow-options.js", "canopyx-flow-preview.js", "canopyx-flow-records.js", "canopyx-flow.js", "canopyx-forms.js"]);
  expect(scripts.filter(name => name !== "canopyx-flow-entry.js")).toEqual(external.inline);
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

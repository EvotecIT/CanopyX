import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { repo, examples, nextFrames } from "./support.mjs";

let server, address;
test.beforeAll(async () => {
  const html = fs.readFileSync(path.join(examples, "shared-tokens.html"), "utf8");
  const hostCss = fs.readFileSync(path.join(repo, "tests/fixtures/hfx-role-host.css"), "utf8");
  server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const params = new URL(request.url, "http://127.0.0.1").searchParams;
    const hosted = params.get("host") === "1" || params.get("style") === "contrast";
    let page = html;
    if (hosted) {
      page = page.replace("</head>", `<style>${hostCss}</style><script>document.documentElement.dataset.hfxStyle=${JSON.stringify(params.get("style") || "evotec")};document.documentElement.dataset.hfxMode="dark";</script></head>`);
      if (params.get("host") === "1") page = page.replace('<header>', '<header><p class="token-caption">Report workspace &middot; Records</p>');
    }
    response.end(page);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  address = "http://127.0.0.1:" + server.address().port + "/shared-tokens.html";
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

for (const frame of [
  { name: "1440-light", width: 1440, height: 1000, mode: "light", style: "evotec" },
  { name: "1440-dark", width: 1440, height: 1000, mode: "dark", style: "evotec" },
  { name: "390-dark", width: 390, height: 844, mode: "dark", style: "evotec" },
  { name: "1440-high-contrast", width: 1440, height: 1000, mode: "dark", style: "contrast" },
  { name: "1440-hfx-dark", width: 1440, height: 1000, mode: "dark", style: "evotec", host: true }
]) {
  test(`the generated shared-token gallery renders ${frame.name}`, async ({ page }, info) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: frame.width, height: frame.height });
    await page.goto(`${address}?style=${frame.style}&mode=${frame.mode}&host=${frame.host ? 1 : 0}`);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    await expect(page.locator("header h1")).toHaveText("Workspace records");
    await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toBeVisible();
    const states = page.locator('.cx-canvas .cx-row[data-cx-id]');
    await expect(states.first().locator('.p-pill.success')).toHaveText('Ready');
    expect(await states.locator('.p-state,.p-dot').count()).toBe(0);
    expect(await states.locator('.p-pill').count()).toBe(await states.count());
    await expect(page.locator("[data-canopyx-host]")).toHaveCSS("font-family", /Segoe UI Variable Text/);
    await nextFrames(page);
    const output = process.env.CANOPYX_REVIEW_FRAMES;
    if (output) fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: output ? path.join(output, frame.name + ".png") : info.outputPath(frame.name + ".png"), fullPage: true });
    const background = await page.locator("[data-canopyx-host]").evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).toBe(frame.style === "contrast" ? "rgb(10, 10, 10)" : frame.mode === "dark" ? "rgb(22, 24, 28)" : "rgb(255, 255, 255)");
    expect(errors).toEqual([]);
  });
}

test("an ordinary inline page updates density without layout assets or replacing its focused header control", async ({ page }) => {
  const layouts = [], errors = [];
  page.on("request", request => { if (/canopyx-layouts/.test(request.url())) layouts.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(address + "?mode=dark");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  const menu = page.getByRole("button", { name: "Menu for Record", exact: true });
  await menu.focus();
  await page.evaluate(() => document.documentElement.dataset.hfxDensity = "compact");
  await expect(page.locator('.cx-canvas .cx-row[data-cx-id]').first()).toHaveCSS("height", "32px");
  await nextFrames(page);
  await expect(menu).toBeFocused();
  await expect(page.locator(".cx-hrow")).toHaveCSS("height", "32px");
  expect(layouts).toEqual([]);
  expect(errors).toEqual([]);
});

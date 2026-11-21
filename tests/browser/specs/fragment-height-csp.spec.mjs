// A fragment's Height never travels as a style attribute (docs/security.md): the host carries data-cx-height and the runtime
// applies it through the style object, which a strict policy without 'unsafe-inline' allows, also when no nonce was written.
import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

const NONCE = "aGVpZ2h0LXRlc3Q";
const view = id => ({ protocol: "canopyx/2", type: "grid", id, label: id, rowHeight: 32, pageSize: 50, selection: "none", search: true, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }], rows: Array.from({ length: 40 }, (_, i) => ({ id: "r" + i, cells: { name: "Row " + i } })) });

test("a fixed and an automatic height apply under a strict policy without a style rule", async ({ page }) => {
  const { script, style } = runtimeAssets("grid");
  const host = (id, height, mount = "") => `<div class="cx-host" data-canopyx-host id="${id}" data-cx-height="${height}"${mount}><script type="application/json" class="cx-config">` +
    JSON.stringify(view(id)).replace(/</g, "\\u003c") + "</script></div>";
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Height</title><style nonce="${NONCE}">${style}</style><script nonce="${NONCE}">${script}</script></head>` +
    `<body>${host("fixed", "300px")}${host("content", "auto")}${host("later", "260px", ' data-cx-mount="manual"')}</body></html>`;
  await page.route("http://canopyx.test/height", route => route.fulfill({ contentType: "text/html", body,
    headers: { "content-security-policy": `default-src 'none'; script-src 'nonce-${NONCE}'; style-src 'nonce-${NONCE}'; img-src data:` } }));
  await page.addInitScript(() => { window.violations = []; document.addEventListener("securitypolicyviolation", event => window.violations.push(event.violatedDirective)); });
  await page.goto("http://canopyx.test/height");
  await page.waitForSelector("#fixed[data-cx-ready]");
  expect(await page.locator("#fixed").evaluate(element => element.getBoundingClientRect().height)).toBe(300);
  // A fragment that waits for its host to mount is already as tall as it will be, so the page does not move.
  expect(await page.locator("#later").evaluate(element => element.getBoundingClientRect().height)).toBe(260);
  // The heights come from the style object, never from markup; auto leaves the stylesheet's 480px default.
  expect(await page.locator("[data-canopyx-host]").evaluateAll(hosts => hosts.map(host => host.style.height))).toEqual(["300px", "auto", "260px"]);
  expect(await page.locator("#content").evaluate(element => element.getBoundingClientRect().height)).not.toBe(480);
  expect(await page.evaluate(() => window.violations)).toEqual([]);
});

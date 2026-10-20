// Strict Content Security Policy and Trusted Types (docs/security.md). The pages in csp/ are written with the nonce
// placeholder of CanopyX.Examples/CspExamples.cs; this server puts a fresh nonce in its place in every response and sends
// the policy as a header, as a real server would. A test fails on any securitypolicyviolation event, any console report of
// a refused script or style, and any page error, while it loads each page and the lazy parts: the tree tools, export,
// filter editor, history, search and links parts, sidecar files, html details, icons and the print outline.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { examples, nextFrames } from "./support.mjs";

const ORIGIN = "http://canopyx.test";
const PLACEHOLDER = "CANOPYXNONCE";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
// The policy in the brief, and a stricter one without 'self', under which every inserted element needs the nonce.
const POLICIES = {
  "self and nonce": nonce => `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'`,
  "nonce only": nonce => `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; object-src 'none'; base-uri 'none'`
};
const TRUSTED_TYPES = nonce => POLICIES["nonce only"](nonce) + "; require-trusted-types-for 'script'; trusted-types canopyx";

/** Serves the examples folder at ORIGIN with the policy; returns what the page reported. */
async function serve(page, policy, { nonceInMarkup = true, transform = html => html } = {}) {
  const report = { console: [], errors: [] };
  await page.route(ORIGIN + "/**", async route => {
    const url = new URL(route.request().url());
    const file = path.normalize(path.join(examples, decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.normalize(examples)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" });
    const extension = path.extname(file);
    const headers = { "content-type": TYPES[extension] || "application/octet-stream" };
    let body = fs.readFileSync(file);
    if (extension === ".html") {
      const nonce = crypto.randomBytes(18).toString("base64");
      body = transform(body.toString("utf8").replaceAll(PLACEHOLDER, nonceInMarkup ? nonce : crypto.randomBytes(18).toString("base64")));
      headers["content-security-policy"] = policy(nonce);
    }
    return route.fulfill({ status: 200, headers, body });
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => window.__cspViolations.push(
      event.effectiveDirective + " " + (event.blockedURI || "") + " " + (event.sample || "").slice(0, 60)));
  });
  page.on("console", message => { if (/Content Security Policy|Trusted Type|Refused to/i.test(message.text())) report.console.push(message.text()); });
  page.on("pageerror", error => report.errors.push(error.message));
  report.violations = () => page.evaluate(() => window.__cspViolations);
  return report;
}

async function open(page, name) {
  await page.goto(ORIGIN + "/csp/" + name);
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

async function expectClean(page, report) {
  await nextFrames(page);
  expect(await report.violations()).toEqual([]);
  expect(report.console).toEqual([]);
  expect(report.errors).toEqual([]);
}

/** The tree page's parts: tree tools on mount, deep links, the Export menu, icons, the html detail and the print outline. */
async function exerciseTree(page) {
  const host = page.locator(".cx-host").first();
  await expect(host.locator(".cx-icon svg").first()).toBeAttached();
  await expect(host.locator(".csp-note strong")).toHaveText("host");
  await host.locator('.cx-row[data-cx-id="notes/readme"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toBe("");
  await host.getByText("Export", { exact: true }).click();
  await expect(page.getByRole("menuitem").or(page.getByRole("button", { name: /CSV/ })).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(host.locator(".cx-outline table.cx-outline-table")).toBeAttached();
  expect(await host.locator(".cx-outline td").first().evaluate(td => td.style.paddingLeft)).toBe("4px");
}

/** The grid page's parts: history presenters on load, the column menu and Filters (filter editor), the Export menu and CSV. */
async function exerciseGrid(page, root = page.locator(".cx-data-grid").first()) {
  await expect(root.locator(".cx-row[data-cx-id] svg").first()).toBeAttached();
  await root.locator(".cx-grid-column-menu").first().click();
  await expect(page.locator(".cx-column-menu [role=menuitem]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  const csv = await root.evaluate(element => element.closest("[data-canopyx-host]").canopyx.toCsv({ scope: "filtered" }));
  expect(csv.split("\r\n")[0]).toContain("Record");
}

for (const [label, policy] of Object.entries(POLICIES)) {
  test.describe(`under a strict policy (${label})`, () => {
    test("an inline tree page loads its parts, icons, html detail and print outline without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "tree.html");
      await exerciseTree(page);
      await expectClean(page, report);
    });

    test("an inline interactive tree checks rows without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "interactive.html");
      const check = page.locator(".cx-check").first();
      await check.click();
      await expect(check).toBeChecked();
      await expectClean(page, report);
    });

    test("an inline grid loads its history, filter editor and export parts without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "grid.html");
      await exerciseGrid(page);
      await page.locator(".cx-grid-filters > summary").click();
      await expect(page.locator(".cx-grid-filters .cx-grid-panel")).toBeVisible();
      await expectClean(page, report);
    });

    test("a matrix loads its part, draws its cells and opens a cell's details without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "matrix.html");
      await expect(page.locator(".cx-mx-row canvas").first()).toBeAttached();
      await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.focusCell("srv01", "dns"));
      await page.keyboard.press("Enter");
      await expect(page.locator("dialog.cx-mx-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      await expect(page.locator(".cx-mx-print table")).toBeAttached();
      await expectClean(page, report);
    });

    test("a bundle loads external assets, part files, sidecar files and the search part without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await open(page, "bundle/index.html");
      const host = page.locator(".cx-host").first();
      const share = host.locator(".cx-row[aria-level='1'][aria-expanded='false']").first();
      await share.locator(".cx-exp").click();
      await expect(host.locator(".cx-row[aria-level='2']").first()).toBeVisible();
      await page.getByRole("combobox").fill("budget");
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await host.getByText("Export", { exact: true }).click();
      await expectClean(page, report);
    });

    test("fragments sharing one document take their nonced heights and parts without a violation", async ({ page }) => {
      const report = await serve(page, policy);
      await page.setViewportSize({ width: 1400, height: 900 });
      await open(page, "fragments.html");
      await expect(page.locator("[data-canopyx-host][data-cx-ready]")).toHaveCount(2);
      // The grid takes its 60vh; the tree is as tall as its rows up to its 50vh. Both rules came in nonced style elements.
      const heights = await page.locator("[data-canopyx-host]").evaluateAll(hosts => hosts.map(host => Math.round(host.getBoundingClientRect().height)));
      expect(heights[0]).toBeLessThanOrEqual(450);
      expect(heights[1]).toBe(540);
      expect(await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).map(rule => rule.selectorText)
        .filter(selector => selector?.startsWith("[data-cx-height")))).toEqual(['[data-cx-height="50vh"]', '[data-cx-height="60vh"]']);
      await exerciseGrid(page);
      await expectClean(page, report);
    });
  });
}

test("the harness reports a violation when the markup's nonce is not the response's", async ({ page }) => {
  const report = await serve(page, POLICIES["nonce only"], { nonceInMarkup: false });
  await page.goto(ORIGIN + "/csp/tree.html");
  await expect.poll(async () => (await report.violations()).length).toBeGreaterThan(0);
});

test("a part file inserted with a wrong page nonce is refused, so the runtime's own nonce is what lets part files in", async ({ page }) => {
  const report = await serve(page, POLICIES["nonce only"]);
  // CanopyX.setNonce runs as the runtime defines its global, before the first view mounts and loads the tree tools file.
  await page.addInitScript(() => {
    let value;
    Object.defineProperty(window, "CanopyX", { configurable: true, get: () => value, set: runtime => { value = runtime; runtime.setNonce("d3JvbmdOb25jZQ=="); } });
  });
  await page.goto(ORIGIN + "/csp/bundle/index.html");
  await expect.poll(async () => (await report.violations()).join("\n")).toContain("canopyx-tree-tools");
});

test("a part payload injected into the page without the nonce never runs, also under 'strict-dynamic'", async ({ page }) => {
  // The injected payload comes first in the document and has the export part's real version.
  const inject = html => html.replace('<main class="cx-main">', '<main class="cx-main"><script type="application/x-canopyx-export" data-cx-version="' +
    (html.match(/type="application\/x-canopyx-export" data-cx-version="([a-f0-9]{16})"/) || [])[1] + '">window.__injected = true;</script>');
  const report = await serve(page, nonce => POLICIES["nonce only"](nonce).replace("script-src", "script-src 'strict-dynamic'"), { transform: inject });
  await open(page, "tree.html");
  await page.locator(".cx-host").getByText("Export", { exact: true }).click();
  await expect(page.getByRole("button", { name: /CSV/ }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await expectClean(page, report);
});

test.describe("under require-trusted-types-for 'script'", () => {
  test("a tree writes its html detail, icons and parts through the canopyx policy", async ({ page }) => {
    const report = await serve(page, TRUSTED_TYPES);
    await open(page, "tree.html");
    await exerciseTree(page);
    await expectClean(page, report);
    // Without the policy, the same markup sink is refused: the page really enforces Trusted Types.
    const refused = await page.evaluate(() => { try { document.createElement("div").innerHTML = "<b>x</b>"; return false; } catch (error) { return error instanceof TypeError; } });
    expect(refused).toBe(true);
  });

  test("a grid, the interactive tree, a bundle and shared fragments load every part through the canopyx policy", async ({ page }) => {
    const report = await serve(page, TRUSTED_TYPES);
    await open(page, "grid.html");
    await exerciseGrid(page);
    await open(page, "interactive.html");
    await page.locator(".cx-check").first().click();
    await open(page, "bundle/index.html");
    await page.getByRole("combobox").fill("budget");
    await expect(page.getByRole("option").first()).toBeVisible();
    await open(page, "fragments.html");
    await exerciseGrid(page);
    await expectClean(page, report);
  });

  test("a sanitizeHtml host option that returns TrustedHTML from its own policy is written without the canopyx policy", async ({ page }) => {
    const report = await serve(page, nonce => POLICIES["nonce only"](nonce) + "; require-trusted-types-for 'script'; trusted-types canopyx host");
    // Counts the HTML the canopyx policy is asked for.
    await page.addInitScript(() => {
      window.__canopyxHtml = 0;
      const create = trustedTypes.createPolicy.bind(trustedTypes);
      trustedTypes.createPolicy = (name, rules) => create(name, name === "canopyx" ? { ...rules, createHTML: text => (window.__canopyxHtml++, rules.createHTML(text)) } : rules);
    });
    await page.goto(ORIGIN + "/csp/tree.html");
    await page.waitForSelector("[data-cx-ready]");
    const result = await page.evaluate(async () => {
      const policy = trustedTypes.createPolicy("host", { createHTML: text => text.replace(/<strong>/g, "<em>").replace(/<\/strong>/g, "</em>") });
      const seed = document.querySelector("[data-canopyx-host]"), view = JSON.parse(seed.querySelector("script.cx-config").textContent);
      // A repaint of the original tree must not contribute to this host's policy counter.
      await seed.canopyx.ready; seed.canopyx.destroy(); seed.remove();
      const host = document.createElement("div");
      host.style.height = "300px";
      document.body.appendChild(host);
      const calls = [], before = window.__canopyxHtml;
      const api = CanopyX.createTreeGrid(host, { view: { ...view, id: "sanitized", stateKey: undefined, deepLink: false },
        sanitizeHtml: (html, context) => { calls.push(context.kind); return policy.createHTML(html); } });
      await api.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { calls: [...new Set(calls)].sort(), em: host.querySelector(".csp-note em")?.textContent, strong: !!host.querySelector(".csp-note strong"), canopyxHtml: window.__canopyxHtml - before };
    });
    expect(result).toEqual({ calls: ["detail", "icon"], em: "host", strong: false, canopyxHtml: 0 });
    await expectClean(page, report);
  });
});

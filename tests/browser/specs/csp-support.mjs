// The strict Content Security Policy harness the csp specs share (docs/security.md). serve() fulfils every request under
// ORIGIN from the examples folder, puts a fresh nonce in place of the CspExamples placeholder in every HTML response, and
// sends the policy as a header, as a real server would. The report collects securitypolicyviolation events, console
// reports of a refused script or style, and page errors.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { expect } from "@playwright/test";
import { examples, nextFrames, settleGrid } from "./support.mjs";

export const ORIGIN = "http://canopyx.test";
export const PLACEHOLDER = "CANOPYXNONCE";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
// The policy in the brief, and a stricter one without 'self', under which every inserted element needs the nonce.
// SELF has no nonce and no hash: every script and stylesheet of the page has to be a file from the same origin.
export const SELF = () => "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'";
/** A policy that allows the page's inline scripts and stylesheets by their SHA-256 hashes only, as a host serving a single file would. */
export const HASHES = (nonce, html) => {
  const hash = text => "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'";
  const scripts = [...html.matchAll(/<script(?![^>]*\b(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => hash(match[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => hash(match[1]));
  return `default-src 'self'; script-src ${[...new Set(scripts)].join(" ")}; style-src ${[...new Set(styles)].join(" ")}; font-src 'self' data:; object-src 'none'; base-uri 'none'`;
};
export const POLICIES = {
  "self and nonce": nonce => `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; font-src 'self' data:; object-src 'none'; base-uri 'none'`,
  "nonce only": nonce => `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src 'self' data:; object-src 'none'; base-uri 'none'`
};
export const TRUSTED_TYPES = nonce => POLICIES["nonce only"](nonce) + "; require-trusted-types-for 'script'; trusted-types canopyx";

/** Serves the examples folder at ORIGIN with the policy; returns what the page reported. */
export async function serve(page, policy, { nonceInMarkup = true, transform = html => html } = {}) {
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
      headers["content-security-policy"] = policy(nonce, body);
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

export async function open(page, name) {
  await page.goto(ORIGIN + "/csp/" + name);
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

export async function expectClean(page, report) {
  await nextFrames(page);
  expect(await report.violations()).toEqual([]);
  expect(report.console).toEqual([]);
  expect(report.errors).toEqual([]);
}

/** The tree page's parts: tree tools on mount, deep links, the Export menu, icons, the html detail and the print outline. */
export async function exerciseTree(page) {
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
export async function exerciseGrid(page, root = page.locator(".cx-data-grid").first()) {
  await expect(root.locator(".cx-row[data-cx-id] svg").first()).toBeAttached();
  await root.scrollIntoViewIfNeeded();
  await settleGrid(page);
  await root.locator(".cx-grid-column-menu").first().click();
  await expect(page.locator(".cx-column-menu [role=menuitem]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  const csv = await root.evaluate(element => element.closest("[data-canopyx-host]").canopyx.toCsv({ scope: "filtered" }));
  expect(csv.split("\r\n")[0]).toContain("Record");
}


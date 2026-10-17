// Helpers for the progressive enhancement and simple init tests: a page served from a test origin that loads the grid
// runtime as a plain script, with its parts beside it, the way a page loads it from a CDN.
import fs from "node:fs";
import path from "node:path";
import { repo } from "./support.mjs";

const ASSETS = path.join(repo, "CanopyX.Html/Assets");
export const ORIGIN = "http://canopyx.test";

/** Serves body under ORIGIN with the grid runtime (or reporting runtime) and its part files; returns the page's address. */
export async function servePage(page, body, { runtime = "grid", lang = "en", head = "" } = {}) {
  const html = "<!DOCTYPE html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>CanopyX enhance test</title><link rel=\"stylesheet\" href=\"/canopyx-" + runtime + ".css\"><script src=\"/canopyx-" + runtime + ".js\"></script>" + head +
    "<style>body{margin:16px;font:14px system-ui}</style></head><body>" + body + "</body></html>";
  await page.route(ORIGIN + "/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/" || url.pathname === "/index.html") return route.fulfill({ contentType: "text/html", body: html });
    const file = path.join(ASSETS, path.basename(url.pathname));
    if (/^\/canopyx-[\w-]+\.(?:js|css)$/.test(url.pathname) && fs.existsSync(file)) return route.fulfill({ path: file });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(ORIGIN + "/");
  return ORIGIN + "/";
}

/** A table of servers: two header rows, row headers, sort and search attributes, markup, a footer and a caption. */
export function serverTable({ rows = 30, attributes = "", columnAttributes = {} } = {}) {
  const sites = ["Warsaw", "Berlin", "Madrid"], codes = ["WAW", "BER", "MAD"];
  const body = Array.from({ length: rows }, (_, index) => {
    const load = (index * 37 + 11) % 97, memory = 4 + index * 13 % 60;
    return "<tr id=\"srv-" + (index + 1) + "\"" + (index === 2 ? " class=\"retiring\" data-tone=\"warning\"" : "") + "><th scope=\"row\">server-" + String(index + 1).padStart(2, "0") +
      "</th><td data-search=\"" + sites[index % 3] + " " + codes[index % 3] + "\">" + sites[index % 3] + "</td><td data-order=\"" + load + "\">" + load + " %</td>" +
      "<td data-sort=\"" + memory * 1024 + "\">" + memory + " GB</td><td>2026-0" + (1 + index % 9) + "-1" + index % 10 + "</td>" +
      "<td><a href=\"#srv-" + (index + 1) + "\">Open</a></td></tr>";
  }).join("");
  const th = (name, text, extra = "") => "<th" + extra + (columnAttributes[name] ? " " + columnAttributes[name] : "") + ">" + text + "</th>";
  return "<table id=\"servers\" " + attributes + "><caption>Servers by site</caption><thead><tr>" + th("name", "Server", " rowspan=\"2\"") + th("site", "Site", " rowspan=\"2\"") +
    "<th colspan=\"2\">Usage</th>" + th("seen", "Patched", " rowspan=\"2\"") + th("link", "Console", " rowspan=\"2\"") + "</tr><tr>" + th("load", "Load") + th("memory", "Memory") +
    "</tr></thead><tbody>" + body + "</tbody><tfoot><tr><th scope=\"row\">Total</th><td></td><td>avg 48 %</td><td>1,020 GB</td><td></td><td></td></tr></tfoot></table>";
}

/** Waits until a controller exists on window under name and its grid painted its first rows. */
export async function ready(page, name = "grid") {
  await page.waitForFunction(name => window[name] && document.querySelector("[data-cx-ready]"), name);
  await page.evaluate(name => window[name].ready, name);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export function rowIds(page) {
  return page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex"))
    .map(row => row.getAttribute("data-cx-id")));
}

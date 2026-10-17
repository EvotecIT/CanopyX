// Pages and views for the search highlighting and layout mode tests: a generic support ticket grid and a knowledge-base
// tree, served from https://modes.test/ with every part preloaded (support.mjs runtimeAssets).
import { runtimeAssets } from "./support.mjs";

const subjects = ["Printer queue stuck after the driver update", "Cannot sign in to the customer portal", "Invoice PDF shows the wrong address",
  "Laptop battery drains overnight", "VPN drops every few minutes", "Request a second monitor for the café desk", "Scanner saves blank pages"];
const customers = ["Zoë Martín", "José Álvarez", "Łukasz Nowak", "Anaïs Dubois", "Ana García", "Piotr Wiśniewski"];
const statuses = [["Open", "info"], ["Waiting", "warning"], ["Resolved", "success"], ["Escalated", "danger"]];

/** A ticket grid of count rows; extra is merged into the view document. */
export function ticketView(count = 120, extra = {}) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: "t" + i, cells: {
    ticket: "TCK-" + String(1000 + i), subject: subjects[i % subjects.length], customer: customers[(i * 5) % customers.length],
    status: { value: statuses[(i * 3) % 4][0], tone: statuses[(i * 3) % 4][1] }, priority: ["Low", "Normal", "High", "Urgent"][(i * 7) % 4],
    replies: (i * 11) % 23, updated: new Date(Date.UTC(2026, 9, 15, 9) - i * 3600000).toISOString(),
    link: "Article " + i, href: "https://example.test/kb/" + i } }));
  return { protocol: "canopyx/2", type: "grid", id: "tickets", label: "Support tickets", noun: "tickets", pageSize: 500, selection: "multiple", search: true, rowHeight: 34,
    columns: [
      { id: "ticket", title: "Ticket", kind: "text", sortable: true, rowHeader: true },
      { id: "subject", title: "Subject", kind: "text", sortable: true, flex: 1 },
      { id: "customer", title: "Customer", kind: "text", sortable: true },
      { id: "status", title: "Status", kind: "text", sortable: true, presenter: { kind: "enum" } },
      { id: "priority", title: "Priority", kind: "text", sortable: true },
      { id: "replies", title: "Replies", kind: "number", sortable: true },
      { id: "updated", title: "Updated", kind: "datetime", sortable: true },
      { id: "link", title: "Article", kind: "text", presenter: { kind: "link", hrefColumn: "href" } },
      { id: "href", title: "Address", kind: "text", hidden: true }],
    source: { kind: "inline" }, rows, searchHighlight: true, layout: {}, ...extra };
}

export function treeView(extra = {}) {
  const topics = [["Printing", ["Clear a stuck printer queue", "Install the printer driver", "Scan to a network folder"]],
    ["Accounts", ["Reset a password", "Sign in to the customer portal"]], ["Devices", ["Connect a second monitor", "Pair a café desk headset"]]];
  let n = 0;
  return { protocol: "canopyx/2", type: "view", id: "kb", label: "Knowledge base", rowHeight: 28, pageSize: 100, selection: "single",
    search: { minLength: 2, maxResults: 20 }, columns: [{ id: "name", title: "Article", kind: "text" }, { id: "owner", title: "Owner", kind: "text" },
      { id: "views", title: "Views", kind: "number", sortable: true }],
    source: { kind: "inline" }, searchHighlight: true, layout: {},
    roots: topics.map(([topic, items]) => ({ id: "kb-" + topic.toLowerCase(), label: topic, expanded: true,
      children: items.map(label => ({ id: "kb-" + ++n, label, cells: { owner: "Owner " + n, views: n * 37 } })) })), ...extra };
}

/** Serves a page with the views mounted; script runs before they mount. */
export async function open(page, views, { theme = "light", height = 560, script = "", runtime: forced } = {}) {
  views = Array.isArray(views) ? views : [views];
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const kind = forced || (views.some(view => view.reporting) ? "reporting" : views.some(view => view.type === "grid") ? "grid" : "tree");
  const { script: runtime, style } = runtimeAssets(kind);
  const body = views.map(view => "<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"" + theme + "\" style=\"height:" + height + "px\"><script type=\"application/json\" class=\"cx-config\">" +
    JSON.stringify(view).replace(/</g, "\\u003c") + "</script></div>").join("");
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Modes</title><style>" + style +
    "body{margin:0}main{padding:12px 16px}</style><script>" + runtime + "</script>" + (script ? "<script>" + script + "</script>" : "") +
    "</head><body class=\"cx-page\"><main>" + body + "</main></body></html>";
  await page.route("https://modes.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://modes.test/");
  if (!views.length) return;
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx.ready)));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export const api = (page, index = 0) => page.evaluateHandle(index => document.querySelectorAll("[data-canopyx-host]")[index].canopyx, index);
/** Calls an API method of the first view and returns its JSON-safe result. */
export function call(page, name, ...args) {
  return page.evaluate(async ([name, args]) => {
    const result = await document.querySelector("[data-canopyx-host]").canopyx[name](...args);
    return result === undefined ? null : JSON.parse(JSON.stringify(result));
  }, [name, args]);
}
export function settle(page) {
  return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)))));
}

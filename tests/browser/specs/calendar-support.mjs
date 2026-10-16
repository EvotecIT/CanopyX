// Shared helpers of the calendar specs (docs/calendar.md, docs/resource-timeline.md). The clock is fixed at 2026-10-16 10:30 UTC,
// the date the calendar examples open on, so "today", the now line and the first scroll position never depend on the day the
// tests run.
import fs from "node:fs";
import path from "node:path";
import { exampleUrl, nextFrames, runtimeAssets } from "./support.mjs";

export const NOW = new Date("2026-10-16T10:30:00Z");
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../..");

/** Calls api => … on the grid host with a view id (the first host without one), with an optional argument. */
export function api(page, call, arg, view) {
  return page.evaluate(([call, arg, view]) => {
    const hosts = [...document.querySelectorAll("[data-canopyx-host]")];
    const element = view ? hosts.find(host => host.canopyx && host.canopyx.view.id === view) : hosts[0];
    return new Function("api", "element", "arg", "return (" + call + ")(api, element, arg);")(element.canopyx, element, arg);
  }, [call, arg, view]);
}

/** Opens a calendar example (its -dark page with dark), with the clock fixed, and waits for the first painted range. */
export async function openCalendar(page, name, { dark = false, width = 1440, height = 900, hash = "" } = {}) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width, height });
  await page.goto(exampleUrl(name.replace(/\.html$/, dark ? "-dark.html" : ".html")) + hash);
  await page.waitForSelector("[data-cx-calendar-ready]");
  await nextFrames(page);
}

/** Saves an evidence capture when CANOPYX_EVIDENCE names a folder. */
export async function capture(page, name, options = {}) {
  if (!process.env.CANOPYX_EVIDENCE) return;
  await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png"), ...options });
}

/**
 * The calendar part's pure helpers (DataGrid.prototype.calKit), installed into a stand-in grid class in a blank page, for unit
 * checks of dates, recurrence, layout and the iCalendar writer without a grid.
 */
export async function loadKit(page) {
  await page.goto("about:blank");
  await page.addScriptTag({ content: "window.CanopyXParts = [];" });
  await page.addScriptTag({ content: fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-calendar.js"), "utf8") });
  await page.evaluate(() => {
    const [, part] = window.CanopyXParts.find(([name]) => name === "calendar");
    const FakeGrid = function () {};
    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => values && Object.hasOwn(values, key) ? String(values[key]) : match);
    part.install({ DataGrid: FakeGrid, h: tag => document.createElement(tag), setText: (element, value) => { element.textContent = value == null ? "" : String(value); }, fill,
      plural: template => template, gridButton: () => document.createElement("button"), gridIcon: () => document.createElement("span"), gridFreeze: value => Object.freeze(value),
      cellText: cell => String(cell ?? ""), cellValue: cell => cell, isCellObject: () => false, gridQuery: () => ({}), gridQueryRows: () => [], gridResultShape: () => "",
      gridPresenterTone: () => null, validateGridRows: rows => rows, validateGridPage: page => page, validStructuralCount: value => Number.isInteger(value) && value >= 0,
      checkDocument: value => value, numberFormat: lang => new Intl.NumberFormat(lang), loadPart: () => Promise.resolve(), PROTOCOL: "canopyx/2" });
    window.kit = FakeGrid.prototype.calKit;
  });
}

/** The recurrence cases the browser and the C# CanopyRecurrence both check. */
export function recurrenceCases() {
  return JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/recurrence-cases.json"), "utf8"));
}

/**
 * Builds the incidents-by-host timeline in the page: sites, roles and hosts as the resource tree (every group open), events
 * spread over the month around the fixed date, a weekly series, capacity thresholds, a change freeze, an unavailable day and
 * business hours. Options: sites, roles, hostsPerRole, events, span (days), zoom, view, editable, hosted (the events come
 * from a source with the range capability, which records each request in window.ranges), theme. The mount time is
 * window.mountedAt and the frame after the first event is painted window.firstEvents (both from performance.now()).
 */
export function timelinePage(options = {}) {
  const { script, style } = runtimeAssets("grid");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Timeline</title><style>" +
    style + " body{margin:0;padding:16px} #cal{height:760px}</style><script>" + script + "</script></head><body class=\"cx-page\"><div id=\"cal\" data-cx-theme=\"" +
    (options.theme === "dark" ? "dark" : "light") + "\"></div><script>window.timelineOptions = " + JSON.stringify(options) + ";\n(" + buildTimeline.toString() + ")();</script></body></html>";
}

/** Serves a page the test builds at http://canopyx.test/<name> and opens it with the clock fixed. */
export async function openBuilt(page, name, html, ready = "[data-cx-calendar-ready]") {
  await page.clock.setFixedTime(NOW);
  await page.route("http://canopyx.test/" + name, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/" + name);
  if (ready) await page.waitForSelector(ready, { timeout: 30000 });
}

/* global CanopyX */
function buildTimeline() {
  const o = window.timelineOptions, sites = o.sites ?? 3, roles = o.roles ?? 3, perRole = o.hostsPerRole ?? 4, count = o.events ?? 400, span = o.span ?? 30;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const roleNames = ["Web", "Database", "Storage", "Network", "Compute"], roots = [], hosts = [];
  for (let s = 0; s < sites; s++) {
    const site = { id: "site-" + s, label: "Site " + (s + 1), expanded: true, cells: { name: "Site " + (s + 1) }, children: [] };
    for (let r = 0; r < roles; r++) {
      const role = { id: "role-" + s + "-" + r, label: roleNames[r % 5], expanded: true, cells: { name: roleNames[r % 5] }, children: [] };
      for (let i = 0; i < perRole; i++) {
        const id = "host-" + s + "-" + r + "-" + i;
        hosts.push(id);
        role.children.push({ id, label: id, cells: { name: id } });
      }
      site.children.push(role);
    }
    roots.push(site);
  }
  const iso = time => new Date(time).toISOString().replace(".000Z", "Z");
  const base = Date.UTC(2026, 9, 16), rows = [];
  for (let i = 0; i < count; i++) {
    const host = hosts[Math.floor(rnd() * hosts.length)], start = base + Math.floor((rnd() - 0.5) * span * 96) * 900000, hours = 0.5 + Math.floor(rnd() * 8);
    const kind = rnd() < 0.15 ? "Outage" : rnd() < 0.5 ? "Incident" : "Maintenance";
    rows.push({ id: "ev" + i, cells: { title: kind + " " + i, starts: iso(start), ends: iso(start + hours * 3600000), host, status: kind } });
  }
  rows.push({ id: "weekly", cells: { title: "Patch window", starts: "2026-10-06T22:00:00Z", ends: "2026-10-07T02:00:00Z", host: hosts[0], status: "Maintenance", rule: "FREQ=WEEKLY;BYDAY=TU" } });
  const view = {
    protocol: "canopyx/2", type: "grid", id: "incidents", label: "Incidents by host", rowHeight: 34, pageSize: 200, selection: "single", search: true,
    columns: [
      { id: "title", title: "Title", kind: "text", sortable: true, rowHeader: true },
      { id: "starts", title: "Starts", kind: "datetime", sortable: true, editable: !!o.editable },
      { id: "ends", title: "Ends", kind: "datetime", sortable: true, editable: !!o.editable },
      { id: "host", title: "Host", kind: "text", sortable: true, editable: !!o.editable },
      { id: "status", title: "Status", kind: "text", sortable: true, presenter: { kind: "state", tones: { Outage: "danger", Incident: "warning", Maintenance: "info" } } },
      { id: "rule", title: "Recurrence", kind: "text", hidden: true }
    ],
    source: o.hosted ? { kind: "host" } : { kind: "inline" }, rows: o.hosted ? undefined : rows,
    calendar: {
      start: "starts", end: "ends", title: "title", resource: "host", status: "status", recurrence: "rule", date: "2026-10-16", view: o.view || "timeline", zoom: o.zoom || "day",
      views: ["timeline", "month", "week", "day", "agenda"], editable: o.editable ? { overlap: false } : undefined,
      capacity: { thresholds: [{ at: 3, tone: "warning" }, { at: 6, tone: "danger" }] },
      ranges: [{ start: "2026-10-26T00:00:00Z", end: "2026-10-31T00:00:00Z", label: "Change freeze", tone: "info" },
        { start: "2026-10-17T00:00:00Z", end: "2026-10-18T00:00:00Z", label: "Hardware swap", resource: hosts[1], kind: "unavailable" }],
      availability: [{ start: "07:00", end: "19:00" }],
      resources: { label: "Hosts", width: 300, aggregates: { events: "count", busy: "busy" }, view: {
        protocol: "canopyx/2", type: "view", id: "hosts", label: "Hosts", rowHeight: 34, selection: "single",
        columns: [{ id: "name", title: "Host", sortable: true, width: 150 }, { id: "events", title: "Events", kind: "number", width: 70 }, { id: "busy", title: "Busy", kind: "number", width: 70 }],
        source: { kind: "inline" }, roots } }
    }
  };
  if (!view.calendar.editable) delete view.calendar.editable;
  if (o.hosted) {
    // An index per host, so each range request reads only the hosts it names, as a server with an index on the resource would.
    const byHost = new Map(hosts.map(host => [host, []]));
    for (const row of rows) byHost.get(row.cells.host).push({ row, start: Date.parse(row.cells.starts), end: Date.parse(row.cells.ends) });
    for (const list of byHost.values()) list.sort((a, b) => a.start - b.start);
    window.ranges = [];
    window.timelineSource = {
      query: query => ({ protocol: "canopyx/2", type: "gridPage", view: "incidents", revision: "r1", offset: query.offset, total: rows.length, matched: rows.length, items: rows.slice(query.offset, query.offset + query.limit) }),
      range(request) {
        window.ranges.push({ from: request.from, to: request.to, resources: request.resources ? request.resources.length : null, first: request.resources ? request.resources[0] : null, last: request.resources ? request.resources.at(-1) : null });
        const from = Date.parse(request.from), to = Date.parse(request.to), items = [];
        for (const host of request.resources || hosts) for (const item of byHost.get(host) || []) if (item.start < to && (item.end > from || item.row.cells.rule)) items.push(item.row);
        items.sort((a, b) => a.cells.starts < b.cells.starts ? -1 : a.cells.starts > b.cells.starts ? 1 : a.id < b.id ? -1 : 1);
        const limited = items.slice(0, request.limit);
        return { protocol: "canopyx/2", type: "gridRangePage", view: "incidents", revision: "r1", from: request.from, to: request.to, matched: items.length, truncated: limited.length < items.length, items: limited };
      }
    };
  }
  const host = document.getElementById("cal");
  window.firstEvents = null;
  const watch = () => { if (document.querySelector(".cx-cal-ev")) requestAnimationFrame(() => { window.firstEvents = performance.now(); }); else requestAnimationFrame(watch); };
  window.mountedAt = performance.now();
  requestAnimationFrame(watch);
  window.api = CanopyX.createDataGrid(host, o.hosted ? { view, source: window.timelineSource } : { view });
}
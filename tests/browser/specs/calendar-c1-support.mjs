import fs from "node:fs";
import path from "node:path";
import { repo, runtimeAssets } from "./support.mjs";

/** The public basic-calendar factory, with all product behaviour left in the calendar plugins. */
export function calendarC1Page(options = {}, assets) {
  const { script, style } = assets || runtimeAssets("grid");
  const editing = ["forms", "editing"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");
  const linkScript = options.links ? fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-link.js"), "utf8") : "";
  const linkStyle = options.links ? fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-link.css"), "utf8") : "";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Room schedule</title><style>' + style + linkStyle +
    'body{margin:0;padding:16px}#cal{height:760px}</style><script>' + script + '\n' + editing + '\n' + linkScript + '</script></head><body class="cx-page"><div id="cal" data-cx-theme="' + (options.dark ? "dark" : "light") + '"></div><script>window.c1Options=' +
    JSON.stringify(options).replace(/</g, "\\u003c") + ";(" + mount.toString() + ")();</script></body></html>";
}

function mount() {
  const o = window.c1Options, count = o.count || 100, resources = Array.from({ length: count }, (_, index) => ({ id: "room-" + index, label: "Room " + String(index + 1).padStart(2, "0") }));
  const events = o.events || Array.from({ length: count }, (_, index) => ({ id: "event-" + index, title: "Planning " + (index + 1), start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:00:00Z", resource: resources[index].id }));
  window.errors = [];
  window.mountedAt = performance.now();
  window.api = window.CanopyX.createCalendar(document.getElementById("cal"), { id: "c1", label: "Room schedule", preset: o.editable ? "scheduler" : "basic",
    events, resources, links: !!o.links, live: !!o.live, views: ["day", "week", "month", "timeline"], view: o.view || "day", date: "2026-10-16", timeZone: "utc", details: "popover", sources: o.sources,
    ...(o.calendar || {}), calendar: { phone: "day", firstDay: 1, minTime: "08:00", maxTime: "18:00", scrollTime: "08:00", ...o.calendar },
    onError: detail => window.errors.push(detail.error.message) });
}

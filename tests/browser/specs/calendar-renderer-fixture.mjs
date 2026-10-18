import http from "node:http";
import { runtimeAssets } from "./support.mjs";

/** A real inline calendar with public host renderers and observable resource ownership. */
export async function rendererFixture() {
  const { script, style } = runtimeAssets("grid");
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Calendar renderer contract</title><style>" +
    style + "body{margin:0;padding:16px}#calendar{height:720px}</style><script>" + script + "</script></head><body class=\"cx-page\"><div id=\"calendar\" data-cx-theme=\"light\"></div><script>(" + install.toString() + ")();</script></body></html>";
  const server = http.createServer((request, response) => {
    if (request.url === "/favicon.ico") { response.writeHead(204).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html" }).end(html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: "http://127.0.0.1:" + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

/* global CanopyX */
function install() {
  window.rendererCalls = []; window.rendererErrors = [];
  const phoneMonth = new URLSearchParams(location.search).has("phone");
  let rows = ["owned", "false", "void", "throw"].map((mode, index) => ({ id: mode, cells: {
    title: "Event " + mode, starts: "2026-10-16T" + String(9 + index * 2).padStart(2, "0") + ":00:00Z",
    ends: "2026-10-16T" + String(10 + index * 2).padStart(2, "0") + ":00:00Z", status: "Status " + mode
  } }));
  if (phoneMonth) rows = ["16", "17", "18"].map(day => ({ id: "owned-" + day, cells: { ...rows[0].cells,
    title: "Event October " + day, starts: "2026-10-" + day + "T09:00:00Z", ends: "2026-10-" + day + "T10:00:00Z" } }));
  const host = document.getElementById("calendar");
  host.addEventListener("canopyx:error", event => window.rendererErrors.push(event.detail.error.message));
  window.api = CanopyX.createDataGrid(host, {
    view: { protocol: "canopyx/2", type: "grid", id: "renderer-contract", label: "Calendar renderer contract", rowHeight: 34,
      pageSize: 20, selection: "single", source: { kind: "inline" }, rows,
      columns: [{ id: "title", title: "Title", kind: "text", rowHeader: true }, { id: "starts", title: "Starts", kind: "datetime" },
        { id: "ends", title: "Ends", kind: "datetime" }, { id: "status", title: "Status", kind: "text" }],
      calendar: { start: "starts", end: "ends", title: "title", status: "status", date: "2026-10-16", timeZone: "utc",
        view: phoneMonth ? "month" : "day", views: ["day", "agenda", "month"], phone: phoneMonth ? "month" : "agenda", toolbar: false } },
    renderers: { status(row, element, context) {
      // The same public renderer also serves hidden grid cells; record just calendar-owned invocations.
      if (!element.classList.contains("cx-cal-ev-status")) return false;
      const call = { row: row.id, element, signal: context.signal, column: context.column, index: context.index, disposed: 0, aborted: 0, notifications: 0 };
      window.rendererCalls.push(call);
      const observer = new ResizeObserver(() => {}); observer.observe(element);
      context.signal.addEventListener("abort", () => call.aborted++, { once: true });
      window.addEventListener("renderer-pulse", () => call.notifications++, { signal: context.signal });
      context.onDispose(() => { observer.disconnect(); call.disposed++; });
      if (row.id === "throw") { element.textContent = "Partial failed content"; element.hidden = true; throw new Error("calendar renderer failure"); }
      if (row.id === "false") { element.classList.add("host-decoration"); return false; }
      if (row.id === "void") return;
      const badge = CanopyX.badge({ text: "Host status", tone: "success" }); element.appendChild(badge); return true;
    } },
    calendar: { render({ element }) { element.dataset.hostCalendar = "decorated"; return false; } }
  });
}

export function rendererSnapshot(page) {
  return page.evaluate(() => window.rendererCalls.map((call, render) => ({ render, row: call.row, connected: call.element.isConnected,
    column: call.column, index: call.index, disposed: call.disposed, aborted: call.aborted, signalAborted: call.signal.aborted, notifications: call.notifications })));
}

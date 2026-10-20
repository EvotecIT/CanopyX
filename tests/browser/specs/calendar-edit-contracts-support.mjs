// A host-shaped write boundary for calendar editing: it persists only the values the public gridCommit sends, then the
// calendar reads those stored records again. UI policy and the occurrence hook stay under the host's control.
import fs from "node:fs";
import path from "node:path";
import { repo, runtimeAssets } from "./support.mjs";

export function calendarEditPage(options = {}) {
  const { script, style } = runtimeAssets("grid");
  // The editing part and the forms part it requires (its editors and checks), preloaded as generated pages carry them.
  const editing = ["forms", "editing"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n");
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Calendar edit contracts</title><style>' + style +
    'body{margin:0;padding:16px}#cal{height:760px}</style><script>' + script + "\n" + editing + '</script></head><body class="cx-page"><div id="cal"></div><script>window.editOptions=' +
    JSON.stringify(options).replace(/</g, "\\u003c") + ";(" + installCalendarEditHost.toString() + ")();</script></body></html>";
}

/* global CanopyX */
function installCalendarEditHost() {
  const o = window.editOptions, recurring = !!o.occurrence;
  window.policy = { denied: o.denied || [] }; window.commits = []; window.errors = []; window.occurrenceCalls = 0;
  window.records = [{ id: "event", cells: { title: "Planning", starts: o.starts || (recurring ? "2026-10-14T09:00:00Z" : "2026-10-16T09:00:00Z"),
    ends: o.ends || (recurring ? "2026-10-14T10:00:00Z" : "2026-10-16T10:00:00Z"), resource: "Room A", allDay: "false", business: "Keep me",
    ...(recurring ? { rule: o.rule || "FREQ=DAILY;COUNT=5" } : {}) } }];
  if (o.allDay) Object.assign(window.records[0].cells, { starts: "2026-10-14T00:00:00Z", ends: "2026-10-15T00:00:00Z", allDay: "true" });
  if (o.nullBusiness) window.records[0].cells.business = null;
  if (o.exceptions) window.records[0].cells.exceptions = typeof o.exceptions === "string" ? o.exceptions : "2026-10-15T09:00:00Z";
  if (o.cells) Object.assign(window.records[0].cells, o.cells);
  if (o.extraRows) window.records.push(...o.extraRows);
  const readonly = new Set(o.readonly || []), columns = [
    ["title", "Title", "text"], ["starts", "Starts", "datetime"], ["ends", "Ends", "datetime"], ["resource", "Resource", "text"],
    ["allDay", "All day", "text"], ["business", "Business", "text"], ["rule", "Recurrence", "text"], ["exceptions", "Exceptions", "text"], ["series", "Series", "text"], ["rid", "Original start", "datetime"]
  ].map(([id, title, kind]) => ({ id, title, kind, editable: !readonly.has(id), ...(id === "title" ? { rowHeader: true } : {}) }));
  const view = { protocol: "canopyx/2", type: "grid", id: "calendar-edit-contract", label: "Planning", pageSize: 20, rowHeight: 34, selection: "single",
    source: { kind: o.inline ? "inline" : "host" }, ...(o.inline ? { rows: JSON.parse(JSON.stringify(window.records)) } : {}), columns,
    calendar: { start: "starts", end: "ends", title: "title", resource: "resource", allDay: "allDay", recurrence: "rule", exceptions: "exceptions", series: "series", recurrenceId: "rid",
      occurrence: o.occurrence || "all", date: o.date || "2026-10-16", view: o.view || "week", views: ["week", "month"], firstDay: 1, timeZone: o.timeZone || "utc",
      ...(o.scrollTime ? { scrollTime: o.scrollTime } : {}),
      ...(o.validRange ? { validRange: o.validRange } : {}),
      ...(o.ranges ? { ranges: o.ranges } : {}),
      editable: { overlap: o.overlap ?? true, resources: true, ...(o.manual ? { commit: "manual" } : {}) } } };
  if (o.resources) view.calendar.resources = { view: { protocol: "canopyx/2", type: "view", id: "rooms", label: "Rooms", rowHeight: 34,
    selection: "single", columns: [{ id: "name", title: "Room", kind: "text", rowHeader: true }], source: { kind: "inline" },
    roots: ["Room A", "Room B"].map(id => ({ id, label: id, cells: { name: id } })) } };
  const copy = value => JSON.parse(JSON.stringify(value));
  const matches = (row, filter) => {
    const value = row.cells[filter.column] ?? null, other = filter.values[0];
    if (filter.operator === "in") return filter.values.includes(value);
    if (filter.operator === "isNull") return value == null;
    if (filter.operator === "isNotNull") return value != null;
    if (filter.operator === "eq") return value === other;
    if (filter.operator === "ne") return value !== other;
    const a = ["starts", "ends", "rid"].includes(filter.column) ? Date.parse(value) : value;
    const b = ["starts", "ends", "rid"].includes(filter.column) ? Date.parse(other) : other;
    return filter.operator === "ge" ? a >= b : filter.operator === "gt" ? a > b : filter.operator === "le" ? a <= b : filter.operator === "lt" ? a < b : true;
  };
  const group = (row, block) => !block || (block.operator === "and" ? block.filters.every(filter => matches(row, filter)) && block.groups.every(child => group(row, child)) :
    block.filters.some(filter => matches(row, filter)) || block.groups.some(child => group(row, child)));
  const source = {
    query(query) {
      const items = window.records.filter(row => query.filters.every(filter => matches(row, filter)) && group(row, query.filterGroup));
      return { protocol: "canopyx/2", type: "gridPage", view: view.id, revision: "r1", offset: query.offset, total: window.records.length, matched: items.length,
        items: copy(items.slice(query.offset, query.offset + query.limit)) };
    },
    range(request) {
      const items = window.records.filter(row => Date.parse(row.cells.starts) < Date.parse(request.to) &&
        (row.cells.rule || Date.parse(row.cells.ends) > Date.parse(request.from)) && (!request.resources || request.resources.includes(row.cells.resource)));
      return { protocol: "canopyx/2", type: "gridRangePage", view: view.id, revision: "r1", from: request.from, to: request.to, matched: items.length, truncated: false, items: copy(items) };
    }
  };
  const editing = {
    isEditable: (row, column) => !window.policy.denied.includes(column),
    ...(o.local ? {} : { commit(batch) {
      window.commits.push(copy(batch));
      const answers = batch.rows.map(change => {
        if (change.op === "insert") {
          const id = "stored-" + window.records.length, record = { id, cells: copy(change.values) };
          window.records.push(record); return { id: change.id, status: "saved", newId: id };
        }
        Object.assign(window.records.find(row => row.id === change.id).cells, change.values);
        return { id: change.id, status: "saved" };
      });
      return { protocol: "canopyx/2", type: "gridCommitResult", view: view.id, rows: answers };
    } })
  };
  const mount = () => CanopyX.createDataGrid(document.getElementById("cal"), { view, ...(!o.inline ? { source } : {}), editing,
    onError: detail => window.errors.push(detail.error.message), calendar: { occurrence: async () => {
      window.occurrenceCalls++;
      if (o.holdOccurrence) await new Promise(resolve => { window.releaseOccurrence = resolve; });
      if (o.takeOccurrence) return false;
      return o.mode || o.occurrence;
    } } });
  window.api = mount();
  window.readSaved = async () => {
    if (!o.inline) return window.api.reload();
    window.api.destroy(); view.rows = copy(window.records); window.api = mount();
  };
}

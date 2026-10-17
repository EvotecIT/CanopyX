// A contract-shaped hosted boundary for calendar range/query integration. Product behavior runs in the actual runtime;
// this source owns only its scoped records, typed predicate evaluation, paging, revision and optional range capability.
import { viewPage } from "./support.mjs";

export function calendarRow(id, start, end, extra = {}) {
  return { id, cells: { title: id, starts: start, ends: end, resource: "visible", ...extra } };
}

export function calendarRangePage(rows, options = {}) {
  const columns = [
    { id: "title", title: "Title", kind: "text", rowHeader: true, sortable: true },
    { id: "starts", title: "Start", kind: "datetime", sortable: true },
    { id: "ends", title: "End", kind: "datetime", sortable: true },
    { id: "resource", title: "Resource", kind: "text", sortable: true },
    { id: "rule", title: "Rule", kind: "text" }, { id: "exceptions", title: "Exceptions", kind: "text" },
    { id: "series", title: "Series", kind: "text" }, { id: "rid", title: "Original start", kind: "datetime" }
  ];
  const calendar = { start: "starts", end: "ends", title: "title", resource: "resource", recurrence: "rule", exceptions: "exceptions",
    series: "series", recurrenceId: "rid", date: "2026-10-16", firstDay: 1, view: "week", views: ["week", "month"], ...options.calendar };
  const view = { protocol: "canopyx/2", type: "grid", id: "calendar-contract", label: "Calendar contract", rowHeight: 34,
    pageSize: options.pageSize || 5, search: true, selection: "single", columns, query: options.query,
    ...(options.cursor ? { presentation: "paged", pageLength: options.pageSize || 5 } : {}),
    source: options.inline ? { kind: "inline" } : { kind: "host", ...(options.cursor ? { navigation: "cursor" } : {}) },
    ...(options.inline ? { rows } : {}), ...(options.grouped ? { reporting: { groupBy: [{ column: "resource", direction: "asc" }], groupable: true } } : {}), calendar };
  const settings = JSON.stringify({ rows, options }).replace(/</g, "\\u003c");
  const script = "<script>window.calendarFixture = " + settings + ";(" + installCalendarSource.toString() + ")();</script>";
  return viewPage(view).replace('data-cx-theme="light"', 'data-cx-theme="' + (options.dark ? "dark" : "light") + '"').replace("</head>", script + "</head>");
}

/* global CanopyX */
function installCalendarSource() {
  const { rows, options } = window.calendarFixture;
  window.calendarQueries = []; window.calendarRanges = []; window.calendarErrors = [];
  if (options.inline) return;
  const allowed = rows.filter(row => row.cells.title !== "Private override"), kind = id => ["starts", "ends", "rid"].includes(id) ? "datetime" : "text";
  const value = (row, id) => row.cells[id] ?? null;
  const predicate = (row, filter) => {
    const raw = value(row, filter.column), operands = filter.values, normalize = item => kind(filter.column) === "datetime" && item != null ? Date.parse(item) : item;
    if (filter.operator === "isNull") return raw == null;
    if (filter.operator === "isNotNull") return raw != null;
    if (filter.operator === "in") return operands.includes(raw);
    if (filter.operator === "eq") return raw === operands[0];
    if (filter.operator === "ne") return raw !== operands[0];
    if (raw == null) return false;
    const a = normalize(raw), b = normalize(operands[0]);
    return filter.operator === "ge" ? a >= b : filter.operator === "gt" ? a > b : filter.operator === "le" ? a <= b : filter.operator === "lt" ? a < b :
      filter.operator === "contains" ? String(a).includes(String(b)) : filter.operator === "startsWith" && String(a).startsWith(String(b));
  };
  const group = (row, block) => !block || (block.operator === "and" ?
    block.filters.every(filter => predicate(row, filter)) && block.groups.every(child => group(row, child)) :
    block.filters.some(filter => predicate(row, filter)) || block.groups.some(child => group(row, child)));
  const select = query => allowed.filter(row => (!query.search || Object.values(row.cells).some(cell => String(cell).toLowerCase().includes(query.search.toLowerCase()))) &&
    query.filters.every(filter => predicate(row, filter)) && group(row, query.filterGroup));
  const order = (items, sorts) => items.slice().sort((a, b) => {
    for (const sort of sorts || []) { const left = value(a, sort.column), right = value(b, sort.column), result = left < right ? -1 : left > right ? 1 : 0; if (result) return sort.direction === "desc" ? -result : result; }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const source = {
    ...(options.cursor ? { navigation: "cursor" } : {}),
    async query(query, { signal }) {
      window.calendarQueries.push(query);
      const metadata = query.filters.some(filter => filter.column === "series" && filter.operator === "in");
      if (metadata && options.holdMetadata) await new Promise(resolve => { window.releaseCalendarMetadata = resolve; signal.addEventListener("abort", resolve, { once: true }); });
      const items = order(select(query), query.sort), offset = options.cursor ? query.cursor ? Number(query.cursor.slice(2)) : 0 : query.offset;
      const revision = metadata && options.staleMetadata ? "r2" : "r1";
      const page = { protocol: "canopyx/2", type: options.cursor ? "gridCursorPage" : "gridPage", view: "calendar-contract", revision,
        offset, total: options.cursor ? null : allowed.length, matched: options.cursor ? null : items.length, items: items.slice(offset, offset + query.limit) };
      if (options.cursor) {
        if (offset + page.items.length < items.length) page.nextCursor = "c:" + (offset + page.items.length);
        if (offset) page.previousCursor = "p:" + Math.max(0, offset - query.limit);
      }
      return page;
    },
    summary(query) {
      const items = order(select(query), query.sort), groups = [];
      for (let offset = 0; offset < items.length;) {
        const resource = items[offset].cells.resource;
        let end = offset + 1;
        while (end < items.length && items[end].cells.resource === resource) end++;
        groups.push({ key: "group-" + resource, value: resource, offset, count: end - offset, aggregates: {} });
        offset = end;
      }
      return { protocol: "canopyx/2", type: "gridSummary", view: "calendar-contract", revision: "r1", query, matched: items.length, groups, aggregates: {} };
    }
  };
  if (options.range !== false && (!options.cursor || options.advertiseRange)) source.range = request => {
    window.calendarRanges.push(request);
    if (request.query.type !== "gridQuery") throw new Error("This range endpoint accepts offset queries only.");
    const from = Date.parse(request.from), to = Date.parse(request.to), items = order(select(request.query).filter(row => {
      const start = Date.parse(row.cells.starts), end = Date.parse(row.cells.ends);
      return (!request.resources || request.resources.includes(row.cells.resource)) && start < to &&
        (start >= from || end > from || row.cells.rule != null && row.cells.rule !== "");
    }), [{ column: "starts", direction: "asc" }]);
    return { protocol: "canopyx/2", type: "gridRangePage", view: "calendar-contract", revision: "r1", from: request.from, to: request.to,
      matched: items.length, truncated: items.length > request.limit, items: items.slice(0, request.limit) };
  };
  CanopyX.configure("calendar-contract", { source, onError: detail => window.calendarErrors.push(detail.error.message) });
}

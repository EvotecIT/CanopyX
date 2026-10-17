// One external filter has the ordinary typed predicate semantics in standalone tree and flat-grid runtimes.
import { expect, test } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";
import { read } from "./formatting-support.mjs";

const columns = [{ id: "name", title: "Name", kind: "text" }, { id: "city", title: "City", kind: "text" },
  { id: "flag", title: "Flag", kind: "text" }, { id: "size", title: "Size", kind: "number" }, { id: "seen", title: "Seen", kind: "datetime" }];
const records = [
  { id: "berlin-upper", cells: { name: "Alpha", city: "Berlin", flag: true, size: 10, seen: "2026-10-15T10:00:00Z" } },
  { id: "berlin-lower", cells: { name: "Beta", city: "berlin", flag: "true", size: 20, seen: "2026-10-15T11:00:00+01:00" } },
  { id: "warsaw", cells: { name: "Gamma", city: "Warsaw", flag: false, size: 5, seen: "2026-10-16T10:00:00Z" } },
  { id: "explicit-first-cell", label: "Display label", cells: { name: "Delta", city: "Oslo", flag: "false", size: null, seen: null } },
  { id: "explicit-empty-first-cell", label: "Alpha", cells: { name: null } },
  { id: "date-as-text", cells: { name: "Text date", city: "2026-10-15T10:00:00Z" } },
  { id: "other-date-as-text", cells: { name: "Other text date", city: "2026-10-15T11:00:00+01:00" } },
  { id: "missing", cells: { name: "Missing" } }
];
const cases = [
  { name: "case-folded text equality", filter: { field: "city", values: ["berlin"] }, ids: ["berlin-lower", "berlin-upper"] },
  { name: "case-folded text membership", filter: { field: "city", values: ["BERLIN", "warsaw"] }, ids: ["berlin-lower", "berlin-upper", "warsaw"] },
  { name: "boolean does not equal text", filter: { field: "flag", values: [true] }, ids: ["berlin-upper"] },
  { name: "text does not equal boolean", filter: { field: "flag", values: ["TRUE"] }, ids: ["berlin-lower"] },
  { name: "ISO-looking text retains its raw text identity", filter: { field: "city", values: ["2026-10-15T10:00:00Z"] }, ids: ["date-as-text"] },
  { name: "numeric operands normalize once", filter: { field: "size", values: ["10", 20] }, ids: ["berlin-lower", "berlin-upper"] },
  { name: "inclusive numeric range excludes empty cells", filter: { field: "size", range: [10, 20] }, ids: ["berlin-lower", "berlin-upper"] },
  { name: "open numeric range excludes missing cells", filter: { field: "size", range: [null, 5] }, ids: ["warsaw"] },
  { name: "datetimes compare by instant", filter: { field: "seen", values: ["2026-10-15T12:00:00+02:00"] }, ids: ["berlin-lower", "berlin-upper"] },
  { name: "inclusive date range excludes empty cells", filter: { field: "seen", range: ["2026-10-15T10:00:00Z", "2026-10-16T10:00:00Z"] }, ids: ["berlin-lower", "berlin-upper", "warsaw"] },
  { name: "first-column labels fall back only without an explicit cell", filter: { field: "name", values: ["ALPHA", "DELTA"] }, ids: ["berlin-upper", "explicit-first-cell"] }
];

async function open(page, kind) {
  const base = { protocol: "canopyx/2", id: "parity", label: "Linked filter parity", pageSize: 100, rowHeight: 32,
    columns, selection: "none", search: false, source: { kind: "inline" } };
  const view = kind === "grid" ? { ...base, type: "grid", rows: records.map(({ id, cells }) => ({ id, cells })) } :
    { ...base, type: "view", roots: records.map(record => {
      const cells = { ...record.cells }, label = record.label || cells.name;
      if (!record.label) delete cells.name;
      return { id: record.id, label, cells };
    }) };
  const html = viewPage(view).replace("</head>", "<script>" + read("canopyx-link.js") + "</script></head>");
  await page.route("http://link-parity.test/" + kind, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://link-parity.test/" + kind);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
}

async function filteredIds(page, filter) {
  await page.evaluate(filter => document.querySelector("[data-canopyx-host]").canopyx.setExternalFilter("picker", filter), filter);
  await nextFrames(page);
  return page.locator(".cx-row[data-cx-id]:not([data-cx-status])").evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id")).sort());
}

test("external filters share case-folded type-preserving predicates across standalone trees and grids", async ({ page }) => {
  const tree = await page.context().newPage();
  try {
    await Promise.all([open(page, "grid"), open(tree, "tree")]);
    for (const item of cases) await test.step(item.name, async () => {
      const [gridIds, treeIds] = await Promise.all([filteredIds(page, item.filter), filteredIds(tree, item.filter)]);
      expect.soft(gridIds, "ordinary grid predicate result").toEqual(item.ids);
      expect.soft(treeIds, "standalone tree predicate result").toEqual(item.ids);
    });
  } finally { await tree.close(); }
});

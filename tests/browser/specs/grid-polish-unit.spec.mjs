// Pure contracts run against the production source parts, so asset generation is not needed for this focused loop.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { repo } from "./support.mjs";

const source = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
function helpers(names, expression, supplied = {}) {
  class TreeGrid { buildToolbar() {} }
  const context = vm.createContext({ DEFAULT_LABELS: {}, TreeGrid, definePart() {}, performance: { now: () => 0 }, ...supplied });
  for (const name of names) vm.runInContext(source(name), context);
  return vm.runInContext(expression, context);
}
const fill = () => helpers(["canopyx.cell-range.source/70-range-fill.js"], "crSeries");

test("fill continues numeric, ISO date and numbered-label series; copy and irregular seeds repeat", () => {
  const series = fill();
  for (const [seed, count, expected] of [
    [[7], 3, [8, 9, 10]], [[0.1, 0.2], 3, [0.3, 0.4, 0.5]], [[9, 6], 2, [3, 0]],
    [["2026-01-31"], 2, ["2026-02-01", "2026-02-02"]],
    [["2026-12-30T00:00:00Z", "2026-12-31T00:00:00Z"], 2, ["2027-01-01T00:00:00.000Z", "2027-01-02T00:00:00.000Z"]],
    [["Item 1", "Item 2"], 3, ["Item 3", "Item 4", "Item 5"]], [["Batch 009"], 2, ["Batch 010", "Batch 011"]],
    [["Item 9", "Item 7"], 2, ["Item 5", "Item 3"]], [[1, 3, 4], 4, [1, 3, 4, 1]],
    [["Item 1", "Other 2"], 3, ["Item 1", "Other 2", "Item 1"]], [[null], 2, [null, null]]
  ]) expect(Array.from(series(seed, count))).toEqual(expected);
  expect(Array.from(series([1, 2], 4, true))).toEqual([1, 2, 1, 2]);
  expect(Array.from(series(["Item 2"], 2, true))).toEqual(["Item 2", "Item 2"]);
  expect(Array.from(series([], 2))).toEqual([]);
});

test("bounded regex search reuses the condition grammar and rejects overlong inputs and expired work", () => {
  let now = 0;
  const kit = helpers(["canopyx.source/05-patterns.js", "canopyx.grid.source/09-grid-predicates.js"],
    "({gridSearchTerms,gridMatchesSearch})", { performance: { now: () => now },
      isCellObject: value => value !== null && typeof value === "object", cellValue: value => value?.value ?? value,
      foldText: value => String(value ?? "").toLowerCase() });
  const columns = [{ id: "name" }], terms = kit.gridSearchTerms("^item \\d+$", "regex");
  expect(kit.gridMatchesSearch({ cells: { name: "ITEM 42" } }, terms, columns)).toBe(true);
  expect(kit.gridMatchesSearch({ cells: { name: "prefix Item 42" } }, terms, columns)).toBe(false);
  expect(kit.gridMatchesSearch({ cells: { name: { value: "Hidden", searchText: "Item 42" } } }, terms, columns)).toBe(true);
  for (const pattern of ["(a+)+$", "a|b", "a*", "a".repeat(257)]) expect(() => kit.gridSearchTerms(pattern, "regex")).toThrow();
  expect(() => kit.gridMatchesSearch({ cells: { name: "x".repeat(4097) } }, terms, columns)).toThrow("4,096");
  now = 51;
  expect(() => kit.gridMatchesSearch({ cells: { name: "Item 42" } }, terms, columns)).toThrow("50 ms");
  expect(kit.gridMatchesSearch({ cells: { name: "anything" } }, kit.gridSearchTerms("", "regex"), columns)).toBe(true);
});

test("card slot templates bind declared columns and insert literal text without parsing markup", () => {
  const validate = helpers(["canopyx.source/87-view-modes.js"], "readCardTemplate"),
    columns = [{ id: "name" }, { id: "count" }], layout = { modes: ["fit", "cards"] };
  validate({ name: "{name} · {count}" }, columns, layout);
  for (const templates of [{ missing: "{name}" }, { name: "{missing}" }, { name: "{name" }, { name: "x".repeat(2049) }])
    expect(() => validate(templates, columns, layout)).toThrow();
  expect(() => validate({ name: "{name}" }, columns, { modes: ["fit"] })).toThrow();
  const element = { classList: { add() {} }, querySelector: () => null, appendChild(child) { this.child = child; } };
  const render = helpers(["canopyx.layouts.source/15-layout-card-template.js"], "cardTemplateSlot", {
    h: () => ({}), setText: (element, text) => { element.textContent = text; }, cellText: value => String(value ?? "")
  });
  const slot = { cell: element }, view = { view: { cardTemplate: { name: "<b>{name}</b> · {count}" } }, columns, fmt: {} },
    row = { h: { cells: { name: "<img src=x onerror=alert(1)>", count: 3 } } };
  render(view, row, columns[0], slot);
  expect(element.child.textContent).toBe("<b><img src=x onerror=alert(1)></b> · 3");
  expect(element.child.title).toBe(element.child.textContent);
  const content = element.child;
  content.parentNode = {}; // The phone's primary line can adopt it between paints.
  render(view, row, columns[0], slot);
  expect(element.child).toBe(content);
});

test("page header follows page scroll only while rows fit and restores its styles on overflow and destruction", () => {
  const frames = [], attributes = new Map(), life = new AbortController();
  const style = { getPropertyValue: () => "", getPropertyPriority: () => "", removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } };
  const head = { style, offsetHeight: 32 }, spacer = { style: {}, setAttribute() {}, remove() { this.removed = true; } },
    grid = { scrollHeight: 300, clientHeight: 300, clientWidth: 500, clientLeft: 1, scrollLeft: 20, checkVisibility: () => true,
      getBoundingClientRect: () => ({ top: -40, bottom: 260, left: 10 }), insertBefore() {} },
    host = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key), addEventListener() {} };
  const start = helpers(["canopyx.layouts.source/40-layout-page-header.js"], "pageHeaderStart", {
    h: () => spacer, requestAnimationFrame: run => { frames.push(run); return frames.length; }, cancelAnimationFrame() {},
    getComputedStyle: () => ({ getPropertyValue: () => "8px" }), window: { addEventListener() {} },
    ResizeObserver: class { observe() {} disconnect() {} }
  });
  start({ view: { autoHeight: false }, head, grid, host, lifetime: life });
  expect(frames).toHaveLength(0);
  const view = { view: {}, head, grid, host, rowWidth: 700, lifetime: life };
  start(view); frames.shift()();
  expect(head.style.position).toBe("fixed"); expect(head.style.top).toBe("8px");
  expect(head.style.left).toBe("-9px"); expect(head.style.clipPath).toBe("inset(0 180px 0 20px)");
  expect(attributes.get("data-cx-page-header")).toBe("true");
  grid.scrollHeight = 500; view.pageHeader.schedule(); frames.shift()();
  expect(head.style.position).toBeUndefined(); expect(spacer.hidden).toBe(true);
  life.abort(); expect(spacer.removed).toBe(true);
});

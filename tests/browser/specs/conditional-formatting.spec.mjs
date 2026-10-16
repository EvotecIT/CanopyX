// Conditional formatting (docs/conditional-formatting.md): rules on the filter builder's conditions, cell, row, column and
// drawer targets, tone styles, icons and badges, data bars, colour scales and bands, the legend, saved views, export
// records, print, remote rows and the evaluation budget on 100,000 rows. The rule editor has its own spec.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { nextFrames, openExample, median, exampleUrl } from "./support.mjs";
import { formattingPage, healthView } from "./formatting-support.mjs";

async function open(page, view = healthView(), options = {}) {
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  await page.route("http://canopyx.test/formatting", route => route.fulfill({ contentType: "text/html", body: formattingPage(view, options) }));
  await page.goto("http://canopyx.test/formatting");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await nextFrames(page);
}
const grid = page => page.evaluateHandle(() => document.querySelector("[data-canopyx-host]").canopyx);
const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
const cell = (page, id, index) => row(page, id).locator(".cx-cell").nth(index);

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`the server health example formats rows, cells, bars and scales with a legend (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await openExample(page, theme === "dark" ? "conditional-formatting-dark.html" : "conditional-formatting.html");
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready); await nextFrames(page);
    const down = row(page, "srv-006");
    await expect(down).toHaveClass(/cx-fmt-row/);
    await expect(down.locator(".cx-cell").first().locator(".cx-fmt-icon")).toHaveText("✕");
    await expect(down.locator(".cx-cell").first().locator(".cx-sr-only")).toHaveText(", Server is down");
    await expect(down.locator(".cx-fmt-icon").first()).toHaveAttribute("aria-hidden", "true");
    await expect(row(page, "srv-003").locator(".cx-cell").nth(1)).toHaveClass(/cx-fmt-fill/);
    const legend = page.getByRole("list", { name: "Formatting legend" });
    await expect(legend).toBeVisible();
    await expect(legend.getByRole("listitem")).toHaveCount(8);
    if (width === 1440) {
      await expect(cell(page, "srv-001", 2).locator(".cx-fmt-bar")).toHaveCount(1);
      expect(await cell(page, "srv-001", 2).locator(".cx-fmt-bar").evaluate(bar => bar.style.getPropertyValue("--cx-fmt-w"))).toBe("48.0%");
      await expect(cell(page, "srv-001", 4)).toHaveClass(/cx-fmt-scale/);
      // The scale mixes theme tones: the lowest and highest latencies differ, and the colours come from the palette in use.
      const backgrounds = await page.evaluate(() => [...document.querySelectorAll(".cx-row .cx-cell.cx-fmt-scale")].map(cell => getComputedStyle(cell).backgroundColor));
      expect(new Set(backgrounds).size).toBeGreaterThan(3);
      await expect(cell(page, "srv-000", 5)).toHaveClass(/cx-fmt-fill/);
      await expect(cell(page, "srv-000", 5).locator(".cx-sr-only")).toHaveText(", Disk space, Critical");
    } else {
      // Phones hide the secondary columns behind "+N"; the button names the flagged fields it hides.
      const more = cell(page, "srv-000", 0).locator(".cx-hidden-fields");
      await expect(more).toHaveClass(/cx-fmt-flag/);
      await expect(more).toHaveAttribute("aria-label", /hidden fields formatted: .*Critical/);
      // The flag is the button itself (its tone and an underline), inside the width the fitting reserves for it: the identity
      // column and every flagged value stay whole. A column that cannot fit a flagged value hides behind "+N" instead. (The
      // button's scroll width counts its widened hit area, so it is checked by its box.)
      // On phones an empty ::after widens the button's hit area to the 44 px target (accessibility modes); it draws nothing.
      const after = await more.evaluate(button => { const style = getComputedStyle(button, "::after"); return [style.content, style.backgroundColor, style.borderTopStyle]; });
      expect(["none", "\"\""]).toContain(after[0]);
      expect(after.slice(1)).toEqual(["rgba(0, 0, 0, 0)", "none"]);
      const cut = await page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].flatMap(row => [...row.children]
        .filter(cell => cell === row.firstElementChild || cell.querySelector(".cx-fmt-icon,.cx-fmt-badge,.cx-fmt-cue"))
        .flatMap(cell => [...cell.querySelectorAll(".cx-text,.cx-hidden-fields")].filter(item => item.matches(".cx-text") && item.scrollWidth > item.clientWidth + 1 ||
          item.getBoundingClientRect().right > cell.getBoundingClientRect().right + 0.5).map(item => row.dataset.cxId + ":" + item.textContent))));
      expect(cut).toEqual([]);
      const flagged = cell(page, "srv-000", 0);
      expect(await flagged.locator(".cx-text").evaluate(text => text.textContent)).toBe("srv-north-000");
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("the static fallback paints the same rules without script", async ({ page }) => {
  await page.goto(exampleUrl("conditional-formatting-static.html"));
  const down = page.locator("tr", { hasText: "srv-east-006" });
  await expect(down).toHaveAttribute("style", /background/);
  await expect(down.locator("td").first()).toHaveAttribute("style", /border-left:3px solid/);
  await expect(down.locator("td").first()).toHaveAttribute("title", "Server is down");
  await expect(page.getByText(/Formatting legend:/)).toBeVisible();
  expect(await page.locator("script").count()).toBe(0);
});

test("recycled rows drop the formatting of the rows they showed before", async ({ page }) => {
  await open(page, healthView(600));
  await expect(row(page, "srv-00005")).toHaveClass(/cx-fmt-row/);
  // Every painted row shows exactly its own formatting: the row rule, the status tone and the hot CPU icon.
  const leaks = () => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")].filter(row => {
    const index = Number(row.dataset.cxId.slice(4)), status = ["Healthy", "Healthy", "Healthy", "Degraded", "Healthy", "Down", "Healthy", "Maintenance"][index % 8];
    const hot = (index * 37) % 101 > 90, toned = status === "Degraded" || status === "Maintenance";
    return row.classList.contains("cx-fmt-row") !== (status === "Down") || row.children[1].classList.contains("cx-fmt-fill") !== toned ||
      row.querySelectorAll(".cx-fmt-icon").length !== (status === "Down") + toned + hot || row.querySelectorAll(".cx-fmt-bar").length !== 1;
  }).map(row => row.dataset.cxId));
  expect(await leaks()).toEqual([]);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(400)); await nextFrames(page);
  expect(await leaks()).toEqual([]);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(0)); await nextFrames(page);
  expect(await leaks()).toEqual([]);
  await expect(row(page, "srv-00005")).toHaveClass(/cx-fmt-row/);
});
test("conditions share the filter language and add operators, types, cultures and case", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "grid", id: "conditions", label: "Conditions", pageSize: 100, selection: "none", search: false, rowHeight: 28,
    columns: [{ id: "name", title: "Name", kind: "text", width: 160 }, { id: "load", title: "Load", kind: "number", width: 90 }, { id: "limit", title: "Limit", kind: "number", width: 90 },
      { id: "amount", title: "Amount", kind: "text", width: 110 }, { id: "seen", title: "Seen", kind: "datetime", width: 200 }, { id: "flag", title: "Flag", kind: "text", width: 80 }],
    source: { kind: "inline" }, rows: [
      { id: "a", cells: { name: "Web-01", load: 5, limit: 10, amount: "1 234,5", seen: new Date(Date.now() - 2 * 864e5).toISOString(), flag: true } },
      { id: "b", cells: { name: "db-02", load: 50, limit: 40, amount: "12,5", seen: new Date(Date.now() - 40 * 864e5).toISOString(), flag: false } },
      { id: "c", cells: { name: "web-03", load: 90, limit: 95, amount: "990", seen: null, flag: "yes" } }] };
  await open(page, view);
  const rule = (id, when) => ({ id, label: id, column: "name", when, style: { cue: "x" } });
  const where = (column, operator, values, extra = {}) => ({ operator: "and", filters: [{ column, operator, values, ...extra }] });
  const rules = [
    rule("like", where("name", "like", ["web-*"])), rule("exact", where("name", "eq", ["Web-01"], { caseSensitive: true })),
    rule("folded", where("name", "eq", ["WEB-03"])), rule("ends", where("name", "endsWith", ["02"])), rule("notContains", where("name", "notContains", ["web"])),
    rule("matches", where("name", "matches", ["^web-0[13]$"])), rule("notIn", where("load", "notIn", [5, 50])), rule("between", where("load", "between", [5, 50])),
    rule("exclusive", where("load", "betweenExclusive", [5, 90])), rule("overLimit", { operator: "and", filters: [{ column: "load", operator: "gt", valueColumn: "limit" }] }),
    rule("polish", where("amount", "gt", [1000], { type: "number", culture: "pl-PL" })), rule("recent", where("seen", "withinLast", [7])),
    rule("old", where("seen", "olderThan", [30])), rule("missing", where("seen", "isNull", [])), rule("bool", where("flag", "eq", [true], { type: "boolean" })),
    rule("none", { operator: "none", filters: [{ column: "load", operator: "gt", values: [60] }], groups: [{ operator: "and", filters: [{ column: "name", operator: "startsWith", values: ["db"] }] }] })];
  await page.evaluate(rules => document.querySelector("[data-canopyx-host]").canopyx.setFormatRules(rules), rules); await nextFrames(page);
  const matched = id => cell(page, id, 0).locator(".cx-sr-only").textContent();
  expect(await matched("a")).toBe(", like, exact, matches, between, polish, recent, bool, none");
  expect(await matched("b")).toBe(", ends, notContains, between, exclusive, overLimit, old");
  expect(await matched("c")).toBe(", like, folded, matches, notIn, missing, bool");
  expect(page.errors).toEqual([]);
});

test("the first rule that sets an aspect wins it, stopIfTrue ends a row's rules, and disabled rules are skipped", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setFormatRules([
    { id: "first", column: "status", style: { tone: "danger", icon: "flag" } },
    { id: "second", column: "status", style: { tone: "success", cue: "later", badge: "two" } },
    { id: "stop", label: "Stop", column: "name", when: { operator: "and", filters: [{ column: "status", operator: "eq", values: ["Down"] }] }, style: { cue: "stop" }, stopIfTrue: true },
    { id: "after", column: "name", style: { badge: "after" } },
    { id: "off", column: "name", enabled: false, style: { badge: "off" } }])); await nextFrames(page);
  const status = cell(page, "srv-00000", 1);
  await expect(status.locator(".cx-fmt-icon")).toHaveText("⚑");
  await expect(status.locator(".cx-fmt-cue")).toHaveText("later");
  await expect(status.locator(".cx-fmt-badge")).toHaveText("two");
  expect(await status.evaluate(cell => cell.style.getPropertyValue("--cx-fmt"))).toContain("--cx-tone-danger");
  await expect(cell(page, "srv-00005", 0).locator(".cx-fmt-cue")).toHaveText("stop");
  await expect(cell(page, "srv-00005", 0).locator(".cx-fmt-badge")).toHaveCount(0);
  await expect(cell(page, "srv-00000", 0).locator(".cx-fmt-badge")).toHaveText("after");
  await expect(page.locator(".cx-fmt-badge", { hasText: "off" })).toHaveCount(0);
});

test("setFormatRules validates the whole set and keeps the current rules on a bad one", async ({ page }) => {
  await open(page);
  const rejected = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx, results = [];
    for (const rules of [[{ id: "a", column: "missing", style: { tone: "danger" } }], [{ id: "a", column: "cpu", style: {} }],
      [{ id: "a", column: "cpu", style: { tone: "danger" } }, { id: "a", column: "cpu", style: { tone: "info" } }],
      [{ id: "a", target: "row", style: { bar: {} } }], [{ id: "a", column: "cpu", when: { operator: "and", filters: [{ column: "cpu", operator: "between", values: [9] }] }, style: { tone: "info" } }],
      [{ id: "a", column: "name", when: { operator: "and", filters: [{ column: "name", operator: "matches", values: ["("] }] }, style: { tone: "info" } }],
      [{ id: "a", column: "cpu", style: { tone: "info", css: { background: "url(x)" } } }], [{ id: "a", column: "cpu", style: { scale: { stops: [{ type: "min", tone: "info" }] } } }],
      [{ id: "a", column: "name", when: { operator: "and", filters: [{ column: "name", operator: "like", valueColumn: "status" }] }, style: { tone: "info" } }],
      [{ id: "a", column: "name", when: { operator: "and", filters: [{ column: "name", operator: "matches", values: ["(?i)web"] }] }, style: { tone: "info" } }],
      [{ id: "a", column: "cpu", style: { tone: "info", css: { color: "red\" x=\"" } } }]])
      results.push(await api.setFormatRules(rules).then(() => false, () => true));
    return { results, kept: api.getFormatRules().length };
  });
  expect(rejected.results).toEqual([true, true, true, true, true, true, true, true, true, true, true]);
  expect(rejected.kept).toBe(6);
  await expect(row(page, "srv-00005")).toHaveClass(/cx-fmt-row/);
});

test("edited rules live in the grid state and its saved views, and resetting returns to the view's rules", async ({ page }) => {
  const view = healthView(); view.stateKey = "formatting-state";
  await open(page, view);
  const state = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    const before = api.getState().formatRules;
    await api.setFormatRules([{ id: "only", label: "Only", column: "cpu", style: { tone: "warning", icon: "star" } }]);
    api.saveView("Starred");
    const saved = api.getState().formatRules;
    await api.resetView();
    const reset = api.getFormatRules().map(rule => rule.id);
    await api.applySavedView("Starred");
    return { before, saved, reset, applied: api.getFormatRules().map(rule => rule.id) };
  });
  expect(state.before).toBeUndefined();
  expect(state.saved.map(rule => rule.id)).toEqual(["only"]);
  expect(state.reset).toEqual(["down", "degraded", "cpu", "cpu-hot", "latency", "stale"]);
  expect(state.applied).toEqual(["only"]);
  await nextFrames(page);
  await expect(cell(page, "srv-00001", 2).locator(".cx-fmt-icon")).toHaveText("★");
  await expect(page.getByRole("list", { name: "Formatting legend" }).getByRole("listitem")).toHaveCount(1);
  // The remembered state brings the edited rules back after a reload.
  await page.waitForTimeout(400); await page.reload();
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getFormatRules().map(rule => rule.id))).toEqual(["only"]);
});

test("the record drawer formats the fields of targeted columns and its heading for row rules, as it moves", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.openDetails("srv-00005"));
  const drawer = page.locator(".cx-drawer");
  await expect(drawer.locator(".cx-drawer-h")).toHaveClass(/cx-fmt-accent/);
  const field = title => drawer.locator("dt", { hasText: title }).locator("xpath=following-sibling::dd[1]");
  await expect(field("CPU %").locator(".cx-fmt-bar")).toHaveCount(1);
  await expect(field("Latency (ms)")).toHaveClass(/cx-fmt-scale/);
  await page.keyboard.press("ArrowDown"); await nextFrames(page);
  await expect(drawer.locator("h4")).toHaveText("server-006");
  await expect(drawer.locator(".cx-drawer-h")).not.toHaveClass(/cx-fmt-accent/);
  await expect(field("CPU %").locator(".cx-fmt-bar")).toHaveCount(1);
  await page.keyboard.press("ArrowDown"); await nextFrames(page);
  await expect(drawer.locator("h4")).toHaveText("server-007");
  await expect(field("Status")).toHaveClass(/cx-fmt-fill/);
  await expect(field("Status").locator(".cx-sr-only")).toHaveText(", Degraded");
});

test("remote grids evaluate rules on the rows they receive", async ({ page }) => {
  const view = healthView(0); view.source = { kind: "host" }; delete view.rows; view.pageSize = 50;
  const all = healthView(500).rows;
  const script = "window.served=0;CanopyX.configure('health',{source:{query(q){window.served+=q.limit;const rows=" + JSON.stringify(all) +
    ";return {protocol:'canopyx/2',type:'gridPage',view:'health',revision:'r1',offset:q.offset,total:rows.length,matched:rows.length,items:rows.slice(q.offset,q.offset+q.limit)};}}});";
  await open(page, view, { script });
  await expect(row(page, "srv-00005")).toHaveClass(/cx-fmt-row/);
  await expect(cell(page, "srv-00001", 4)).toHaveClass(/cx-fmt-scale/);
  expect(await page.evaluate(() => window.served)).toBeLessThan(500);
});

test("export records carry each cell's format while CSV keeps values and text", async ({ page }) => {
  const view = healthView(); view.reporting = {};
  await open(page, view);
  const result = await page.evaluate(async () => {
    const api = document.querySelector("[data-canopyx-host]").canopyx;
    const snapshot = await api.materializeExport({ scope: "all" });
    const csv = await api.toCsv({ scope: "all" });
    await api.setFormatRules([]);
    return { down: snapshot.rows[5], cpu: snapshot.rows[1].cells.cpu, csv, plain: await api.toCsv({ scope: "all" }) };
  });
  expect(result.down.format).toMatchObject({ rules: ["down"], tone: "danger", icon: "✕", description: "Server is down" });
  expect(result.cpu.format.bar).toEqual({ fraction: 0.37, tone: "info" });
  expect(result.csv).toBe(result.plain);
});

test("print keeps the formatting colours and leaves the legend to the screen", async ({ page }) => {
  await open(page);
  await page.emulateMedia({ media: "print" });
  const printed = await page.evaluate(() => ({ adjust: getComputedStyle(document.querySelector(".cx-cell.cx-fmt-fill")).printColorAdjust,
    legend: getComputedStyle(document.querySelector(".cx-format-legend")).display }));
  expect(printed).toEqual({ adjust: "exact", legend: "none" });
});

test("forced colours keep the non-colour cues and draw accents in system colours", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page);
  await expect(row(page, "srv-00005").locator(".cx-fmt-icon")).toHaveText("✕");
  await expect(row(page, "srv-00003").locator(".cx-cell").nth(1).locator(".cx-fmt-icon")).toBeVisible();
});

test("formatted and plain cached navigation keeps the requested row visible with its global index", async ({ page }) => {
  const view = healthView(1500);
  for (const formatRules of [[], view.formatRules]) {
    await page.unrouteAll(); await open(page, { ...view, formatRules });
    for (let pass = 0; pass < 2; pass++) for (const index of [0, 1100, 64, 1400]) {
      const visible = await page.evaluate(async index => {
        const api = document.querySelector("[data-canopyx-host]").canopyx;
        await api.scrollToRow(index);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const target = document.querySelector('.cx-row[data-cx-id="srv-' + String(index).padStart(5, "0") + '"]');
        if (!target || target.getAttribute("aria-rowindex") !== String(index + 2)) return false;
        const grid = target.closest(".cx-grid"), bounds = target.getBoundingClientRect(), viewport = grid.getBoundingClientRect();
        return bounds.bottom > Math.max(viewport.top, grid.querySelector(".cx-head").getBoundingClientRect().bottom) && bounds.top < viewport.bottom;
      }, index);
      expect(visible).toBe(true);
    }
    expect(page.errors).toEqual([]);
  }
});

test("scroll navigation stays within budget on 100,000 rows with formatting and cached repaints", { tag: "@benchmark" }, async ({ page }) => {
  test.setTimeout(120000);
  const view = healthView(100000);
  view.formatting = { legend: true };
  const measure = async rules => {
    const copy = { ...view, formatRules: rules };
    await page.unrouteAll(); await open(page, copy);
    // The first rows paint after the rules compile and the automatic bounds of the bar and the scale span all 100,000 rows.
    return page.evaluate(async () => {
      const api = document.querySelector("[data-canopyx-host]").canopyx, navigation = [], completeIntervals = [], rafFloor = [];
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (let i = 0; i < 48; i++) {
        const start = performance.now(); await frame(); rafFloor.push(performance.now() - start);
      }
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 24; i++) {
        const index = (i * 4111) % 99000, start = performance.now();
        // Budget the public navigation, rule evaluation and DOM updates. The two explicit settling frames have their
        // own host-dependent cadence; retain the full presentation interval without charging idle frames to evaluation.
        await api.scrollToRow(index); navigation.push(performance.now() - start);
        await frame(); completeIntervals.push(performance.now() - start);
        const target = document.querySelector('.cx-row[data-cx-id="srv-' + String(index).padStart(5, "0") + '"]');
        if (!target || target.getAttribute("aria-rowindex") !== String(index + 2)) throw new Error("Requested row was not rendered: " + index);
        const grid = target.closest(".cx-grid"), bounds = target.getBoundingClientRect(), viewport = grid.getBoundingClientRect();
        const visibleTop = Math.max(viewport.top, grid.querySelector(".cx-head").getBoundingClientRect().bottom);
        if (bounds.bottom <= visibleTop || bounds.top >= viewport.bottom) throw new Error("Requested row is outside the viewport: " + index);
      }
      return { navigation, completeIntervals, rafFloor };
    });
  };
  const plain = await measure([]);
  const formatted = await measure(view.formatRules);
  const base = median(plain.navigation), cost = median(formatted.navigation);
  console.log("formatting budget: median navigation " + cost.toFixed(1) + " ms with rules, " + base.toFixed(1) + " ms without");
  console.log("formatting presentation: median complete interval " + median(formatted.completeIntervals).toFixed(1) + " ms with rules, " +
    median(plain.completeIntervals).toFixed(1) + " ms without; two-RAF floor " + median(formatted.rafFloor).toFixed(1) + "/" + median(plain.rafFloor).toFixed(1) + " ms");
  console.log("formatting samples: " + JSON.stringify({ plain, formatted }));
  expect(cost).toBeLessThan(base * 2 + 12);
  expect(cost).toBeLessThan(60);
});

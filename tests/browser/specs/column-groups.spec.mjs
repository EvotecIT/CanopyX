// Column groups (docs/column-groups.md): multi-level sticky headers with ARIA spans, pins that never split a group,
// priority hiding, group resizing, moves that keep groups together, the nested Columns menu, header moves on the reporting
// runtime and record-drawer sections on phones.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl, nextFrames } from "./support.mjs";
import { budgetView, serveGrid, headerColumns, groupSpans, MONTHS } from "./column-groups-support.mjs";

const budgetApi = "document.querySelector('[data-canopyx-mounted]').canopyx";
async function openBudget(page, name = "quarterly-budget.html") {
  await page.goto(exampleUrl(name));
  await page.waitForFunction(() => document.querySelector("[data-canopyx-mounted]")?.canopyx?.getColumnGroups().length && document.querySelector("[data-cx-ready]"));
}

for (const width of [1440, 390]) for (const scheme of ["light", "dark"]) {
  test(`group rows span their visible columns at ${width} in ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await openBudget(page, scheme === "dark" ? "quarterly-budget-dark.html" : "quarterly-budget.html");
    await nextFrames(page);
    const layout = await page.evaluate(() => {
      const leaves = [...document.querySelectorAll(".cx-head .cx-hrow:not(.cx-hgroup-row) .cx-hcell")];
      return [...document.querySelectorAll(".cx-hgroup")].map(group => {
        const first = +group.getAttribute("aria-colindex") - 1, span = +group.getAttribute("aria-colspan"), box = group.getBoundingClientRect();
        const below = leaves.slice(first, first + span).map(cell => cell.getBoundingClientRect());
        return { id: group.dataset.cxGroup, left: box.left - below[0].left, width: box.width - below.reduce((sum, item) => sum + item.width, 0) };
      });
    });
    for (const group of layout) { expect(Math.abs(group.left), group.id).toBeLessThan(1); expect(Math.abs(group.width), group.id).toBeLessThan(1); }
    // At 390 the phone layout hides the months behind "+N", so their groups give way with them.
    if (width === 390) expect(layout).toEqual([]);
    else expect(layout.map(group => group.id)).toEqual(["h1", "h2", "q1", "q2", "q3", "q4"]);
  });
}

test("header rows carry the ARIA grid structure: rows, column headers, spans and row indexes", async ({ page }) => {
  await openBudget(page);
  const aria = await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".cx-head [role=row]")].map(row => row.getAttribute("aria-rowindex")),
    groups: [...document.querySelectorAll(".cx-hgroup")].map(cell => [cell.getAttribute("role"), cell.getAttribute("aria-colindex"), cell.getAttribute("aria-colspan"), cell.textContent.trim()].join(" ")),
    pads: [...document.querySelectorAll(".cx-hgroup-pad")].every(cell => cell.getAttribute("aria-hidden") === "true" && !cell.hasAttribute("role")),
    firstBody: document.querySelector(".cx-canvas .cx-row").getAttribute("aria-rowindex"),
    count: document.querySelector("[role=grid]").getAttribute("aria-rowcount")
  }));
  expect(aria.rows).toEqual(["1", "2", "3"]);
  expect(aria.groups).toEqual(["columnheader 3 6 First half", "columnheader 9 6 Second half", "columnheader 3 3 Q1", "columnheader 6 3 Q2", "columnheader 9 3 Q3", "columnheader 12 3 Q4"]);
  expect(aria.pads).toBe(true);
  expect(aria.firstBody).toBe("4");
  expect(aria.count).toBe(String(48 + 3));
  const result = await new AxeBuilder({ page }).include(".cx-grid").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.map(item => item.id)).toEqual([]);
});

test("the group rows stay in view while the rows scroll", async ({ page }) => {
  await openBudget(page);
  const before = await page.locator(".cx-hgroup").first().boundingBox();
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollTop = 600; });
  await nextFrames(page);
  const after = await page.locator(".cx-hgroup").first().boundingBox();
  expect(Math.round(after.y)).toBe(Math.round(before.y));
});

test("pinning a column pins its whole top-level group, and the group keeps its pin while the centre scrolls", async ({ page }) => {
  await openBudget(page);
  await page.evaluate(`${budgetApi}.setColumnPinned("may", "left")`);
  await nextFrames(page);
  const pins = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".cx-head .cx-hrow:not(.cx-hgroup-row) .cx-hcell")].map(cell => [cell.dataset.cxColumn, cell.dataset.cxPin || "none"])));
  for (const id of MONTHS.slice(0, 6)) expect(pins[id], id).toBe("left");
  for (const id of MONTHS.slice(6)) expect(pins[id], id).toBe("none");
  expect(await page.locator('.cx-hgroup[data-cx-group="h1"]').getAttribute("data-cx-pin")).toBe("left");
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`)).map(group => group.pin)).toEqual(["left", "none"]);
  const before = await page.locator('.cx-hgroup[data-cx-group="q1"]').boundingBox();
  await page.locator(".cx-grid").evaluate(grid => { grid.scrollLeft = 300; });
  await nextFrames(page);
  expect(Math.round((await page.locator('.cx-hgroup[data-cx-group="q1"]').boundingBox()).x)).toBe(Math.round(before.x));
  await page.evaluate(`${budgetApi}.setColumnPinned("jan", "none")`);
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`)).map(group => group.pin)).toEqual(["none", "none"]);
});

test("a group the pin budget cannot hold scrolls as a whole instead of splitting at the pinned edge", async ({ page }) => {
  const view = budgetView({ columnGroups: [{ id: "year", title: "Year", pinned: "left", columns: MONTHS }] });
  await page.setViewportSize({ width: 900, height: 700 });
  await serveGrid(page, view);
  const pins = await page.evaluate(months => [...document.querySelectorAll(".cx-head .cx-hrow:not(.cx-hgroup-row) .cx-hcell")].filter(cell => months.includes(cell.dataset.cxColumn)).map(cell => cell.dataset.cxPin || "none"), MONTHS);
  expect(new Set(pins).size).toBe(1);
  expect(pins[0]).toBe("none");
  expect(await page.evaluate(() => api.getColumnGroups()[0].pin)).toBe("left");
});

test("a group shrinks to its visible columns and disappears with the last of them", async ({ page }) => {
  await openBudget(page);
  await page.evaluate(`${budgetApi}.setColumnVisible("jan", false)`);
  expect(await groupSpans(page)).toEqual(["h1:5", "h2:6", "q1:2", "q2:3", "q3:3", "q4:3"]);
  await page.evaluate(`${budgetApi}.setColumnGroupVisible("q1", false)`);
  expect(await groupSpans(page)).toEqual(["h1:3", "h2:6", "q2:3", "q3:3", "q4:3"]);
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`))[0].groups[0].visibleColumns).toEqual([]);
  await page.evaluate(`${budgetApi}.setColumnGroupVisible("h1", false); ${budgetApi}.setColumnGroupVisible("h2", false)`);
  await expect(page.locator(".cx-hgroup-row")).toHaveCount(0);
  await expect(page.locator(".cx-canvas .cx-row").first()).toHaveAttribute("aria-rowindex", "2");
  await page.evaluate(`${budgetApi}.setColumnGroupVisible("h1", true)`);
  await expect(page.locator(".cx-hgroup-row")).toHaveCount(2);
});

test("responsive priority hiding shrinks the groups of the columns that give way", async ({ page }) => {
  const view = budgetView();
  view.columns.forEach(column => { if (["feb", "mar", "may", "jun"].includes(column.id)) column.priority = "optional"; });
  await page.setViewportSize({ width: 900, height: 700 });
  await serveGrid(page, view);
  const spans = Object.fromEntries((await groupSpans(page)).map(item => item.split(":")));
  const shown = await headerColumns(page);
  for (const id of ["q1", "q2"]) {
    const visible = (id === "q1" ? ["jan", "feb", "mar"] : ["apr", "may", "jun"]).filter(column => shown.includes(column)).length;
    expect(Number(spans[id] || 0), id).toBe(visible);
  }
  expect(shown).not.toContain("may");
  expect(shown).not.toContain("jun");
});

test("a group's edge resizes its columns together, by keyboard and by pointer", async ({ page }) => {
  await openBudget(page);
  const widths = () => page.evaluate(() => ["jan", "feb", "mar"].map(id => document.querySelector('.cx-head [data-cx-column="' + id + '"]').getBoundingClientRect().width));
  const before = await widths(), grip = page.locator('.cx-hgroup[data-cx-group="q1"] > .cx-resize');
  expect(await grip.getAttribute("role")).toBe("separator");
  expect(await grip.getAttribute("aria-label")).toBe("Resize Q1");
  await grip.focus();
  await page.keyboard.press("Shift+ArrowRight");
  const keyed = await widths();
  expect(keyed.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0)).toBeGreaterThan(45);
  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  const dragged = await widths();
  expect(keyed.reduce((a, b) => a + b, 0) - dragged.reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
  const resizes = await page.evaluate(`${budgetApi}.getState().columns.filter(column => ["jan","feb","mar"].includes(column.id)).map(column => column.sized)`);
  expect(resizes).toEqual([true, true, true]);
});

test("moves keep groups together: a column moved away returns to its group's edge, a moved group moves whole", async ({ page }) => {
  await openBudget(page);
  const order = ["line", "team", "feb", "mar", "apr", "may", "jun", "jul", "jan", "aug", "sep", "oct", "nov", "dec", "total", "reviewed"];
  await page.evaluate(ids => document.querySelector("[data-canopyx-mounted]").canopyx.setColumnOrder(ids), order);
  expect((await headerColumns(page)).slice(2, 5)).toEqual(["feb", "mar", "jan"]);
  const block = ["line", "team", "apr", "may", "jun", "feb", "mar", "jan", ...MONTHS.slice(6), "total", "reviewed"];
  await page.evaluate(ids => document.querySelector("[data-canopyx-mounted]").canopyx.setColumnOrder(ids), block);
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`))[0].groups.map(group => group.id)).toEqual(["q2", "q1"]);
  await page.evaluate(`${budgetApi}.resetColumns()`);
  expect(await headerColumns(page)).toEqual(["line", "team", ...MONTHS, "total", "reviewed"]);
});

test("the Columns menu nests columns under their groups and moves them within their group", async ({ page }) => {
  await openBudget(page);
  await page.locator(".cx-grid-columns > summary").click();
  await page.locator('.cx-grid-column-choice[data-cx-group="q1"]').waitFor();
  expect(await page.evaluate(() => [...document.querySelectorAll(".cx-grid-column-children[role=group]")].map(group => group.getAttribute("aria-label")).join(","))).toBe("First half,Q1,Q2,Second half,Q3,Q4");
  await page.locator('.cx-grid-column-choice[data-cx-column="feb"] input').uncheck();
  expect(await page.locator('.cx-grid-column-choice[data-cx-group="q1"] input').evaluate(input => input.indeterminate)).toBe(true);
  await page.locator('.cx-grid-column-choice[data-cx-group="q1"] input').click();
  expect(await groupSpans(page)).toContain("q1:3");
  await page.locator('.cx-grid-column-choice[data-cx-column="mar"] input').focus();
  await page.keyboard.press("Alt+ArrowDown");
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`))[0].groups[0].columns).toEqual(["jan", "feb", "mar"]);
  await page.locator('.cx-grid-column-choice[data-cx-column="jan"] input').focus();
  await page.keyboard.press("Alt+ArrowDown");
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`))[0].groups[0].columns).toEqual(["feb", "jan", "mar"]);
  await page.locator('.cx-grid-column-choice[data-cx-group="q2"] input').focus();
  await page.keyboard.press("Alt+ArrowUp");
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`))[0].groups.map(group => group.id)).toEqual(["q2", "q1"]);
  expect(await page.evaluate(() => document.activeElement.closest(".cx-grid-column-choice").dataset.cxGroup)).toBe("q2");
  await page.locator('.cx-grid-column-choice[data-cx-group="h2"] input').uncheck();
  expect(await page.locator(".cx-hgroup").evaluateAll(cells => cells.map(cell => cell.dataset.cxGroup))).toEqual(["h1", "q2", "q1"]);
});

test("header moves on the reporting runtime move a group as a whole and keep a column inside its group", async ({ page }) => {
  await openBudget(page, "quarterly-budget-reorder.html");
  const handle = page.locator('.cx-hgroup[data-cx-group="q1"] .cx-column-move');
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  expect((await headerColumns(page)).slice(2, 8)).toEqual(["apr", "may", "jun", "jan", "feb", "mar"]);
  await expect(page.locator(".cx-live")).toHaveText("Q1 moved to position 2");
  expect(await page.evaluate(() => document.activeElement.closest("[data-cx-group]")?.dataset.cxGroup)).toBe("q1");
  // March is last in Q1: moving it right keeps it there.
  await page.locator('.cx-head [data-cx-column="mar"] .cx-column-move').focus();
  await page.keyboard.press("ArrowRight");
  expect((await headerColumns(page)).slice(5, 9)).toEqual(["jan", "feb", "mar", "jul"]);
  // A pointer drag of Second half to the far left lands before First half.
  const from = await page.locator('.cx-hgroup[data-cx-group="h2"] .cx-column-move').boundingBox(), to = await page.locator('.cx-hgroup[data-cx-group="h1"]').boundingBox();
  await page.mouse.move(from.x + 4, from.y + 4); await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 }); await page.mouse.up();
  expect((await page.evaluate(`${budgetApi}.getColumnGroups()`)).map(group => group.id)).toEqual(["h2", "h1"]);
});

test("on a phone each group's title is a section of the record drawer", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openBudget(page);
  await page.locator(".cx-canvas .cx-row").first().locator(".cx-cell").first().tap();
  await page.locator(".cx-drawer").waitFor();
  expect(await page.locator(".cx-drawer-s").allTextContents()).toEqual(["Details", "Q1", "Q2", "Q3", "Q4"]);
  await context.close();
});

test("invalid column groups are reported and the grid keeps plain headers", async ({ page }) => {
  await serveGrid(page, budgetView({ columnGroups: [{ id: "a", title: "A", columns: ["jan"] }, { id: "b", title: "B", columns: ["jan"] }] }));
  expect(await page.evaluate(() => errors.join(" "))).toContain("column groups");
  expect(await page.locator(".cx-hgroup").count()).toBe(0);
});

test("saved views keep the grouped order and the groups' pins", async ({ page }) => {
  await serveGrid(page, budgetView());
  await page.evaluate(() => { api.setColumnPinned("oct", "right"); api.saveView("pinned"); api.resetColumns(); });
  expect(await page.evaluate(() => api.getColumnGroups().map(group => group.pin))).toEqual(["none", "none"]);
  await page.evaluate(() => api.applySavedView("pinned"));
  expect(await page.evaluate(() => api.getColumnGroups().map(group => group.pin))).toEqual(["none", "right"]);
  expect((await headerColumns(page)).slice(-6)).toEqual(MONTHS.slice(6));
});

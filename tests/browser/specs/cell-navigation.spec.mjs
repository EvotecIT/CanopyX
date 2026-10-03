// The cell half of the ARIA tree grid pattern: rows whose cells hold controls can be entered with Right (or F2), and
// Left/Right then move between cells and controls, while row focus stays the default and the grid stays one Tab stop.
import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "cells", label: "Records", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 200, kind: "text" }, { id: "state", title: "State", width: 120, kind: "text" },
    { id: "links", title: "Links", width: 200, kind: "text" }, { id: "note", title: "Note", width: 200, kind: "text" }],
  source: { kind: "inline" },
  roots: [
    { id: "group", label: "Group", expanded: true, cells: { state: "open" }, children: [
      { id: "r1", label: "Record one", cells: { state: "ok", note: "edit" } },
      { id: "r2", label: "Record two", cells: { state: "late", note: "both" } },
      { id: "plain", label: "Plain record" },
      { id: "detail", label: "Detail", detail: { type: "html", height: 2, html: "<p>Changed <button type=\"button\" id=\"detail-action\">Revert</button></p>" } },
      { id: "long", label: "Long detail", detail: { type: "html", height: 2, html: "<p>Line</p>".repeat(12) + "<p><a href=\"#more\">More</a></p>" } },
      { id: "form", label: "Form", detail: { type: "html", height: 2, html: "<p><input aria-label=\"Reason\"> <button type=\"button\">Save</button></p>" } }] },
    { id: "after", label: "After" }] };

// A host that draws controls into three columns: a button, two links, and a text box.
const hostScript = `CanopyX.configure("cells", { renderers: {
  state(node, el) { if (!node.cells || !node.cells.state) return false; const b = document.createElement("button"); b.type = "button";
    b.textContent = "State " + node.cells.state; b.onclick = () => { window.clicks = (window.clicks || 0) + 1; }; el.appendChild(b); return true; },
  links(node, el) { if (!node.cells) return false; ["Open", "History"].forEach((text) => { const a = document.createElement("a");
    a.href = "#" + node.id + "-" + text.toLowerCase(); a.textContent = text + " " + node.id; el.appendChild(a);
    a.addEventListener("keydown", (e) => { if (window.hostOwnsArrows && e.key === "ArrowRight") e.preventDefault(); }); }); return true; },
  note(node, el) { if (!node.cells || !node.cells.note) return false; if (node.cells.note === "both") { const ref = document.createElement("a");
    ref.href = "#ref"; ref.textContent = "Ref " + node.id; el.appendChild(ref); } const input = document.createElement("input");
    input.setAttribute("aria-label", "Note " + node.id); input.value = "abc"; el.appendChild(input); return true; } } });`;

async function open(page) {
  const html = viewPage(view).replace("</head>", () => "<script>" + hostScript + "</script></head>")
    .replace('<body class="cx-page">', '<body class="cx-page"><a href="#before" id="before-tree">Before tree</a>')
    .replace("</body>", '<button type="button" id="after-tree">After tree</button></body>');
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
/** What has focus: the row, a cell (by column), or a control (by its text or name). */
const focused = (page) => page.evaluate(() => {
  const active = document.activeElement;
  if (active.classList.contains("cx-row")) return "row " + active.getAttribute("data-cx-id");
  if (active.classList.contains("cx-cell")) return "cell " + active.closest(".cx-row").getAttribute("data-cx-id") + " " + active.getAttribute("aria-colindex");
  return (active.textContent || active.getAttribute("aria-label") || active.tagName).trim();
});

test("Right enters a row's cells at its first control, and Left and Right walk the cells and their controls", async ({ page }) => {
  await open(page);
  await row(page, "r1").locator(".cx-text").first().click();
  expect(await focused(page)).toBe("row r1");
  const steps = [
    ["ArrowRight", "State ok"], ["ArrowRight", "Open r1"], ["ArrowRight", "History r1"],
    // A text box uses the arrow keys itself: arrows stop at its cell, Enter goes in, and Escape comes back out.
    ["ArrowRight", "cell r1 4"], ["Enter", "Note r1"], ["ArrowLeft", "Note r1"], ["Escape", "cell r1 4"],
    ["ArrowLeft", "History r1"], ["ArrowLeft", "Open r1"], ["ArrowLeft", "State ok"], ["ArrowLeft", "cell r1 1"], ["ArrowLeft", "row r1"]];
  for (const [key, expected] of steps) {
    await page.keyboard.press(key);
    expect(await focused(page), key + " should reach " + expected).toBe(expected);
  }
  // Home and End go to the first and last cell; Escape returns to the row.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  expect(await focused(page)).toBe("cell r1 4");
  await page.keyboard.press("Home");
  expect(await focused(page)).toBe("cell r1 1");
  await page.keyboard.press("F2");
  expect(await focused(page)).toBe("row r1");
});

test("Up and Down keep the column, and leave cells for a row that has none of its own", async ({ page }) => {
  await open(page);
  await row(page, "r1").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("Open r1");
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("cell r2 3");
  await page.keyboard.press("ArrowUp");
  expect(await focused(page)).toBe("cell r1 3");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("cell plain 3");
  // The detail row below has one cell: focus goes to the row.
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("row detail");
});

test("row focus stays the default: Right still opens and enters, and a row without controls stays a row", async ({ page }) => {
  await open(page);
  await row(page, "group").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("row r1");
  await row(page, "plain").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("row plain");
  // F2 reaches the controls of a row that is open, where Right goes to its first child.
  await row(page, "group").locator(".cx-text").first().click();
  await page.keyboard.press("F2");
  expect(await focused(page)).toBe("State open");
  await page.keyboard.press("Escape");
  expect(await focused(page)).toBe("row group");
});

test("controls keep their own keys, and the grid stays one Tab stop", async ({ page }) => {
  await open(page);
  // Controls in cells are out of the Tab order: Tab from a row leaves the grid.
  expect(await page.evaluate(() => [...document.querySelectorAll(".cx-row .cx-cell :is(a, button, input)")].every((c) => c.tabIndex === -1))).toBe(true);
  await row(page, "r1").locator(".cx-text").first().click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "After tree", exact: true })).toBeFocused();

  // Enter on a button presses the button; it neither selects nor toggles the row.
  await row(page, "r2").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("State late");
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  expect(await page.evaluate(() => window.clicks)).toBe(2);
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "false");

  // A plain cell acts as its row: Enter selects.
  await row(page, "r2").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  expect(await focused(page)).toBe("cell r1 1");
  await page.keyboard.press("Enter");
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
});

test("the controls of a detail row are reached with Right and left with Left", async ({ page }) => {
  await open(page);
  await row(page, "detail").click({ position: { x: 5, y: 5 } });
  expect(await focused(page)).toBe("row detail");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("Revert");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("row detail");
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("row long");
});

test("a detail that scrolls is a region the arrow keys scroll, after its controls, and not a Tab stop", async ({ page }) => {
  await open(page);
  await row(page, "long").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("More");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.classList.contains("cx-detail-body"))).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => document.activeElement.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  expect(await focused(page)).toBe("cell long 1");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("More");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("row long");
});

test("a click after cell navigation is a row click again, and a repaint keeps focus in its cell", async ({ page }) => {
  await open(page);
  await row(page, "r1").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Home");
  expect(await focused(page)).toBe("cell r1 1");
  // The cell cell navigation made focusable is not a host control: clicking it selects the row, and row keys work.
  await row(page, "r1").locator('[aria-colindex="1"]').click();
  expect(await focused(page)).toBe("row r1");
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("row r2");

  // A host-drawn cell is rebuilt when the row repaints; focus goes back to the same control.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("Open r2");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.refresh());
  await expect.poll(() => focused(page)).toBe("Open r2");

  // A control that handles an arrow key itself keeps it.
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("History r2");
  await page.evaluate(() => { window.hostOwnsArrows = true; });
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("History r2");
});

test("a control a narrow cell clips scrolls into view inside its cell, and the cell scrolls back when focus leaves", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setColumnWidth("links", 90));
  const cell = row(page, "r1").locator('[aria-colindex="3"]');
  /** How far the focused control lies outside the cell's visible box (under a pixel when it is inside), and the cell's scroll. */
  const clipping = () => cell.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const inner = document.activeElement.getBoundingClientRect();
    const start = outer.left + element.clientLeft;
    return { outside: Math.max(0, start - inner.left) + Math.max(0, inner.right - (start + element.clientWidth)), scroll: element.scrollLeft };
  });
  await row(page, "r1").locator(".cx-text").first().click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("Open r1");
  expect((await clipping()).outside).toBeLessThan(1);
  // The second link starts past the 90 pixels of the cell.
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("History r1");
  const shown = await clipping();
  expect(shown.outside).toBeLessThan(1);
  expect(shown.scroll).toBeGreaterThan(0);
  // Back to the first link: the cell scrolls back far enough to show it.
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("Open r1");
  expect((await clipping()).outside).toBeLessThan(1);
  await page.keyboard.press("ArrowRight");
  expect((await clipping()).scroll).toBeGreaterThan(0);
  // Leaving the cell, to the next cell or to the row, shows it from its start again.
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("cell r1 4");
  expect(await cell.evaluate((element) => element.scrollLeft)).toBe(0);
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("History r1");
  await page.keyboard.press("Escape");
  expect(await focused(page)).toBe("row r1");
  expect(await cell.evaluate((element) => element.scrollLeft)).toBe(0);
});

test("Shift+Tab from a cell or a control in a row leaves the grid in one step, as from the row", async ({ page }) => {
  await open(page);
  const outsideRows = () => page.evaluate(() => !document.activeElement.closest(".cx-row"));
  const describe = () => page.evaluate(() => { const active = document.activeElement; return active.className + "|" + active.getAttribute("data-cx-id") + "|" + (active.closest(".cx-hcell") || {}).dataset?.cxColumn; });
  // From the row: the element before the grid's tab stop.
  await row(page, "r1").locator(".cx-text").first().click();
  await page.keyboard.press("Shift+Tab");
  expect(await outsideRows(), await describe()).toBe(true);
  const fromRow = await describe();
  // From a control, and from a cell, focus lands on that same element, not on the row.
  for (const keys of [["ArrowRight"], ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"]]) {
    await row(page, "r1").locator(".cx-text").first().click();
    for (const key of keys) await page.keyboard.press(key);
    expect(await focused(page)).toBe(keys.length === 1 ? "State ok" : "cell r1 4");
    await page.keyboard.press("Shift+Tab");
    expect(await outsideRows()).toBe(true);
    expect(await describe()).toBe(fromRow);
  }
  // The row is still the grid's tab stop: Tab comes back to it.
  await expect(row(page, "r1")).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("row r1");
  // The same from a control in a detail row.
  await row(page, "detail").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("Revert");
  await page.keyboard.press("Shift+Tab");
  expect(await outsideRows()).toBe(true);
  expect(await describe()).toBe(fromRow);
});

test("a control after a text box, in the same cell or the same detail, can be reached", async ({ page }) => {
  await open(page);
  await row(page, "r2").locator(".cx-text").first().click();
  const steps = [["ArrowRight", "State late"], ["ArrowRight", "Open r2"], ["ArrowRight", "History r2"], ["ArrowRight", "Ref r2"],
    // The cell stands for the text box: Enter goes in, Escape comes out, and Left goes on from there.
    ["ArrowRight", "cell r2 4"], ["Enter", "Note r2"], ["Escape", "cell r2 4"], ["ArrowLeft", "Ref r2"], ["ArrowRight", "cell r2 4"]];
  for (const [key, expected] of steps) {
    await page.keyboard.press(key);
    expect(await focused(page), key + " should reach " + expected).toBe(expected);
  }

  await row(page, "form").click({ position: { x: 5, y: 5 } });
  for (const [key, expected] of [["ArrowRight", "cell form 1"], ["ArrowRight", "Save"], ["ArrowLeft", "cell form 1"], ["Enter", "Reason"],
    ["Escape", "cell form 1"], ["ArrowRight", "Save"], ["ArrowLeft", "cell form 1"], ["ArrowLeft", "row form"]]) {
    await page.keyboard.press(key);
    expect(await focused(page), key + " should reach " + expected).toBe(expected);
  }
});

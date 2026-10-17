// When the columns do not fit, long free text gives way first: dates, short names and states keep their whole width while
// the long path and description columns, still wider than their minimum, take the cut. Flat grids and trees share the rule.
import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";
import { pinTestFont, testFontState } from "./visual-font.mjs";

const description = "Keeps the policy of the team with its history, its approvals and the notes of every review that changed it over the years";
const columns = [
  { id: "created", title: "Created", kind: "datetime" }, { id: "modified", title: "Modified", kind: "datetime" },
  { id: "owner", title: "Owner", kind: "text" }, { id: "status", title: "Status", kind: "text" },
  { id: "path", title: "Path", kind: "text" }, { id: "description", title: "Description", kind: "text", minWidth: 100 }];
const cells = i => ({ created: "2026-01-0" + (i % 9 + 1) + "T09:00:00Z", modified: "2026-02-1" + (i % 9) + "T17:30:00Z", owner: i % 2 ? "Operations team" : "Finance team",
  status: i % 3 ? "Published" : "In review", path: "/library/operations/policies/review-" + i + "/the-final-approved-version.docx", description: description + " " + i });
const grid = { protocol: "canopyx/2", type: "grid", id: "shrink", label: "Documents", pageSize: 50, selection: "single", search: false, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text" }, ...columns], rows: Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, cells: { name: "Document " + i, ...cells(i) } })) };
const tree = { protocol: "canopyx/2", type: "view", id: "shrink", label: "Documents", pageSize: 50, selection: "single", source: { kind: "inline" },
  columns: [{ id: "name", title: "Name" }, ...columns],
  roots: Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, label: "Document " + i, cells: cells(i) })) };

/** Each column's width and how many of its row cells cut their text off. */
const columnFit = page => page.evaluate(() => {
  const heads = [...document.querySelectorAll(".cx-hcell")], rows = [...document.querySelectorAll(".cx-row[data-cx-id]")];
  const cut = element => [element, ...element.querySelectorAll("*")].some(item => item.scrollWidth > item.clientWidth + 1 && getComputedStyle(item).overflow !== "visible");
  return Object.fromEntries(heads.map((head, index) => {
    const cell = rows[0]?.querySelectorAll(".cx-cell")[index], text = cell?.querySelector(".cx-text"), style = cell && getComputedStyle(cell);
    const font = style && style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    return [head.dataset.cxColumn, {
      width: Math.round(head.getBoundingClientRect().width), cut: rows.filter(row => cut(row.querySelectorAll(".cx-cell")[index])).length,
      sample: cell && { text: text?.textContent, font, padding: [style.paddingLeft, style.paddingRight],
        cellWidth: cell.clientWidth, textWidth: text?.clientWidth, textScroll: text?.scrollWidth, variant: style.fontVariantNumeric }
    }];
  }));
});

for (const font of ["system", "bundled Inter"]) for (const [name, view] of [["flat grid", grid], ["tree", tree]]) for (const width of [1100, 1440]) {
  test("a " + name + " keeps its dates whole while long text gives way (" + width + ", " + font + ")", async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    if (font === "bundled Inter") await pinTestFont(page);
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    if (font === "bundled Inter") {
      expect((await testFontState(page)).atMount).toBe("loaded");
      // This font exposes the difference: fitting must reserve the tabular digits the cells actually render.
      const advances = await page.evaluate(() => {
        const cell = document.querySelector('.cx-row[data-cx-id] .cx-cell'), probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;";
        const style = getComputedStyle(cell);
        probe.style.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
        probe.textContent = "1111111111";
        document.body.appendChild(probe);
        const width = variant => { probe.style.fontVariantNumeric = variant; return probe.getBoundingClientRect().width; };
        const result = { proportional: width("normal"), tabular: width("tabular-nums"), variant: getComputedStyle(cell).fontVariantNumeric };
        probe.remove();
        return result;
      });
      expect(advances.variant).toContain("tabular-nums");
      expect(advances.tabular).toBeGreaterThan(advances.proportional + 1);
    }
    await expect.poll(async () => (await columnFit(page)).description?.width ?? 0).toBeGreaterThan(0);
    const fit = await columnFit(page);
    // The columns do not fit whole: the long text is cut, and it is still wider than its minimum.
    expect(fit.description.cut).toBeGreaterThan(0);
    expect(fit.description.width).toBeGreaterThan(100);
    expect(fit.path.width).toBeGreaterThan(100);
    // Dates, short names and states stay whole.
    for (const id of ["created", "modified", "owner", "status"]) expect(fit[id].cut, JSON.stringify({ id, ...fit[id] })).toBe(0);
    expect(await page.locator(".cx-grid").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

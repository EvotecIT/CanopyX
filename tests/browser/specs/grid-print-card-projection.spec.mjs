import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

for (const reporting of [false, true]) for (const mode of ["hidden", "explicit", "private"]) {
  test(`card print preserves its visible template without adding hidden fields (${reporting ? "reporting" : "grid"}, ${mode})`, async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.parent.printedCards = document.documentElement.outerHTML; }; });
    const view = { protocol: "canopyx/2", type: "grid", id: "card-print", label: "Work items", source: { kind: "inline" },
      rowHeight: 30, pageSize: 10, selection: "multiple", search: true,
      layout: { mode: "cards" }, cardTemplate: { name: "{name} — {status}" }, ...(reporting ? { reporting: {} } : {}),
      columns: [{ id: "name", title: "Name", kind: "text", width: 200 },
        { id: "status", title: "Status", kind: "text", width: 120, hidden: true, ...(mode === "private" ? { exportable: false } : {}) },
        { id: "due", title: "Due", kind: "text", width: 120 }],
      rows: [{ id: "one", cells: { name: "First", status: mode === "private" ? "PRIVATE" : "Needs review", due: "Monday" } }] };
    await page.route("http://canopyx.test/card-print-projection", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/card-print-projection"); await page.waitForSelector("[data-cx-ready]");
    await expect(page.locator(".cx-card-slot").first()).toHaveText("First — " + (mode === "private" ? "PRIVATE" : "Needs review"));
    const printed = await page.evaluate(async mode => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      await grid.print({ scope: "all", ...(mode === "explicit" ? { columns: ["name"] } : {}) });
      const doc = new DOMParser().parseFromString(window.printedCards, "text/html");
      return { exportColumns: grid.prepareExport({ scope: "all" }).request.columns.map(column => column.id),
        headings: [...doc.querySelectorAll("dt")].map(item => item.textContent), first: doc.querySelector("dd").textContent,
        text: doc.body.textContent, frames: document.querySelectorAll("iframe").length };
    }, mode);
    expect(printed.headings).toEqual(mode === "explicit" ? ["Name"] : ["Name", "Due"]);
    expect(printed.exportColumns).toEqual(["name", "due"]);
    expect(printed.first).toBe(mode === "private" ? "First" : "First — Needs review");
    expect(printed.text).not.toContain("PRIVATE"); expect(printed.frames).toBe(0);
  });
}

for (const target of ["name", "status", "blocked", "visible"]) {
  test(`card print tokens do not acquire secondary presenter text (${target})`, async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.parent.printedCards = document.documentElement.outerHTML; }; });
    const view = { protocol: "canopyx/2", type: "grid", id: "card-presenter", label: "Work items", source: { kind: "inline" },
      rowHeight: 30, pageSize: 10, selection: "multiple", search: true, reporting: {},
      layout: { mode: "cards" }, cardTemplate: { name: "{name} — {status}" },
      columns: [{ id: "name", title: "Name", kind: "text", width: 200 },
        { id: "status", title: "Status", kind: "text", width: 120, hidden: true },
        { id: "private", title: "Private", kind: "text", width: 120, hidden: true, exportable: false }],
      rows: [{ id: "one", cells: { name: "First", status: "Needs review", private: "PRIVATE" } }] };
    view.columns.find(column => column.id === (target === "blocked" ? "name" : target === "visible" ? "status" : target)).presenter = { kind: "identifier", secondaryColumn: "private" };
    if (target === "blocked") view.columns.find(column => column.id === "status").exportable = false;
    if (target === "visible") {
      view.columns.find(column => column.id === "status").hidden = false;
      view.columns.find(column => column.id === "private").exportable = true;
      view.rows[0].cells.private = "CONTEXT";
      view.formatRules = [{ id: "name-tone", column: "name", style: { tone: "warning" } }];
    }
    await page.route("http://canopyx.test/card-presenter-print", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("http://canopyx.test/card-presenter-print"); await page.waitForSelector("[data-cx-ready]");
    await expect(page.locator(".cx-card-slot").first()).toHaveText("First — Needs review");
    const printed = await page.evaluate(async () => {
      await document.querySelector("[data-canopyx-host]").canopyx.print({ scope: "all" });
      const doc = new DOMParser().parseFromString(window.printedCards, "text/html");
      return { first: doc.querySelector("dd").textContent, values: [...doc.querySelectorAll("dd")].map(item => item.textContent), text: doc.body.textContent };
    });
    expect(printed.first).toBe(target === "blocked" ? "First" : "First — Needs review"); expect(printed.text).not.toContain("PRIVATE");
    if (target === "visible") expect(printed.values[1]).toBe("Needs review\nCONTEXT");
  });
}

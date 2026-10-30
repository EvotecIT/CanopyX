// A grid document with a missing or invalid field fails with a message that names the field, not a TypeError from inside the
// runtime: the source is checked before anything reads it (reporting options included), and each sizing field has its own message.
import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

const VIEW = { protocol: "canopyx/2", type: "grid", id: "devices", label: "Devices", pageSize: 50, selection: "single",
  columns: [{ id: "name", title: "Name", kind: "text" }], source: { kind: "inline" }, rows: [{ id: "a", cells: { name: "A" } }] };

for (const runtime of ["grid", "reporting"]) {
  test.describe(runtime + " runtime", () => {
    test.beforeEach(async ({ page }) => {
      const { script, style } = runtimeAssets(runtime);
      await page.route("http://canopyx.test/errors.html", route => route.fulfill({ contentType: "text/html",
        body: "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Errors</title><style>" + style + "</style><script>" + script + "</script></head><body></body></html>" }));
      await page.goto("http://canopyx.test/errors.html");
    });

    const failure = (page, view) => page.evaluate(view => {
      try { CanopyX.createDataGrid(document.body.appendChild(document.createElement("div")), { view }); return null; } catch (error) { return error.message; }
    }, view);
    const without = name => { const view = { ...VIEW }; delete view[name]; return view; };

    test("a missing source names source, even with reporting options", async ({ page }) => {
      expect(await failure(page, without("source"))).toContain("a grid needs source");
      if (runtime === "reporting") expect(await failure(page, { ...without("source"), reporting: { grouping: { columns: ["name"] } } })).toContain("a grid needs source");
      expect(await failure(page, { ...VIEW, source: { kind: "remote" } })).toContain("a grid needs source");
    });

    test("pageSize, selection and row heights each name themselves", async ({ page }) => {
      expect(await failure(page, without("pageSize"))).toContain("pageSize");
      expect(await failure(page, { ...VIEW, pageSize: 0 })).toContain("pageSize");
      expect(await failure(page, without("selection"))).toContain("selection");
      expect(await failure(page, { ...VIEW, rowHeight: 8 })).toContain("rowHeight");
      expect(await failure(page, { ...VIEW, estimatedRowHeight: 8 })).toContain("estimatedRowHeight");
      expect(await failure(page, VIEW)).toBeNull();
    });
  });
}

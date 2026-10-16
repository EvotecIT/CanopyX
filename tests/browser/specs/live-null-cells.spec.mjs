import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage } from "./support.mjs";

for (const operation of ["add", "update", "setRows", "batched addition", "hosted update", "missing-cell update"]) {
  test(`nullable cells reach row activation as explicit null after ${operation}`, async ({ page }, info) => {
    const hosted = operation === "hosted update", batched = operation === "batched addition", consoleErrors = [];
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const row = { id: "a", cells: { host: "Server A", load: 7, site: "Oslo" } };
    if (operation === "missing-cell update") delete row.cells.site;
    const view = { protocol: "canopyx/2", type: "grid", id: "nullable", label: "Servers", rowHeight: 34, pageSize: 50, selection: "none", search: true,
      live: { batchMs: batched ? 60000 : 0 }, source: { kind: hosted ? "host" : "inline" },
      columns: [{ id: "host", title: "Host", kind: "text" }, { id: "load", title: "Load", kind: "number" }, { id: "site", title: "Site", kind: "text" }],
      ...(hosted ? {} : { rows: [row] }) };
    const html = viewPage(view).replace("</head>", `<script>
      window.activations = []; window.emptySites = 0;
      CanopyX.configure("nullable", {
        onRowActivate: ({ row }) => {
          window.activations.push({ own: Object.hasOwn(row.cells, "site"), site: row.cells.site, type: typeof row.cells.site });
          if (row.cells.site !== null) row.cells.site.toUpperCase(); else window.emptySites++;
          return false;
        },
        ${hosted ? `source: { query: query => ({ protocol: "canopyx/2", type: "gridPage", view: "nullable", revision: "r1", offset: query.offset,
          total: 1, matched: 1, items: [${JSON.stringify(row)}] }) }` : ""}
      });
      </script></head>`);
    await page.route("http://127.0.0.1:8997/", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://127.0.0.1:8997/");
    await page.waitForFunction(() => document.querySelector("[data-canopyx-host]")?.canopyx);
    await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
    const id = await page.evaluate(async operation => {
      const api = document.querySelector("[data-canopyx-host]").canopyx;
      if (operation === "add") { await api.addRows([{ id: "b", cells: { host: "Server B", load: 9, site: null } }]); return "b"; }
      if (operation === "setRows") await api.setRows([{ id: "a", cells: { host: "Server A", load: 7, site: null } }]);
      else if (operation === "batched addition") {
        const adding = api.addRows([{ id: "b", cells: { host: "Server B", load: 9, site: "Rome" } }]);
        const clearing = api.updateRows([{ id: "b", cells: { site: null } }]);
        await new Promise(resolve => setTimeout(resolve, 0)); await api.flushTransactions(); await Promise.all([adding, clearing]); return "b";
      } else await api.updateRows([{ id: "a", cells: { site: null } }]);
      return "a";
    }, operation);
    const record = page.locator(`.cx-row[data-cx-id="${id}"]`);
    await record.focus(); await page.keyboard.press("Enter");
    const outcome = await page.evaluate(() => ({ activations: window.activations, emptySites: window.emptySites }));
    await info.attach("row-activation-result", { body: JSON.stringify({ outcome, consoleErrors }, null, 2), contentType: "application/json" });
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, `${info.project.name}-${operation.replaceAll(" ", "-")}.png`) });
    expect(outcome).toEqual({ activations: [{ own: true, site: null, type: "object" }], emptySites: 1 });
    expect(consoleErrors).toEqual([]);
  });
}

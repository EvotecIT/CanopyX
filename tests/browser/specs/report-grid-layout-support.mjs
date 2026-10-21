import fs from "node:fs";
import path from "node:path";
import { runtimeAssets, repo, nextFrames } from "./support.mjs";

/** Three report rows with preferred text widths, long headers, and toned pills. */
export function reportLayoutView() {
  return { protocol: "canopyx/2", type: "grid", id: "layout", label: "Review queue", rowHeight: 36, pageSize: 100,
    selection: "single", search: true, reporting: { columnReorder: true }, source: { kind: "inline" },
    columns: [
      { id: "name", title: "Record", kind: "text", width: 240, sortable: true },
      { id: "group", title: "Responsible team", kind: "text", width: 260 },
      { id: "state", title: "Latest verification outcome", kind: "text", presenter: { kind: "enum" }, sortable: true },
      { id: "review", title: "Recommended follow-up decision", kind: "text", presenter: { kind: "enum" } },
      { id: "count", title: "Observations requiring attention", kind: "number" }
    ], rows: [
      { id: "a", cells: { name: "Warehouse inventory", group: "Operations", state: { value: "Needs investigation", tone: "warning" }, review: { value: "Schedule review", tone: "info" }, count: 12 } },
      { id: "b", cells: { name: "Quarterly service review", group: "Service delivery", state: { value: "Action required", tone: "danger" }, review: { value: "Awaiting confirmation", tone: "warning" }, count: 7 } },
      { id: "c", cells: { name: "Regional capacity check", group: "Planning", state: { value: "Verified", tone: "success" }, review: { value: "No follow-up", tone: "success" }, count: 0 } }
    ] };
}

// Local worker proof can exercise the owned source parts before the integration owner assembles assets.
// Normal CI uses the shipped runtime, so it also proves asset assembly and embedding.
function layoutAssets() {
  const assets = runtimeAssets("reporting");
  if (process.env.CANOPYX_LAYOUT_SOURCE === "1") {
    const dir = path.join(repo, "CanopyX.Html/Assets/canopyx.grid.source");
    const start = assets.script.indexOf("const HEIGHT_RENDER="), end = assets.script.indexOf("function validateGridHighlights(", start);
    if (start < 0 || end < 0) throw new Error("The grid layout source boundary changed.");
    assets.script = assets.script.slice(0, start) + ["32-grid-auto-height.js", "33-column-fit-core.js", "33-grid-column-fit.js"]
      .map(file => fs.readFileSync(path.join(dir, file), "utf8")).join("\n") + "\n" + assets.script.slice(end);
    assets.style += "\n" + fs.readFileSync(path.join(dir, "canopyx.css"), "utf8");
  }
  return assets;
}

export async function mountReportLayout(page, { view = reportLayoutView(), width = 1086, theme = "light", hidden = false,
  viewport = { width: 1440, height: 900 }, classic = false, assets = layoutAssets() } = {}) {
  await page.setViewportSize(viewport);
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  await page.route("http://canopyx.test/report-layout", route => route.fulfill({ contentType: "text/html", body:
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Report grid layout</title><style>${assets.style}
    body { margin:0;padding:40px 24px;background:${theme === "dark" ? "#121820" : "#f4f6f9"};color:${theme === "dark" ? "#e5eaf1" : "#263346"};font:15px system-ui; }
    main { max-width:1086px;margin:auto; } h1 { font-size:24px;margin:0 0 8px; } p { margin:0 0 24px; }
    ${classic ? ".cx-data-grid .cx-grid { scrollbar-width:auto; } .cx-data-grid .cx-grid::-webkit-scrollbar { width:17px;height:17px; }" : ".cx-data-grid .cx-grid { scrollbar-width:none; }"}
    </style><script>${assets.script}</script></head><body><main><h1>Review queue</h1>
    <p>Three records, preferred text widths, and complete status labels.</p>
    <div id="frame" style="width:${width}px;max-width:100%;${hidden ? "display:none;" : ""}"><div class="cx-host" data-canopyx-host
    data-cx-theme="${theme}" style="height:480px"><script type="application/json" class="cx-config">${json}</script></div></div>
    <script>window.api=()=>document.querySelector('[data-canopyx-host]').canopyx;</script></main></body></html>` }));
  await page.goto("http://canopyx.test/report-layout");
  if (!hidden) { await page.evaluate(() => api().ready); await nextFrames(page); await nextFrames(page); }
}

export async function layoutGeometry(page) {
  return page.evaluate(() => {
    const grid = document.querySelector(".cx-grid"), rows = [...grid.querySelectorAll(".cx-row")], style = getComputedStyle(grid);
    return { clientWidth: grid.clientWidth, scrollWidth: grid.scrollWidth, clientHeight: grid.clientHeight, scrollHeight: grid.scrollHeight,
      scrollbar: grid.offsetHeight - grid.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
      rows: rows.length, bottom: rows.at(-1)?.getBoundingClientRect().bottom, visibleBottom: grid.getBoundingClientRect().top + grid.clientTop + grid.clientHeight,
      widths: Object.fromEntries([...grid.querySelectorAll(".cx-hcell")].map(cell => [cell.dataset.cxColumn, cell.getBoundingClientRect().width])),
      clippedPills: [...grid.querySelectorAll(".p-pill,.p-state")].filter(pill => {
        const cell = pill.closest(".cx-cell"), pad = getComputedStyle(cell), box = pill.getBoundingClientRect(), parent = cell.getBoundingClientRect();
        return pill.scrollWidth > pill.clientWidth + 1 || box.right > parent.right - parseFloat(pad.paddingRight) + 1 || box.left < parent.left;
      }).length };
  });
}

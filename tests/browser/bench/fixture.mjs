// Synthetic scroll fixture: a nine-column list shaped like a large report explorer, with groups of rows, icons,
// badges, tones, muted "not collected" cells, and dates. Deterministic, so runs on different machines compare.

const ICON = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\"><path fill=\"currentColor\" d=\"M3 1h7l3 3v11H3V1Zm1.5 1.5v11h7V5H9V2.5H4.5Z\"/></svg>";
const STATUS = [["Enabled", "success"], ["Partly disabled", "warning"], ["Disabled", "muted"]];
const FINDING = [["critical", "danger"], ["high", "danger"], ["medium", "warning"], ["low", "info"]];

/** A small linear congruential generator, so the fixture does not depend on Math.random. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function scrollView(groups, perGroup) {
  const next = random(20260927);
  const roots = [];
  for (let g = 0; g < groups; g++) {
    const children = [];
    for (let i = 0; i < perGroup; i++) {
      const status = STATUS[Math.floor(next() * STATUS.length)];
      const changes = Math.floor(next() * 4) === 0 ? Math.floor(next() * 9) : 0;
      const links = Math.floor(next() * 400);
      const enforced = Math.floor(next() * 5);
      const day = 1 + Math.floor(next() * 27);
      const finding = next() < 0.35 ? FINDING[Math.floor(next() * FINDING.length)] : null;
      const node = {
        id: "g" + g + "-" + i,
        label: "Policy " + String(g * perGroup + i).padStart(5, "0") + " " + ["Baseline", "Workstation", "Server", "Kiosk"][i % 4],
        kind: "item",
        icon: "item",
        cells: {
          status: { value: status[0], tone: status[1] },
          changed: "2026-09-" + String(day).padStart(2, "0") + "T" + String(Math.floor(next() * 24)).padStart(2, "0") + ":15:00Z",
          by: next() < 0.3 ? { value: null, text: "not collected", tone: "muted" } : "admin" + Math.floor(next() * 40),
          changes: changes ? { value: changes, tone: "warning" } : { value: 0, tone: "muted" },
          links: { value: links, badges: enforced ? [{ text: "E " + enforced, tone: "danger", title: "Enforced links" }] : [] },
          affected: Math.floor(next() * 9000) + " / " + Math.floor(next() * 40000),
          wmi: next() < 0.2 ? "WMI filter " + Math.floor(next() * 12) : { value: null, text: "none", tone: "muted" },
          finding: finding ? { value: finding[0], text: finding[0] + ": setting drift", tone: finding[1] } : null
        }
      };
      if (changes) {
        node.badges = [{ text: changes + " changed", tone: "warning" }];
      }
      children.push(node);
    }
    roots.push({ id: "g" + g, label: "Group " + (g + 1), kind: "group", group: true, expanded: true, hasChildren: true, childCount: perGroup, cells: { changes: { value: groups, text: String(perGroup) + " items" } }, children: children });
  }
  return {
    protocol: "canopyx/1", type: "view", id: "bench", label: "Scroll benchmark", rowHeight: 28, pageSize: Math.max(groups, perGroup), selection: "single",
    columns: [
      { id: "name", title: "Name", width: 330, kind: "text", sortable: true },
      { id: "status", title: "Status", width: 120, kind: "text" },
      { id: "changed", title: "Last changed", width: 150, kind: "datetime" },
      { id: "by", title: "Changed by", width: 140, kind: "text" },
      { id: "changes", title: "Changes", width: 90, kind: "number" },
      { id: "links", title: "Links", width: 110, kind: "number" },
      { id: "affected", title: "Affected", width: 130, kind: "text" },
      { id: "wmi", title: "WMI filter", width: 130, kind: "text" },
      { id: "finding", title: "Worst finding", width: 220, kind: "text" }
    ],
    icons: { item: ICON },
    source: { kind: "inline" },
    roots: roots
  };
}

/** A standalone page with the runtime and stylesheet inlined. */
export function pageHtml(script, style, view) {
  const json = JSON.stringify(view).replace(/</g, "\\" + "u003c");
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>CanopyX scroll benchmark</title><style>" + style
    + "</style><script>" + script + "</script></head><body class=\"cx-page\"><div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\">"
    + "<script type=\"application/json\" class=\"cx-config\">" + json + "</script></div></body></html>";
}

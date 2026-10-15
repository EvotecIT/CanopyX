// Shared fixtures for the grouping and detail-row browser tests: a generic "orders by region" data set.
import { viewPage, nextFrames } from "./support.mjs";

export const api = "document.querySelector('[data-canopyx-host]').canopyx";
const regions = ["North", "South", "East", "West"], statuses = ["Open", "Shipped", "Closed"], products = ["Desk", "Chair", "Lamp", "Shelf", "Monitor", "Cable"];

/** Orders spread over regions and statuses; each order has two to four lines and a deterministic amount. */
export function orders(count = 48) {
  return Array.from({ length: count }, (_, i) => {
    const lines = Array.from({ length: 2 + i % 3 }, (_, j) => {
      const quantity = 1 + (i + j) % 5, price = 20 + (i * 7 + j * 13) % 90;
      return { id: "o" + i + "-l" + j, cells: { product: products[(i + j) % products.length], quantity, price, total: quantity * price } };
    });
    const amount = lines.reduce((sum, line) => sum + line.cells.total, 0);
    return { id: "o" + String(i).padStart(3, "0"), cells: { order: "SO-" + (1000 + i), customer: "Customer " + String.fromCharCode(65 + i % 26),
      region: regions[i % regions.length], status: statuses[Math.floor(i / 4) % statuses.length], amount, items: lines.length,
      placed: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }, detail: { type: "grid", rows: lines } };
  });
}

/** The order lines grid every detail row shows. */
export const linesView = { protocol: "canopyx/2", type: "grid", id: "order-lines", label: "Order lines", source: { kind: "inline" }, rows: [],
  pageSize: 50, selection: "none", toolbar: { search: false, filters: false, views: false, export: false, more: false },
  columns: [{ id: "product", title: "Product", kind: "text", sortable: true }, { id: "quantity", title: "Quantity", kind: "number", sortable: true },
    { id: "price", title: "Price", kind: "number", sortable: true }, { id: "total", title: "Total", kind: "number", sortable: true }] };

export function definition(extra = {}) {
  return { protocol: "canopyx/2", type: "grid", id: "orders", label: "Orders by region", source: { kind: "inline" }, rowHeight: 34, pageSize: 100,
    selection: "multiple", search: true, statusBar: true,
    reporting: { groupBy: [{ column: "region", direction: "asc" }, { column: "status", direction: "asc" }], groupable: true, columnReorder: true,
      aggregates: [{ id: "total", column: "amount", operation: "sum", label: "Total amount" }, { id: "average", column: "amount", operation: "average", label: "Average amount" },
        { id: "orders", column: "order", operation: "count", label: "Orders" }],
      detail: { view: linesView }, selectionControls: true },
    columns: [{ id: "order", title: "Order", kind: "text", sortable: true }, { id: "customer", title: "Customer", kind: "text", sortable: true },
      { id: "region", title: "Region", kind: "text", sortable: true }, { id: "status", title: "Status", kind: "text", sortable: true },
      { id: "placed", title: "Placed", kind: "datetime", sortable: true }, { id: "items", title: "Lines", kind: "number", sortable: true },
      { id: "amount", title: "Amount", kind: "number", sortable: true, numberFormat: { decimals: 1 } }],
    rows: orders(), ...extra };
}

/** Serves a view page (with optional setup script before the runtime mounts) and waits for its first painted page. */
export async function open(page, view = definition(), setup = "", theme = "light") {
  await page.route("http://canopyx.test/orders", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace("</head>", "<script>" + setup + "</script></head>").replace('data-cx-theme="light"', 'data-cx-theme="' + theme + '"') }));
  await page.goto("http://canopyx.test/orders"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}

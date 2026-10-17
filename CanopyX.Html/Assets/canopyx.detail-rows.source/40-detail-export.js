  // ---------- detail rows in exports and print snapshots ----------
  // Exports and print snapshots carry data, never the live DOM. A record's detail goes with it as a table, a property list
  // or trusted HTML: the record's own payload, a nested grid's rows or a tree's roots as a table (tree levels indented), or
  // what the host's detail.export(record) returns. Requests mark details: true. Print and exports include details unless the
  // definition says print: false or the call passes includeDetails: false; formats that cannot hold them skip them.
  const DETAIL_REQUEST = GRID_REPORTING.exportRequest, DETAIL_RECORD = GRID_REPORTING.exportRecord;
  GRID_REPORTING.exportRequest = (grid, options) => {
    const extra = DETAIL_REQUEST?.(grid, options) || {};
    if (options.includeDetails !== undefined && typeof options.includeDetails !== "boolean") throw new Error("CanopyX: includeDetails is a boolean.");
    return grid.detailEnabled?.() && (options.includeDetails ?? grid.view.reporting?.detail?.print !== false) ? { ...extra, details: true } : extra;
  };
  GRID_REPORTING.exportRecord = (grid, request, row) => {
    const record = DETAIL_RECORD(grid, request, row);
    if (!request.details || !grid.hasDetail(row)) return record;
    const detail = grid.detailExport(row);
    return detail ? gridFreeze({ ...record, detail }) : record;
  };
  Object.assign(DataGrid.prototype, {
    detailExport(row) {
      const options = this.opts.detail || {}, view = this.view.reporting?.detail?.view;
      let payload = typeof options.export === "function" ? options.export(gridFreeze(JSON.parse(JSON.stringify(row)))) : row.detail;
      if (payload == null) return null;
      if (payload.type === "grid" && view?.type === "grid" || payload.type === "tree" && view?.type === "view") {
        const columns = view.columns.filter(column => !column.hidden), rows = [];
        const fmt = formatting(this.lang, view.timeZone === "local", labelsFor(view.labels, this.opts.labels));
        const text = (cells, column) => cellText(cells?.[column.id], column, fmt);
        if (payload.type === "grid") for (const item of payload.rows || []) rows.push(columns.map(column => text(item.cells, column)));
        else {
          const walk = (nodes, level) => { for (const node of nodes || []) {
            rows.push(columns.map((column, index) => index ? text(node.cells, column) : "  ".repeat(level) + (Object.hasOwn(node.cells || {}, column.id) ? text(node.cells, column) : node.label)));
            walk(node.children, level + 1);
          } };
          walk(payload.roots, 0);
        }
        payload = { type: "table", columns: columns.map(column => column.title), rows };
      }
      if (!payload || typeof payload !== "object" || !["table", "properties", "html"].includes(payload.type)) return null;
      return gridFreeze(JSON.parse(JSON.stringify(payload)));
    }
  });

  const FOOTER_PAGE = Symbol("footer-page");
  function validateFooters(grid) {
    const footers = grid.view.footers || [], ids = new Set();
    if (!Array.isArray(footers) || footers.length > 16 || footers.length && grid.cursor)
      throw new Error("CanopyX: footers need offset navigation and at most 16 rows.");
    for (const footer of footers) {
      requireIdentifier(footer?.id, "footer ID");
      if (ids.has(footer.id) || typeof footer.label !== "string" || !footer.label.trim() || footer.label.length > 512 ||
          !["page", "all"].includes(footer.scope) || !Array.isArray(footer.aggregates) || !footer.aggregates.length || footer.aggregates.length > 32)
        throw new Error("CanopyX: invalid footer row.");
      ids.add(footer.id); const aggregates = new Set();
      for (const aggregate of footer.aggregates) {
        requireIdentifier(aggregate?.id, "footer aggregate ID");
        const column = grid.view.columns.find(column => column.id === aggregate.column), custom = !GROUP_OPERATIONS.includes(aggregate.operation);
        if (!column || aggregates.has(aggregate.id) || typeof aggregate.label !== "string" || !aggregate.label.trim() || aggregate.label.length > 512 ||
            typeof aggregate.operation !== "string" || !/^[a-z][a-zA-Z\d]{0,31}$/.test(aggregate.operation) ||
            ["sum", "average", "minimum", "maximum"].includes(aggregate.operation) && column.kind !== "number" ||
            custom && grid.view.source.kind === "inline" && !grid.groupAggregates.has(aggregate.operation))
          throw new Error("CanopyX: invalid footer aggregate or missing custom aggregate plugin.");
        aggregates.add(aggregate.id);
      }
    }
    groupSummaryAggregates(grid.view);
  }
  GRID_OPTIONS.page = async (grid, query, signal, page) => {
    if (!grid.view.footers?.length || signal !== grid.dataLifetime.signal) return page;
    const current = grid.pendingQuery || grid.acceptedQuery;
    if (!current || gridResultShape(current) !== gridResultShape(query)) return page;
    const suppliedRows = page.footerValues;
    if (suppliedRows !== undefined) {
      if (!suppliedRows || typeof suppliedRows !== "object" || Array.isArray(suppliedRows)) throw new Error("CanopyX: invalid footer values.");
      for (const [id, entries] of Object.entries(suppliedRows)) {
        const footer = grid.view.footers.find(footer => footer.id === id);
        if (!footer || !entries || typeof entries !== "object" || Array.isArray(entries) || Object.keys(entries).some(key => !footer.aggregates.some(aggregate => aggregate.id === key)))
          throw new Error("CanopyX: footer values require declared rows and aggregates.");
      }
    }
    const values = Object.create(null), inline = grid.view.source.kind === "inline";
    let ordered;
    if (inline) ordered = query.groupBy?.length ? GRID_OPTIONS.groupRows(grid.view, query) :
      gridQueryRows(grid.view, query, new Map(grid.view.columns.map(column => [column.id, column])), GRID_REPORTING.compare?.(grid.view));
    for (const footer of grid.view.footers) {
      const supplied = page.footerValues?.[footer.id], cells = values[footer.id] = Object.create(null);
      const count = footer.scope === "all" || !grid.paged ? page.matched : Math.min(grid.pendingPaging?.pageLength || grid.pageLength, page.matched - query.offset);
      // Inline data is complete; a host snapshot must supply totals over records outside its returned window.
      const rows = inline ? footer.scope === "all" || !grid.paged ? ordered : ordered.slice(query.offset, query.offset + count) :
        footer.scope === "page" && count <= page.items.length ? page.items.slice(0, count) : null;
      for (const aggregate of footer.aggregates) {
        const explicit = supplied && Object.hasOwn(supplied, aggregate.id);
        const value = explicit ? supplied[aggregate.id] : rows && (GROUP_OPERATIONS.includes(aggregate.operation) || grid.groupAggregates.has(aggregate.operation)) ?
          groupAggregateValue(grid, aggregate, rows, 0, rows.length) : undefined;
        if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
            groupCounting(aggregate.operation) && value !== undefined && (!validStructuralCount(value) || value > count) ||
            count === 0 && !groupCounting(aggregate.operation) && value !== undefined && value !== null)
          throw new Error("CanopyX: invalid footer aggregate value.");
        cells[aggregate.id] = value;
      }
    }
    gridOperationActive(grid, signal);
    return { ...page, [FOOTER_PAGE]: { query, values } };
  };
  const FOOTER_STORE = DataGrid.prototype.storePage;
  DataGrid.prototype.storePage = function(page) {
    const result = FOOTER_STORE.call(this, page), candidate = page[FOOTER_PAGE];
    if (candidate && this.acceptedQuery && page.revision === this.snapshot.revision &&
        candidate.query.offset === this.acceptedQuery.offset && gridResultShape(candidate.query) === gridResultShape(this.acceptedQuery))
      this.footerCandidate = { ...candidate, page };
    return result;
  };
  const FOOTER_RENDER = DataGrid.prototype.render;
  DataGrid.prototype.render = function() {
    FOOTER_RENDER.call(this);
    if (this.view.footers?.length && this.acceptedQuery && this.footerCandidate &&
        this.footerCandidate.page.revision === this.snapshot.revision && this.footerCandidate.query.offset === this.acceptedQuery.offset && gridResultShape(this.footerCandidate.query) === gridResultShape(this.acceptedQuery)) renderFooters(this);
  };
  function footerAggregateText(grid, footer, aggregate) {
    const column = grid.view.columns.find(column => column.id === aggregate.column), value = grid.footerCandidate.values[footer.id][aggregate.id];
    const format = aggregate.format || (groupCounting(aggregate.operation) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : column.format);
    return aggregate.label + ": " + (value === undefined ? "Unavailable" : value === null ? "—" : numberText(value, grid.lang, format));
  }
  function renderFooters(grid) {
    const key = JSON.stringify([grid.acceptedQuery, grid.footerCandidate.values, grid.cols.map(column => [column.id, column.renderWidth ?? column.width, column.effectivePin, column.pinOffset])]);
    grid.headCells.forEach((cell, index) => { cell.id ||= grid.id + "-footer-column-" + index; });
    const bodyCount = (grid.rowProjection?.rowCount() ?? grid.rowCount()) + 1 + (grid.headDepth || 0) + (grid.summaryControls?.parentElement === grid.grid ? 1 : 0);
    grid.grid.setAttribute("aria-rowcount", String(bodyCount + grid.view.footers.length));
    if (grid.footerRoot) [...grid.footerRoot.children].forEach((row, index) => row.setAttribute("aria-rowindex", String(bodyCount + index + 1)));
    if (grid.footerKey === key) return;
    grid.footerKey = key;
    const root = grid.footerRoot ||= grid.grid.appendChild(h("div", "cx-footers"));
    root.setAttribute("role", "rowgroup"); root.setAttribute("aria-label", "Footer totals"); root.replaceChildren();
    for (const [footerIndex, footer] of grid.view.footers.entries()) {
      const row = h("div", "cx-footer-row"); row.setAttribute("role", "row"); row.setAttribute("data-cx-footer", footer.id); row.setAttribute("aria-rowindex", String(bodyCount + footerIndex + 1));
      row.style.width = grid.rowWidth + "px"; row.style.minWidth = "100%";
      const label = h("span", "cx-footer-label"); setText(label, footer.label); label.id = grid.id + "-footer-label-" + footerIndex;
      row.setAttribute("aria-label", footer.label); row.appendChild(label);
      for (const [columnIndex, column] of grid.cols.entries()) {
        const cell = h("div", "cx-cell cx-footer-cell" + (column.className ? " " + column.className : ""));
        cell.setAttribute("role", "gridcell"); cell.setAttribute("data-cx-column", column.id); cell.style.width = (column.renderWidth ?? column.width) + "px";
        grid.applyColumnPin(cell, column);
        cell.style.textAlign = column.alignment || (column.kind === "number" ? "end" : "start");
        const parts = footer.aggregates.filter(aggregate => aggregate.column === column.id).map(aggregate => footerAggregateText(grid, footer, aggregate));
        const text = h("span"); text.id = grid.id + "-footer-value-" + footerIndex + "-" + columnIndex;
        parts.forEach((part, index) => {
          if (index) text.appendChild(document.createTextNode(" · "));
          const lead = h("span", "cx-footer-kind"), value = h("strong"), at = part.indexOf(": ");
          setText(lead, part.slice(0, at + 2)); setText(value, part.slice(at + 2)); text.append(lead, value);
        }); cell.appendChild(text);
        let extra;
        if (columnIndex === 0) {
          const hidden = footer.aggregates.filter(aggregate => !grid.cols.some(column => column.id === aggregate.column));
          if (hidden.length) {
            extra = h("span", "cx-footer-hidden"); extra.id = text.id + "-hidden";
            setText(extra, hidden.map(aggregate => grid.view.columns.find(column => column.id === aggregate.column).title + " — " + footerAggregateText(grid, footer, aggregate)).join(" · "));
            cell.appendChild(extra);
          }
        }
        cell.setAttribute("aria-colindex", String(columnIndex + 1));
        cell.setAttribute("aria-labelledby", grid.headCells[columnIndex].id + " " + label.id + " " + text.id + (extra ? " " + extra.id : ""));
        cell.title = [footer.label, ...parts].join(" — ");
        row.appendChild(cell);
      }
      const filler = h("div", "cx-footer-fill"); filler.setAttribute("aria-hidden", "true"); row.appendChild(filler);
      root.appendChild(row);
    }
    if (grid.summaryControls) grid.summaryControls.style.bottom = root.offsetHeight + "px";
  }

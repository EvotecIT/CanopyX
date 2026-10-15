  // ---------- keys on headings, controls while a query is pending, and group outlines in exports ----------
  // On a heading, Right expands (or, when expanded, moves to its first row), Left collapses (or, when collapsed, moves to
  // the heading of the outer group), and Enter or Space toggles. Up, Down and the Page keys walk the projection.
  const GROUP_QUERY = DataGrid.prototype.setQuery;
  Object.assign(DataGrid.prototype, {
    projectedRowKey(event, row) {
      if (!row.group) return false;
      const cell = event.target.closest(".cx-cell");
      if (cell && event.target === cell && ["Enter", " "].includes(event.key)) {
        if (event.key === "Enter") this.focusCell(row, this.rowCells(cell.parentElement).indexOf(cell), 0, true);
        event.preventDefault(); return true;
      }
      // Group rows use synthetic ordinals: the shared cell keys move within the heading without focusing a record.
      if (cell && (["ArrowLeft", "ArrowRight", "Home", "End", "Escape", "F2"].includes(event.key) ||
          event.target !== cell && ["Enter", " "].includes(event.key))) return TreeGrid.prototype.onCellKey.call(this, event);
      if (event.key === "F2") { this.focusCell(row, 0, 0, true); event.preventDefault(); return true; }
      if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return false;
      if (event.target.closest("button,input,select") && ["Enter", " "].includes(event.key)) return true;
      event.preventDefault();
      if (this.pendingQuery) return true;
      const collapsed = this.collapsedGroups.has(row.group.key), rows = this.rowProjection;
      if (event.key === "ArrowRight" && !collapsed && this.groupTree) { const next = rows.rowItem(rows.indexOf(row) + 1); if (next) this.focusProjected(next); return true; }
      if (event.key === "ArrowLeft" && collapsed && this.groupTree && row.level > 1) {
        for (let index = rows.indexOf(row) - 1; index >= 0; index--) {
          const outer = rows.rowItem(index);
          if (outer?.group && outer.level < row.level) { this.setFocus(outer, true); break; }
        }
        return true;
      }
      this.setGroupCollapsed(row.group.key, event.key === "ArrowLeft" ? true : event.key === "ArrowRight" ? false : !collapsed);
      this.setFocus(this.focused, true);
      return true;
    },
    focusProjected(target) {
      if (target.group || target.status === "detail") this.setFocus(target, true);
      else this.focusResult(target._ri, true).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
    },
    setQuery(input, paging) {
      const pending = GROUP_QUERY.call(this, input, paging);
      const sync = () => {
        if (this.destroyed || !this.rowsAttached) return;
        for (const control of this.canvas.querySelectorAll(".cx-grid-group-toggle,.cx-grid-group-select,.cx-detail-toggle")) control.disabled = !!this.pendingQuery;
        this.syncGroupBar();
      };
      sync(); pending.then(sync, sync); return pending;
    }
  });
  // Exports of the filtered result carry the accepted grouping: its levels, the column titles and the nested groups with
  // their record ranges, values, display text and aggregates, so a format can write outline levels. Record exports of the
  // selection or of all records carry none, as their records are not the summary's.
  const GROUP_REQUEST = GRID_REPORTING.exportRequest;
  GRID_REPORTING.exportRequest = (grid, options) => {
    const extra = GROUP_REQUEST?.(grid, options) || {};
    if (options.scope !== "filtered" || !grid.summary || !grid.groupLevels?.length) return extra;
    const levels = grid.groupLevels.map(level => ({ ...level, title: grid.columns.find(column => column.id === level.column).title }));

    const nested = (groups, depth) => groups.map(group => {
      const column = grid.columns.find(item => item.id === levels[depth].column);
      return { key: group.key, value: group.value, offset: group.offset, count: group.count, aggregates: group.aggregates,
        text: group.value === null ? grid.labels.gridGroupMissing : formatValue(group.value, column.kind, grid.fmt), ...(group.groups ? { groups: nested(group.groups, depth + 1) } : {}) };
    });
    return { ...extra, grouping: { levels, aggregates: grid.view.reporting.aggregates || [], totals: grid.summary.aggregates, groups: nested(grid.summary.groups, 0) } };
  };

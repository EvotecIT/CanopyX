  // ---------- one bounded loaded-content measurement shared by initial and explicit fitting ----------
  const CONTENT_WIDTHS = DataGrid.prototype.applyWidths, CONTENT_SET_WIDTH = DataGrid.prototype.setColumnWidth,
    CONTENT_HEADER = DataGrid.prototype.buildHeader, CONTENT_RESIZE = DataGrid.prototype.startResize;
  DataGrid.prototype.buildHeader = function () {
    CONTENT_HEADER.call(this);
    this.headCells.forEach((cell, index) => cell.querySelector(".cx-resize").addEventListener("keydown", event => {
      if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) this.cols[index].autoWidth = false;
    }, true));
  };
  DataGrid.prototype.startResize = function (event, column) {
    if (!this.destroyed && event.button === 0) column.autoWidth = false;
    return CONTENT_RESIZE.call(this, event, column);
  };
  DataGrid.prototype.applyWidths = function (widths) {
    this.fitInitialColumns();
    return CONTENT_WIDTHS.call(this, widths);
  };
  DataGrid.prototype.setColumnWidth = function (id, width) {
    const column = this.columns.find(item => item.id === id);
    if (column && Number.isFinite(width)) column.autoWidth = false;
    return CONTENT_SET_WIDTH.call(this, id, width);
  };
  Object.assign(DataGrid.prototype, {
    measureGridColumn(column) {
      const context = document.createElement("canvas").getContext("2d"), style = getComputedStyle(this.grid);
      if (!context) throw new Error("CanopyX: text measurement is unavailable.");
      context.font = style.font || style.fontSize + " " + style.fontFamily;
      let width = context.measureText(column.title.slice(0, 2048)).width + 76, sampled = 0;
      for (const row of this.rowCache.values()) {
        if (sampled === 200) break;
        width = Math.max(width, context.measureText(cellText(row.h.cells[column.id], column, this.fmt).slice(0, 2048)).width + 32); sampled++;
      }
      const policy = this.columnLayouts?.get(column.id);
      width = Math.max(policy?.minimum || 40, Math.min(policy?.maximum || MAX_COLUMN_WIDTH, Math.ceil(Math.min(800, width))));
      return Object.freeze({ width, sampled, scope: "loaded" });
    },
    fitInitialColumns() {
      if (!this.acceptedQuery || this.pendingQuery || this.restoringEpoch === this.queryEpoch ||
          !this.columns.some(column => column.autoWidth) || !this.hasGridSize()) return;
      for (const column of this.columns) if (column.autoWidth) {
        column.width = this.measureGridColumn(column).width; column.autoWidth = false;
        const saved = this.defaultState.columns.find(item => item.id === column.id);
        if (saved) saved.width = column.width;
      }
    },
    autoFitColumn(id) {
      const column = this.columns.find(item => item.id === id);
      if (!column || this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.hasGridSize())
        throw new Error("CanopyX: auto-fit needs a visible grid, a declared column and an accepted query.");
      const result = this.measureGridColumn(column); this.setColumnWidth(id, result.width); return result;
    },
    autoFitColumns() {
      return Object.freeze(Object.fromEntries(this.columns.map(column => [column.id, this.autoFitColumn(column.id)])));
    }
  });
